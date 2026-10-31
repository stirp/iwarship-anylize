import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync, mkdirSync, writeFileSync, renameSync, rmSync } from 'node:fs'
import { delimiter, dirname, join, resolve } from 'node:path'
import { decodeModel, MAX_MODEL_BYTES } from '../web/armor-format.js'
import { adoptModel } from './model-store.js'

const hash = bytes => createHash('sha256').update(bytes).digest('hex')

/** 与 Toolbox 一致，选择含 idx 目录的最高客户端构建号；不使用公开参数的版本。 */
export function toolkitClientBuild(gameDir) {
  try {
    return readdirSync(join(gameDir, 'bin'), { withFileTypes: true })
      .filter(entry => entry.isDirectory() && /^\d+$/.test(entry.name) && statSync(join(gameDir, 'bin', entry.name, 'idx'), { throwIfNoEntry: false })?.isDirectory())
      .map(entry => entry.name).sort((a, b) => Number(b) - Number(a))[0] || null
  } catch { return null }
}

export function toolkitFingerprint(gameDir, command, sidecar, hull) {
  const build = toolkitClientBuild(gameDir)
  return build ? hash(JSON.stringify({ gameDir: resolve(gameDir), build, hull, version: 2 })) : null
}

/** 仅用于接入可确认来源的旧缓存，不再决定新缓存的有效期。 */
export function legacyToolkitFingerprint(gameDir, command, sidecar, hull) {
  try {
    const executable = [resolve(command), ...(process.env.PATH || '').split(delimiter).flatMap(path =>
      [join(path, command), join(path, `${command}.exe`)])].find(path => existsSync(path) && statSync(path).isFile())
    if (!executable || !existsSync(join(gameDir, 'bin')) || !existsSync(join(gameDir, 'res_packages'))) return null
    const files = []
    const scan = directory => {
      for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        const path = join(directory, entry.name)
        if (entry.isDirectory()) scan(path)
        else if (entry.isFile()) {
          const stat = statSync(path)
          files.push([path, stat.size, stat.mtimeMs, /\.(idx|xml|data)$/i.test(path) ? hash(readFileSync(path)) : null])
        }
      }
    }
    scan(join(gameDir, 'bin'))
    scan(join(gameDir, 'res_packages'))
    const exporter = readdirSync(dirname(executable)).filter(name => /\.(exe|py|dll)$/i.test(name)).sort()
      .map(name => { const path = join(dirname(executable), name); return [path, hash(readFileSync(path))] })
    return hash(JSON.stringify({ gameDir, executable, files, exporter, sidecar, hull,
      adapter: hash(readFileSync(new URL('../web/toolkit-armor.js', import.meta.url))), version: 1,
      override: process.env.WOWS_GAME_PARAMS_OVERRIDE ? hash(readFileSync(process.env.WOWS_GAME_PARAMS_OVERRIDE)) : null }))
  } catch { return null }
}

/** 校验缓存记录指向的模型文件是否完整可用。 */
function verifyModel(record) {
  try {
    const info = statSync(record.path)
    if (info.size > MAX_MODEL_BYTES) return null
    const bytes = readFileSync(record.path)
    if (record.sha256 && hash(bytes) !== record.sha256) return null
    decodeModel(bytes, record.shipId)
    return bytes
  } catch { return null }
}

export function createToolkitCache(root, fingerprint) {
  if (!fingerprint) return null
  const directory = join(root, '.cache', 'toolkit-models', fingerprint)
  return {
    directory,
    read(shipId) {
      try {
        const result = JSON.parse(readFileSync(join(directory, `${shipId}.json`), 'utf8'))
        const bytes = verifyModel({ ...result, shipId })
        if (!bytes) return null
        return { ...result, path: result.path, info: result.info, cached: true }
      } catch { return null }
    },
    write(shipId, result) {
      mkdirSync(directory, { recursive: true })
      // 缓存只记录已校验模型的位置，不再复制 GLB、外观和日志。
      const path = resolve(result.path)
      const record = { path, info: result.info, sha256: result.sha256 || hash(readFileSync(path)),
        assets: result.assets ?? null, shared: result.shared ?? null, content: result.content ?? null,
        updatedAt: new Date().toISOString() }
      const temporary = join(directory, `${shipId}.json.tmp`)
      writeFileSync(temporary, JSON.stringify(record))
      renameSync(temporary, join(directory, `${shipId}.json`))
      return record
    }
  }
}

/** 读取同一舰船在所有历史指纹下的模型记录，按记录时间倒序。 */
export function readToolkitRecords(root, shipId) {
  const base = join(root, '.cache', 'toolkit-models')
  const records = []
  let entries
  try { entries = readdirSync(base, { withFileTypes: true }) } catch { return records }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const file = join(base, entry.name, `${shipId}.json`)
    try {
      const record = JSON.parse(readFileSync(file, 'utf8'))
      records.push({ fingerprint: entry.name, ...record })
    } catch { /* 损坏的记录按缺失处理。 */ }
  }
  return records
}

/**
 * 为历史记录补写资源目录名与指纹。
 *
 * 客户端资源目录名与 GameParams 的舰船编号不是同一套编号，
 * 因此从导出日志里取该舰船实际使用的资源目录名，再按目录名查指纹。
 * 指纹在各客户端构建间一致才算稳定，无法判定时留空，按构建号复用。
 */
export async function backfillToolkitAssets(root, resolve) {
  const base = join(root, '.cache', 'toolkit-models')
  let entries
  try { entries = readdirSync(base, { withFileTypes: true }) } catch { return 0 }
  let updated = 0
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const directory = join(base, entry.name)
    for (const file of readdirSync(directory)) {
      if (!file.endsWith('.json')) continue
      const path = join(directory, file)
      let record
      try { record = JSON.parse(readFileSync(path, 'utf8')) } catch { continue }
      if (!record.path || !existsSync(record.path)) continue
      if (record.assets && record.info?.modelDir) continue
      const modelDir = record.info?.modelDir || resolve.modelDirectory(record)
      if (!modelDir) continue
      const assets = resolve.fingerprint(modelDir)
      if (!assets) continue
      record.assets = assets
      record.shared = resolve.shared(modelDir)
      if (!record.info) record.info = {}
      record.info.modelDir = modelDir
      writeFileSync(path, JSON.stringify(record))
      updated++
    }
  }
  return updated
}

/**
 * 删除非当前指纹的缓存目录。目录内的记录先迁到当前指纹，
 * 模型文件同时归集到模型库，保证历史模型仍可按资源指纹跨构建复用。
 */
export function pruneToolkitCache(root, keep, library) {
  const base = join(root, '.cache', 'toolkit-models')
  let entries
  try { entries = readdirSync(base, { withFileTypes: true }) } catch { return [] }
  const removed = []
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === keep) continue
    const source = join(base, entry.name)
    for (const file of readdirSync(source)) {
      if (!file.endsWith('.json')) continue
      const path = join(source, file)
      let record
      try { record = JSON.parse(readFileSync(path, 'utf8')) } catch { continue }
      if (!record.path || !existsSync(record.path)) continue
      const shipId = file.replace(/\.json$/, '')
      if (library) record.path = adoptModel(record.path, library, shipId)
      if (!keep) continue
      const target = join(base, keep, file)
      if (!existsSync(target)) writeFileSync(target, JSON.stringify(record))
    }
    rmSync(source, { recursive: true, force: true })
    removed.push(entry.name)
  }
  return removed
}
