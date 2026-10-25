import { mkdir, readFile, stat, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { MAX_MODEL_BYTES, shipIdPattern } from '../web/armor-format.js'

export const defaultModelBase = 'https://model-ships.wows.shinoaki.com/model-ships/'

/** 生成器与可选预览服务共用模型缓存，校验内容并合并同一实例内的并发请求。 */
export function createModelCache({ root, modelBase = defaultModelBase, fetchModel = fetch }) {
  const base = new URL(modelBase.endsWith('/') ? modelBase : `${modelBase}/`)
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) throw new Error('模型源必须是无凭据、无查询参数的 HTTP(S) 目录地址')
  const cache = join(root, '.cache', 'models', createHash('sha256').update(base.href).digest('hex').slice(0, 16))
  const pending = new Map()
  return async function cachedModel(id) {
    if (!shipIdPattern.test(id)) throw Object.assign(new Error('无效舰船编号'), { status: 400 })
    if (pending.has(id)) return pending.get(id)
    const task = (async () => {
      await mkdir(cache, { recursive: true })
      const target = join(cache, `${id}.zst`), infoPath = join(cache, `${id}.json`)
      try {
        const info = JSON.parse(await readFile(infoPath, 'utf8'))
        if ((await stat(target)).size === info.bytes && info.bytes <= MAX_MODEL_BYTES) {
          const bytes = await readFile(target)
          if (createHash('sha256').update(bytes).digest('hex') === info.sha256) return { target, info, cached: true }
        }
      } catch { /* 缓存缺失、损坏或未写完时重新下载。 */ }
      const url = new URL(`${id}.zst`, base)
      const response = await fetchModel(url, { signal: AbortSignal.timeout(90000), redirect: 'error' })
      if (!response.ok) throw Object.assign(new Error(`模型源返回 HTTP ${response.status}`), { status: response.status === 404 ? 404 : 502 })
      if (Number(response.headers.get('content-length')) > MAX_MODEL_BYTES) throw Object.assign(new Error('模型超过大小限制'), { status: 413 })
      const chunks = []
      let size = 0
      const reader = response.body.getReader()
      try {
        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          size += value.length
          if (size > MAX_MODEL_BYTES) throw Object.assign(new Error('模型超过大小限制'), { status: 413 })
          chunks.push(value)
        }
      } finally { await reader.cancel().catch(() => {}) }
      const bytes = Buffer.concat(chunks)
      if (bytes.length < 12 || ![0xfd2fb528, 0x46546c67].includes(bytes.readUInt32LE(0))) throw Object.assign(new Error('模型源没有返回 GLB 或 Zstandard 文件'), { status: 502 })
      const temporary = `${target}.${randomUUID()}.tmp`
      await writeFile(temporary, bytes)
      await rename(temporary, target)
      const info = { source: url.href, fetchedAt: new Date().toISOString(), bytes: size, etag: response.headers.get('etag'),
        sha256: createHash('sha256').update(bytes).digest('hex') }
      await writeFile(infoPath, JSON.stringify(info))
      return { target, info, cached: false }
    })()
    pending.set(id, task)
    try { return await task } finally { pending.delete(id) }
  }
}
