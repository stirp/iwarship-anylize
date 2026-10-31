import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync, renameSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { convertToolkitArmor } from '../web/toolkit-armor.js'
import { decodeModel, MAX_MODEL_BYTES, shipIdPattern } from '../web/armor-format.js'
import { resolvePython } from './python.js'
import { createToolkitCache, toolkitFingerprint, toolkitClientBuild, legacyToolkitFingerprint } from './toolkit-cache.js'

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

/** 自动选择逐面 JSON 或官方装甲 GLB；不把几何颜色当成厚度。 */
export async function createToolkitExporter(options, { run = runFile } = {}) {
  const command = options.wowsunpack?.trim() || 'wowsunpack'
  let sidecarSupported
  try {
    const help = await run(command, ['export-ship', '--help'], { encoding: 'utf8', windowsHide: true, timeout: 15000, maxBuffer: 1024 * 1024 })
    sidecarSupported = /--armor-json\b/.test(help.stdout)
    if (!sidecarSupported && !/--contents\b/.test(help.stdout)) throw new Error('缺少 --armor-json 或 --contents 接口')
  } catch (error) {
    throw new Error(`无法使用装甲导出器：${error.message}。请确认 wowsunpack 在 PATH 中，或用 --wowsunpack 指定支持 export-ship --contents / --armor-json 的程序。`)
  }
  console.log(sidecarSupported ? '本地模型格式：逐面装甲 JSON，支持厚度交互' : '本地模型格式：装甲 GLB，未提供兼容元数据时仅显示几何')
  const gameDir = resolve(options['game-dir'])
  const fingerprint = toolkitFingerprint(gameDir, command, sidecarSupported, options['model-hull'] || null)
  const clientBuild = toolkitClientBuild(gameDir)
  if (clientBuild) console.log(`本地客户端构建：${clientBuild}；同版本已有模型直接复用`)
  else console.warn('无法识别本地客户端构建号，本次不复用模型缓存')
  let legacyFingerprint
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
    const cache = createToolkitCache(options.outputRoot || directory, fingerprint)
    const cached = cache?.read(shipId)
    if (cached) {
      console.log(`复用未变更的本地装甲模型：${shipId}`)
      return cached
    }
    if (cache) {
      // 旧记录没有版本字段，只接入仍与旧指纹完全匹配的模型。
      if (legacyFingerprint === undefined) legacyFingerprint = legacyToolkitFingerprint(gameDir, command, sidecarSupported, options['model-hull'] || null)
      const legacy = createToolkitCache(options.outputRoot || directory, legacyFingerprint)?.read(shipId)
      if (legacy) {
        legacy.info = { ...legacy.info, clientBuild }
        cache.write(shipId, legacy)
        console.log(`复用并接入版本缓存的本地装甲模型：${shipId}`)
        return legacy
      }
    }
    mkdirSync(directory, { recursive: true })
    // 缓存未命中时使用独立目录，不把失败残留当成完成模型。
    const target = mkdtempSync(join(directory, `${shipId}-`))
    const sidecar = join(target, 'armor.json')
    const temporary = join(target, 'model.partial.glb')
    const log = join(target, 'export.log')
    const args = ['--game-dir', gameDir, 'export-ship', shipId, '--no-textures',
      '--output', sidecarSupported ? join(target, 'toolkit-scene.glb') : temporary,
      ...(sidecarSupported ? ['--armor-json', sidecar] : ['--contents', 'armor'])]
    if (options['model-hull']) args.push('--hull', options['model-hull'])
    console.log(`从本地游戏导出装甲：${shipId}`)
    try {
      const settings = { encoding: 'utf8', windowsHide: true, timeout: 600000, maxBuffer: 4 * 1024 * 1024 }
      if (compatibility) settings.env = await compatibility
      let result
      try {
        result = await run(command, args, settings)
      } catch (error) {
        if (compatibility || !/ValueNotHashable/.test(error.stderr || error.message)) throw error
        console.log('本地 GameParams 需要兼容转换，使用 WoWS Toolbox 创建缓存副本')
        settings.env = await compatibilityEnvironment(directory)
        result = await run(command, args, settings)
      }
      writeFileSync(log, `${result.stdout || ''}\n${result.stderr || ''}`)
      let bytes
      if (sidecarSupported) bytes = readToolkitArmor(sidecar, shipId)
      else {
        if (statSync(temporary).size > MAX_MODEL_BYTES) throw new Error('模型文件超过 100 MiB 限制')
        bytes = readFileSync(temporary)
      }
      const decoded = decodeModel(bytes, shipId)
      const path = join(target, `${shipId}.glb`)
      if (sidecarSupported) {
        writeFileSync(path, bytes)
        // 独立保留装甲；混合场景在打包阶段配对，由查看器转换外观局部坐标。
        writeFileSync(join(target, 'visual.glb'), bytes)
      }
      else renameSync(temporary, path)
      const exported = { path, info: { source: `本地游戏 · Toolkit ${sidecarSupported ? '逐面装甲' : '装甲几何'}导出 · ${shipId}`,
        exportedAt: new Date().toISOString(), geometry: 'armor', thicknessMetadata: Boolean(decoded.armor),
        log, clientBuild, hullSelection: options['model-hull'] || null } }
      cache?.write(shipId, exported)
      return exported
    } catch (error) {
      writeFileSync(log, `\n${error.stdout || ''}\n${error.stderr || ''}\n${error.message}`, { flag: 'a' })
      throw Object.assign(new Error(`Toolkit 导出 ${shipId} 失败：${error.killed ? '超过 10 分钟限制' : (error.stderr || error.message).slice(-2000)}；日志：${log}`), { toolkitLog: log })
    }
  }
}
