import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { convertToolkitArmor } from '../web/toolkit-armor.js'
import { decodeModel, MAX_MODEL_BYTES, shipIdPattern } from '../web/armor-format.js'
import { resolvePython } from './python.js'
import { captureAssetIndex, loadDirectoryFingerprints, stableFingerprint, stableShared } from './assets-index.js'
import { modelDirectoryFromLog } from './model-directory.js'
import { adoptModel, modelLibrary } from './model-store.js'
import { probeExporters, toolCandidates } from './wowsunpack-tools.js'
import { createToolkitCache, toolkitFingerprint, toolkitClientBuild, legacyToolkitFingerprint, readToolkitRecords, pruneToolkitCache, backfillToolkitAssets } from './toolkit-cache.js'

const runFile = promisify(execFile)

// Toolbox 自带的兼容转换保留本地游戏版本，只在工作区缓存中写入副本。
// 兼容脚本与导出器可能不在同一目录，按候选顺序查找。
const prepareCompat = `import json, pathlib, shutil, sys
exporter = shutil.which(sys.argv[1]) or sys.argv[1]
search = [pathlib.Path(exporter).resolve().parent]
search += [pathlib.Path(item) for item in sys.argv[4:] if item]
for directory in search:
    if (directory / "compat_cache.py").is_file():
        sys.path.insert(0, str(directory))
        break
else:
    raise RuntimeError("Cannot locate compat_cache.py; set WOWS_TOOLBOX_BACKEND to the WoWS Toolbox Backend directory")
from compat_cache import prepare_game_params_cache
result = prepare_game_params_cache(pathlib.Path(sys.argv[2]), pathlib.Path(sys.argv[3]), "pc")
print(json.dumps(result))
`

export function readToolkitArmor(path, shipId) {
  if (statSync(path).size > MAX_MODEL_BYTES) throw new Error('Toolkit 装甲 JSON 超过 100 MiB 限制')
  const payload = JSON.parse(readFileSync(path, 'utf8').replace(/^﻿/, ''))
  return convertToolkitArmor(payload, shipId, MAX_MODEL_BYTES)
}

/**
 * 找出资源指纹一致且文件完整的历史模型记录。
 *
 * 判据是舰船实际使用的客户端资源目录：客户端目录名与 GameParams 的舰船编号
 * 不是同一套编号，只能经由导出日志对应起来。
 * 国家级共享资源每次客户端更新都会变化，只能作为审计提示，不能作为复用门槛。
 */
function findReusable(root, shipId, fingerprintOf, { hull = null, sidecar = false } = {}) {
  const candidates = readToolkitRecords(root, shipId).filter(record => record.assets && record.info?.modelDir
    && (record.info?.hullSelection ?? null) === hull
    && Boolean(record.info?.thicknessMetadata) === sidecar)
  for (const record of candidates.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))) {
    // 当前客户端下该资源目录的指纹与历史一致，说明几何未变。
    if (fingerprintOf(record.info.modelDir) !== record.assets) continue
    try {
      const bytes = readFileSync(record.path)
      if (record.sha256 && bytes.length && bytes.length <= MAX_MODEL_BYTES) {
        decodeModel(bytes, shipId)
        return record
      }
    } catch { /* 模型缺失或损坏时继续找下一条。 */ }
  }
  return null
}

