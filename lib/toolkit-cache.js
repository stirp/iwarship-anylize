import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync, mkdirSync, mkdtempSync, copyFileSync, writeFileSync, renameSync } from 'node:fs'
import { delimiter, dirname, join, resolve } from 'node:path'
import { decodeModel, MAX_MODEL_BYTES } from '../web/armor-format.js'

const hash = bytes => createHash('sha256').update(bytes).digest('hex')

/** 资源包使用文件清单、大小和修改时间；索引及转换代码使用内容摘要。无法确认输入时不复用。 */
export function toolkitFingerprint(gameDir, command, sidecar, hull) {
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
        if (hash(bytes) !== result.sha256 || !existsSync(result.info.log)) return null
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
      copyFileSync(result.info.log, log)
      const record = { path, info: { ...result.info, log }, sha256: hash(readFileSync(path)) }
      const temporary = join(entry, 'manifest.json')
      writeFileSync(temporary, JSON.stringify(record))
      renameSync(temporary, join(directory, `${shipId}.json`))
    }
  }
}
