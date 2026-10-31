import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createInterface } from 'node:readline'

/** 舰船资源目录：/content/gameplay/<国家>/ship/<舰种>/<目录>/…。 */
const shipDirectory = /^\/content\/gameplay\/([^/]+)\/ship\/[^/]+\/([^/]+)\//
/** 只有玩法资源会影响模型与外观，界面与音频资源与模型无关。 */
const modelScope = /^\/content\/gameplay\//
/** 玩法资源按国家划分；国家内的部件变化只影响本国舰船。 */
const nationOf = path => path.match(/^\/content\/gameplay\/([^/]+)\//)?.[1] || 'common'

/**
 * 客户端资源目录名与 GameParams 里的舰船编号不是同一套编号：
 * PASA020 对应目录 ASA013_Essex_1945，PJSD706 对应 JSD013_Fubuki_1942。
 * 因此指纹以资源目录名为键，舰船与目录的对应关系由导出日志给出。
 */

/** 指纹结构变化时必须重新采集，缓存里保存结构版本。 */
const ASSET_INDEX_VERSION = 3

const digest = value => createHash('sha256').update(value).digest()
const empty = () => ({ hash: Buffer.alloc(32), count: 0 })

/** 指纹与条目顺序无关：逐条哈希后做异或累加，并记录条目数量。 */
function accumulate(target, key, path, crc32) {
  const entry = digest(`${path}:${crc32}`)
  const previous = target.get(key) || empty()
  for (let index = 0; index < 32; index++) previous.hash[index] ^= entry[index]
  previous.count += 1
  target.set(key, previous)
}

/** 合并两个累加器，用于把通用资源并入国家级资源。 */
function merge(left, right) {
  const result = empty()
  for (let index = 0; index < 32; index++) result.hash[index] = (left?.hash[index] || 0) ^ (right?.hash[index] || 0)
  result.count = (left?.count || 0) + (right?.count || 0)
  return result
}

const fingerprint = entry => (entry && entry.count ? `${entry.hash.toString('hex')}:${entry.count}` : null)

/** 解析 metadata CSV 的 path 与 crc32 两列，其余列不参与指纹。 */
function parseRow(row) {
  const comma = row.indexOf(',')
  if (comma < 0) return null
  const path = row.slice(0, comma)
  const rest = row.slice(comma + 1)
  const crc32 = rest.slice(rest.lastIndexOf(',') + 1).trim()
  return { path, crc32 }
}

/**
 * 汇总舰船资源目录指纹与国家级共享资源指纹。
 * 舰船自身资源变化、或本国部件资源变化时，该目录的判据随之改变。
 */
export async function summarizeMetadata(file) {
  const directories = new Map()
  const directoryNations = new Map()
  const nationShared = new Map()
  const lines = createInterface({ input: createReadStream(file, { encoding: 'utf8' }), crlfDelay: Infinity })
  let header = true
  for await (const row of lines) {
    if (header) { header = false; continue }
    if (!row) continue
    const parsed = parseRow(row)
    if (!parsed || !modelScope.test(parsed.path)) continue
    const match = parsed.path.match(shipDirectory)
    if (match) {
      accumulate(directories, match[2], parsed.path, parsed.crc32)
      if (!directoryNations.has(match[2])) directoryNations.set(match[2], match[1])
    } else {
      accumulate(nationShared, nationOf(parsed.path), parsed.path, parsed.crc32)
    }
  }
  const common = nationShared.get('common')
  const dirs = Object.fromEntries([...directories].map(([name, entry]) => {
    const nation = directoryNations.get(name) || 'common'
    return [name, {
      fingerprint: fingerprint(entry),
      nation,
      shared: fingerprint(merge(nationShared.get(nation), common))
    }]
  }))
  const shared = fingerprint(merge(...[...nationShared.values()]))
  return { dirs, shared, directories: [...directories.keys()] }
}

/**
 * 采集客户端资源指纹。导出器不支持 metadata 时返回 null，调用方据此退回按构建号复用。
 */
export async function captureAssetIndex({ gameDir, build, command, cacheRoot, run }) {
  if (!build || !cacheRoot) return null
  const directory = join(cacheRoot, '.cache', 'assets')
  const target = join(directory, `${build}.json`)
  try {
    const cached = JSON.parse(await readFile(target, 'utf8'))
    if (cached.version === ASSET_INDEX_VERSION && cached.build === build && cached.dirs && cached.shared) return cached
  } catch { /* 缓存缺失或损坏时重新采集。 */ }
  const output = join(directory, `${build}.csv`)
  const settings = { encoding: 'utf8', windowsHide: true, timeout: 600000, maxBuffer: 8 * 1024 * 1024 }
  try {
    await mkdir(directory, { recursive: true })
    await run(command, ['-i', join(gameDir, 'bin', build, 'idx'), '-p', join(gameDir, 'res_packages'),
      'metadata', '-f', 'csv', output], settings)
  } catch (error) {
    throw new Error(`采集客户端资源指纹失败：${error.message}`)
  }
  const summary = await summarizeMetadata(output)
  const record = { version: ASSET_INDEX_VERSION, build, dirs: summary.dirs, shared: summary.shared, directories: summary.directories }
  const temporary = `${target}.tmp`
  await writeFile(temporary, JSON.stringify(record))
  await rename(temporary, target)
  return record
}

/**
 * 汇总各可用客户端构建下每个资源目录的指纹。
 * 所有构建指纹一致说明该目录几何稳定，可以跨构建复用；
 * 只要有一个构建不同，就无法证明几何未变，按保守策略重新导出。
 */
export async function loadDirectoryFingerprints(cacheRoot) {
  const directory = join(cacheRoot, '.cache', 'assets')
  let files = []
  try { files = (await readdir(directory)).filter(name => name.endsWith('.json')) } catch { return new Map() }
  const result = new Map()
  for (const file of files) {
    let record
    try { record = JSON.parse(await readFile(join(directory, file), 'utf8')) } catch { continue }
    if (record.version !== ASSET_INDEX_VERSION || !record.dirs) continue
    for (const [name, entry] of Object.entries(record.dirs)) {
      const item = result.get(name) || { fingerprints: new Set(), shared: new Set(), nation: entry.nation }
      item.fingerprints.add(entry.fingerprint)
      item.shared.add(entry.shared)
      result.set(name, item)
    }
  }
  return result
}

/**
 * 资源目录的稳定指纹：各构建一致时返回该指纹，否则返回 null 表示无法判定。
 */
export function stableFingerprint(fingerprints, name) {
  const item = fingerprints.get(name)
  if (!item || item.fingerprints.size !== 1) return null
  return [...item.fingerprints][0]
}

/** 资源目录的稳定共享指纹；各构建一致时返回，否则返回 null。 */
export function stableShared(fingerprints, name) {
  const item = fingerprints.get(name)
  if (!item || item.shared.size !== 1) return null
  return [...item.shared][0]
}