/** 自动选择逐面 JSON 或官方装甲 GLB；不把几何颜色当成厚度。 */
export async function createToolkitExporter(options, { run = runFile } = {}) {
  // 导出器优先用项目内集成的版本，其次才用 PATH 上的命令。
  const projectRoot = fileURLToPath(new URL('..', import.meta.url))
  const tool = await probeExporters(toolCandidates(projectRoot, options.wowsunpack?.trim() || null), run)
  const command = tool.command
  const sidecarSupported = tool.sidecarSupported
  const label = tool.variant === 'path' ? '来自 PATH' : `内置 ${tool.variant} 变体`
  console.log(`导出器：${command}（${label}${tool.version ? `，版本 ${tool.version}` : ''}）`)
  console.log(sidecarSupported ? '本地模型格式：逐面装甲 JSON，支持厚度交互' : '本地模型格式：装甲 GLB，未提供兼容元数据时仅显示几何')
  const gameDir = resolve(options['game-dir'])
  const fingerprint = toolkitFingerprint(gameDir, command, sidecarSupported, options['model-hull'] || null)
  const clientBuild = toolkitClientBuild(gameDir)
  const root = options.outputRoot || null
  if (clientBuild) console.log(`本地客户端构建：${clientBuild}；同版本已有模型直接复用`)
  else console.warn('无法识别本地客户端构建号，本次不复用模型缓存')
  // 资源指纹用于跨客户端构建复用；采集失败时退回按构建号复用。
  let assetIndex = null
  let directoryFingerprints = new Map()
  const knownDirectories = new Set()
  // 当前客户端构建下某资源目录的指纹；记录里保存的是导出时的指纹，两者相同即几何未变。
  const fingerprintOf = name => assetIndex?.dirs?.[name]?.fingerprint || null
  const sharedOf = name => assetIndex?.dirs?.[name]?.shared || null
  if (clientBuild && root) {
    try {
      assetIndex = await captureAssetIndex({ gameDir, build: clientBuild, command, cacheRoot: root, run })
      directoryFingerprints = await loadDirectoryFingerprints(root)
      for (const name of directoryFingerprints.keys()) knownDirectories.add(name)
      console.log(`客户端资源指纹：${directoryFingerprints.size} 个舰船资源目录可用于跨版本比对`)
      // 旧模型按其导出日志里的资源目录补写指纹，之后的客户端更新即可直接复用。
      const backfilled = await backfillToolkitAssets(root, {
        modelDirectory: record => modelDirectoryFromLog(join(dirname(record.path), 'export.log'), knownDirectories),
        // 各构建一致时用该指纹；无法判定时退回当前构建，保证旧模型仍可复用。
        fingerprint: name => stableFingerprint(directoryFingerprints, name) || fingerprintOf(name),
        shared: name => sharedOf(name)
      })
      if (backfilled) console.log(`为 ${backfilled} 条历史模型补写资源指纹，后续更新可直接复用`)
    } catch (error) {
      console.warn(`资源指纹采集不可用，本次仅按客户端构建复用：${error.message}`)
    }
  }
  let legacyFingerprint
  let compatibility
  let staleAppearance = 0
  const compatibilityEnvironment = directory => {
    // 所有舰船复用同一次转换；失败也不为每艘船重新转换。
    compatibility ||= (async () => {
      const python = options.python || await resolvePython()
      const cache = join(options.outputRoot || directory, '.cache', 'toolkit')
      // 兼容脚本随导出器放在同一目录；缺失时按环境变量指向的 Toolbox 目录再找。
      const backend = process.env.WOWS_TOOLBOX_BACKEND || ''
      const compatArgs = ['-X', 'utf8', '-c', prepareCompat, command, gameDir, cache]
      if (backend) compatArgs.push(backend)
      const { stdout } = await run(python, compatArgs, {
        encoding: 'utf8', windowsHide: true, timeout: 600000, maxBuffer: 4 * 1024 * 1024
      })
      const result = JSON.parse(stdout.trim().split(/\r?\n/).at(-1))
      if (typeof result.game_params !== 'string' || !result.game_params) throw new Error('兼容转换未返回 GameParams 路径')
      return { ...process.env, WOWS_GAME_PARAMS_OVERRIDE: result.game_params }
    })()
    return compatibility
  }
  const exporter = async (shipId, directory) => {
    if (!shipIdPattern.test(shipId)) throw new Error('无效舰船编号')
    const cache = createToolkitCache(root || directory, fingerprint)
    const reuse = record => {
      const path = adoptModel(record.path, directory, shipId)
      const info = { ...record.info, clientBuild, reusedFrom: record.fingerprint }
      cache?.write(shipId, { path, info, sha256: record.sha256,
        assets: record.assets ?? null, shared: record.shared ?? null, content: record.content ?? null })
      return { path, info, cached: true }
    }
    if (!options['force-models']) {
      const cached = cache?.read(shipId)
      if (cached) {
        console.log(`复用未变更的本地装甲模型：${shipId}`)
        return reuse(cached)
      }
      if (directoryFingerprints.size) {
        // 资源指纹一致说明该舰船几何未变，跨客户端构建直接沿用历史模型。
        const reusable = findReusable(root, shipId, fingerprintOf,
          { hull: options['model-hull'] || null, sidecar: sidecarSupported })
        if (reusable) {
          // 本国共享资源变化只影响外观等次要信息，记下来供审计，不阻断复用。
          const current = sharedOf(reusable.info.modelDir)
          if (reusable.shared && current && reusable.shared !== current) staleAppearance++
          console.log(`复用资源未变更的历史模型：${shipId}（构建 ${reusable.info?.clientBuild || '未知'}）`)
          return reuse(reusable)
        }
      }
      if (cache) {
        // 旧记录没有版本字段，只接入仍与旧指纹完全匹配的模型。
        if (legacyFingerprint === undefined) legacyFingerprint = legacyToolkitFingerprint(gameDir, command, sidecarSupported, options['model-hull'] || null)
        const legacy = createToolkitCache(root || directory, legacyFingerprint)?.read(shipId)
        if (legacy) {
          legacy.info = { ...legacy.info, clientBuild }
          console.log(`复用并接入版本缓存的本地装甲模型：${shipId}`)
          return reuse(legacy)
        }
      }
    }
    mkdirSync(directory, { recursive: true })
    // 固定目录覆盖更新；先写临时文件，校验成功后再替换可用模型。
    const target = join(directory, shipId)
    const pending = join(target, 'pending')
    mkdirSync(pending, { recursive: true })
    const sidecar = join(pending, 'armor.json')
    const temporary = join(pending, 'model.partial.glb')
    const rawScene = join(pending, 'toolkit-scene.glb')
    const log = join(pending, 'export.log')
    // 清空固定临时文件，不能把上次失败的残留当作本次导出结果。
    writeFileSync(sidecarSupported ? sidecar : temporary, '')
    if (sidecarSupported) writeFileSync(rawScene, '')
    const args = ['--game-dir', gameDir, 'export-ship', shipId, '--no-textures',
      '--output', sidecarSupported ? rawScene : temporary,
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
        writeFileSync(temporary, bytes)
        renameSync(sidecar, join(target, 'armor.json'))
        renameSync(rawScene, join(target, 'toolkit-scene.glb'))
      }
      renameSync(temporary, path)
      const completedLog = join(target, 'export.log')
      renameSync(log, completedLog)
      // 导出日志里有该舰船实际使用的客户端资源目录名，用于跨构建比对几何是否变化。
      const modelDir = modelDirectoryFromLog(completedLog, knownDirectories)
      const assets = modelDir ? fingerprintOf(modelDir) : null
      const shared = modelDir ? sharedOf(modelDir) : null
      const exported = { path, info: { source: `本地游戏 · Toolkit ${sidecarSupported ? '逐面装甲' : '装甲几何'}导出 · ${shipId}`,
        exportedAt: new Date().toISOString(), geometry: 'armor', thicknessMetadata: Boolean(decoded.armor),
        log: completedLog, clientBuild, hullSelection: options['model-hull'] || null, modelDir } }
      cache?.write(shipId, { path, info: exported.info, assets, shared, content: null })
      return exported
    } catch (error) {
      writeFileSync(log, `\n${error.stdout || ''}\n${error.stderr || ''}\n${error.message}`, { flag: 'a' })
      throw Object.assign(new Error(`Toolkit 导出 ${shipId} 失败：${error.killed ? '超过 10 分钟限制' : (error.stderr || error.message).slice(-2000)}；日志：${log}`), { toolkitLog: log })
    }
  }
  exporter.fingerprint = fingerprint
  /** 复用旧模型但本国共享资源已变化的舰船数，供生成结束后汇总。 */
  exporter.staleAppearance = () => staleAppearance
  /** 清理历史指纹缓存；模型文件同时归集到模型库，不随缓存删除。 */
  exporter.prune = () => (root ? pruneToolkitCache(root, fingerprint, modelLibrary(root)) : [])
  return exporter
}
