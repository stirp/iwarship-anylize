import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync, mkdirSync, mkdtempSync, copyFileSync, writeFileSync, renameSync } from 'node:fs'
import { delimiter, dirname, join, resolve } from 'node:path'
import { decodeModel, MAX_MODEL_BYTES } from '../web/armor-format.js'

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

export function createToolkitCache(root, fingerprint) {
  if (!fingerprint) return null
  const directory = join(root, '.cache', 'toolkit-models', fingerprint)
  return {
    read(shipId) {
      try {
        const result = JSON.parse(readFileSync(join(directory, `${shipId}.json`), 'utf8'))
        if (statSync(result.path).size > MAX_MODEL_BYTES) return null
        const bytes = readFileSync(result.path)
        if (hash(bytes) !== result.sha256) return null
        decodeModel(bytes, shipId)
        return { path: result.path, info: result.info, cached: true }
      } catch { return null }
    },
    write(shipId, result) {
      mkdirSync(directory, { recursive: true })
      const entry = mkdtempSync(join(directory, `${shipId}-`))
      const path = join(entry, `${shipId}.glb`)
      const log = join(entry, 'export.log')
      copyFileSync(result.path, path)
      const appearance = join(dirname(result.path), 'toolkit-scene.glb')
      if (existsSync(appearance)) copyFileSync(appearance, join(entry, 'toolkit-scene.glb'))
      if (result.info.log && existsSync(result.info.log)) copyFileSync(result.info.log, log)
      else writeFileSync(log, '复用已有模型；原始导出日志不可用。\n')
      const record = { path, info: { ...result.info, log }, sha256: hash(readFileSync(path)) }
      const temporary = join(entry, 'manifest.json')
      writeFileSync(temporary, JSON.stringify(record))
      renameSync(temporary, join(directory, `${shipId}.json`))
    }
  }
}
