import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { convertToolkitArmor } from '../web/toolkit-armor.js'
import { MAX_MODEL_BYTES, shipIdPattern } from '../web/armor-format.js'
import { resolvePython } from './python.js'

const runFile = promisify(execFile)

// Toolbox 自带的兼容转换保留本地游戏版本，只在工作区缓存中写入副本。
const prepareCompat = `import json, pathlib, shutil, sys
exporter = shutil.which(sys.argv[1])
if not exporter:
    raise RuntimeError("Cannot locate WoWS Toolbox exporter")
sys.path.insert(0, str(pathlib.Path(exporter).resolve().parent))
from compat_cache import prepare_game_params_cache
result = prepare_game_params_cache(pathlib.Path(sys.argv[2]), pathlib.Path(sys.argv[3]), "pc")
print(json.dumps(result))
`

export function readToolkitArmor(path, shipId) {
  if (statSync(path).size > MAX_MODEL_BYTES) throw new Error('Toolkit 装甲 JSON 超过 100 MiB 限制')
  const payload = JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''))
  return convertToolkitArmor(payload, shipId, MAX_MODEL_BYTES)
}

/** 接入带 --armor-json 的 Toolkit 兼容导出器；不把普通 GLB 的颜色当成厚度。 */
export async function createToolkitExporter(options, { run = runFile } = {}) {
  const command = options.wowsunpack?.trim() || 'wowsunpack_armor'
  try {
    const help = await run(command, ['export-ship', '--help'], { encoding: 'utf8', windowsHide: true, timeout: 15000, maxBuffer: 1024 * 1024 })
    if (!/--armor-json\b/.test(help.stdout)) throw new Error('缺少 --armor-json 接口')
  } catch (error) {
    throw new Error(`无法使用装甲导出器：${error.message}。请通过 --wowsunpack 指定 WoWS Toolbox 的 wowsunpack_armor.exe；官方普通版 GLB 导出没有逐三角面装甲信息。`)
  }
  const gameDir = resolve(options['game-dir'])
  let compatibility
  const compatibilityEnvironment = directory => {
    // 所有舰船复用同一次转换；失败也不为每艘船重新转换。
    compatibility ||= (async () => {
      const python = options.python || await resolvePython()
      const cache = join(options.outputRoot || directory, '.cache', 'toolkit')
      const { stdout } = await run(python, ['-X', 'utf8', '-c', prepareCompat, command, gameDir, cache], {
        encoding: 'utf8', windowsHide: true, timeout: 600000, maxBuffer: 4 * 1024 * 1024
      })
      const result = JSON.parse(stdout.trim().split(/\r?\n/).at(-1))
      if (typeof result.game_params !== 'string' || !result.game_params) throw new Error('兼容转换未返回 GameParams 路径')
      return { ...process.env, WOWS_GAME_PARAMS_OVERRIDE: result.game_params }
    })()
    return compatibility
  }
  return async (shipId, directory) => {
    if (!shipIdPattern.test(shipId)) throw new Error('无效舰船编号')
    mkdirSync(directory, { recursive: true })
    // 每次导出使用独立目录，不复用游戏更新前或失败残留的模型。
    const target = mkdtempSync(join(directory, `${shipId}-`))
    const sidecar = join(target, 'armor.json')
    const args = ['--game-dir', gameDir, 'export-ship', shipId, '--no-textures',
      '--output', join(target, 'visual.glb'), '--armor-json', sidecar]
    if (options['model-hull']) args.push('--hull', options['model-hull'])
    console.log(`从本地游戏导出装甲：${shipId}`)
    try {
      const settings = { encoding: 'utf8', windowsHide: true, timeout: 600000, maxBuffer: 4 * 1024 * 1024 }
      if (compatibility) settings.env = await compatibility
      try {
        await run(command, args, settings)
      } catch (error) {
        if (compatibility || !/ValueNotHashable/.test(error.stderr || error.message)) throw error
        console.log('本地 GameParams 需要兼容转换，使用 WoWS Toolbox 创建缓存副本')
        settings.env = await compatibilityEnvironment(directory)
        await run(command, args, settings)
      }
    } catch (error) {
      throw new Error(`Toolkit 导出 ${shipId} 失败：${error.killed ? '超过 10 分钟限制' : (error.stderr || error.message).slice(-2000)}`)
    }
    const bytes = readToolkitArmor(sidecar, shipId)
    const path = join(target, `${shipId}.glb`)
    writeFileSync(path, bytes)
    return { path, info: { source: `本地游戏 · Toolkit 装甲导出 · ${shipId}`, exportedAt: new Date().toISOString(),
      hullSelection: options['model-hull'] || null } }
  }
}
