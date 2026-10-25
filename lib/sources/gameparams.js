import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, createReadStream, statSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'

async function requestJSON(url) {
  const response = await fetch(url, { headers: { 'User-Agent': 'iwarship-anylize', Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(60000) })
  if (!response.ok) throw new Error(`下载失败 HTTP ${response.status}: ${url}`)
  return response.json()
}

/** 固定到提交并校验 Git blob，避免缓存跨版本混用。 */
export async function prepareGameParams(options, outputRoot) {
  if (options.gameparams) {
    const path = resolve(options.gameparams)
    const limit = 512 * 1024 * 1024
    const sizeError = () => new Error('GameParams 输入超过 512 MiB，请使用 GameParams.data 或单区域 JSON')
    if (statSync(path).size > limit) throw sizeError()
    const hash = createHash('sha256')
    let bytes = 0
    for await (const chunk of createReadStream(path)) {
      bytes += chunk.length
      if (bytes > limit) throw sizeError()
      hash.update(chunk)
    }
    const sha256 = hash.digest('hex')
    return { path, gameVersion: options['game-version'], provenance: { input: path, sha256, versionOrigin: 'user' } }
  }
  const api = 'https://api.github.com/repos/wowsinfo/data'
  const commit = await requestJSON(`${api}/commits/${encodeURIComponent(options.ref)}`)
  const revision = commit.sha
  if (!/^[a-f0-9]{40}$/.test(revision)) throw new Error('公开数据提交信息无效')
  const metadata = await requestJSON(`${api}/contents/live/GameParams.data?ref=${revision}`)
  if (!Number.isInteger(metadata.size) || !/^[a-f0-9]{40}$/.test(metadata.sha)) throw new Error('公开数据文件信息无效')
  const cacheDir = join(outputRoot, '.cache', 'gameparams', revision)
  const path = join(cacheDir, 'GameParams.data')
  const valid = bytes => bytes.length === metadata.size && createHash('sha1')
    .update(`blob ${bytes.length}\0`).update(bytes).digest('hex') === metadata.sha
  if (!existsSync(path) || !valid(readFileSync(path))) {
    console.log(`下载公开 GameParams.data：${(metadata.size / 1e6).toFixed(2)} MB，提交 ${revision.slice(0, 12)}`)
    let bytes
    try {
      const response = await fetch(metadata.download_url, { signal: AbortSignal.timeout(20000) })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      bytes = Buffer.from(await response.arrayBuffer())
    } catch {
      const blob = await requestJSON(`${api}/git/blobs/${metadata.sha}`)
      bytes = Buffer.from(blob.content, 'base64')
    }
    if (!valid(bytes)) throw new Error('GameParams 下载校验失败')
    mkdirSync(cacheDir, { recursive: true })
    const temporary = `${path}.${process.pid}.tmp`
    writeFileSync(temporary, bytes)
    renameSync(temporary, path)
  }
  const version = commit.commit?.message?.match(/\b\d+\.\d+\.\d+\.\d+\.\d+\b/)?.[0]
  return { path, gameVersion: options['game-version'] || version || `commit-${revision.slice(0, 12)}`,
    provenance: { repository: 'https://github.com/wowsinfo/data', revision, gitBlob: metadata.sha,
      versionOrigin: options['game-version'] ? 'user' : version ? 'commit-message' : 'commit-id' } }
}

/** 逐条消费筛选后的 JSONL，不在 Node 中载入数百 MB 的中间 JSON。 */
export async function readGameParams(input, options, categories, onEvent) {
  const script = fileURLToPath(new URL('../../scripts/read-gameparams.py', import.meta.url))
  const child = spawn(options.python, ['-X', 'utf8', script, input.path, '--regions', JSON.stringify(options.regions),
    '--ships', JSON.stringify(options.ships), '--categories', JSON.stringify(categories)], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
  let errors = ''
  child.stderr.on('data', chunk => { errors = (errors + chunk.toString()).slice(-8000) })
  const completion = new Promise((resolveDone, reject) => {
    child.once('error', error => reject(new Error(`无法启动 ${options.python}，GameParams 需要 Python 3.10+：${error.message}`)))
    child.once('close', code => code === 0 ? resolveDone() : reject(new Error(`GameParams 读取失败：${errors || `退出码 ${code}`}`)))
  })
  // 在读取 stdout 期间注册拒绝处理，防止子进程启动失败产生未处理拒绝。
  completion.catch(() => {})
  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity })
  try {
    for await (const line of lines) if (line) await onEvent(JSON.parse(line))
    await completion
  } catch (error) {
    child.kill()
    await completion.catch(() => {})
    throw error
  } finally { lines.close() }
}
