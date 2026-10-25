import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs'
import { join, resolve } from 'node:path'

export function readTranslations(path) {
  const data = JSON.parse(readFileSync(path, 'utf8'))
  const dictionary = data.zh_sg || data
  if (!dictionary || typeof dictionary !== 'object' || Array.isArray(dictionary) ||
      !Object.entries(dictionary).some(([key, value]) => key.startsWith('IDS_') && typeof value === 'string')) {
    throw new Error('翻译文件需为含 zh_sg 的 lang.json 或 IDS_ 词条字典')
  }
  return dictionary
}

/** 公共参数与词条固定到同一提交；本地参数可指定同版本词条。失败时明确回退。 */
export async function prepareTranslations(options, input, root) {
  if (options.translations) {
    const path = resolve(options.translations)
    return { path, dictionary: readTranslations(path), provenance: { locale: 'zh_sg', input: path,
      sha256: createHash('sha256').update(readFileSync(path)).digest('hex') } }
  }
  try {
    const api = 'https://api.github.com/repos/wowsinfo/data'
    const get = async url => {
      const response = await fetch(url, { headers: { 'User-Agent': 'iwarship-anylize' }, signal: AbortSignal.timeout(20000) })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return response
    }
    const revision = input.provenance.revision || (await (await get(`${api}/commits/${encodeURIComponent(options.ref || 'master')}`)).json()).sha
    if (!/^[a-f0-9]{40}$/.test(revision)) throw new Error('词条提交编号无效')
    const metadata = await (await get(`${api}/contents/live/app/lang/lang.json?ref=${revision}`)).json()
    if (!Number.isInteger(metadata.size) || metadata.size > 32 * 1024 * 1024 || !/^[a-f0-9]{40}$/.test(metadata.sha)) throw new Error('词条文件信息无效')
    const directory = join(root, '.cache', 'translations', revision)
    const path = join(directory, 'lang.json')
    const valid = bytes => bytes.length === metadata.size && createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex') === metadata.sha
    if (!existsSync(path) || !valid(readFileSync(path))) {
      console.log(`下载简体中文词条 zh_sg：${(metadata.size / 1e6).toFixed(2)} MB`)
      const bytes = Buffer.from(await (await get(`https://raw.githubusercontent.com/wowsinfo/data/${revision}/live/app/lang/lang.json`)).arrayBuffer())
      if (!valid(bytes)) throw new Error('词条下载校验失败')
      mkdirSync(directory, { recursive: true })
      const temporary = `${path}.${process.pid}.tmp`
      writeFileSync(temporary, bytes)
      renameSync(temporary, path)
    }
    return { path, dictionary: readTranslations(path), provenance: { locale: 'zh_sg', revision, gitBlob: metadata.sha,
      versionMatched: Boolean(input.provenance.revision) } }
  } catch (error) {
    console.warn(`简体中文词条不可用：${error.message}；使用内部名称，可通过 --translations 指定本地词条`)
    return { dictionary: {}, provenance: { locale: 'zh_sg', error: error.message } }
  }
}
