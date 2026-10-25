import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync, renameSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { convertToolkitArmor } from '../web/toolkit-armor.js'
import { decodeModel, MAX_MODEL_BYTES, shipIdPattern } from '../web/armor-format.js'

const runFile = promisify(execFile)

export function readToolkitArmor(path, shipId) {
  if (statSync(path).size > MAX_MODEL_BYTES) throw new Error('Toolkit 装甲 JSON 超过 100 MiB 限制')
  const payload = JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''))
  return convertToolkitArmor(payload, shipId, MAX_MODEL_BYTES)
}

/** 自动选择逐面 JSON 或官方装甲 GLB；不把几何颜色当成厚度。 */
export async function createToolkitExporter(options, { run = runFile } = {}) {
  const command = options.wowsunpack || 'wowsunpack'
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
  return async (shipId, directory) => {
    if (!shipIdPattern.test(shipId)) throw new Error('无效舰船编号')
    mkdirSync(directory, { recursive: true })
    // 每次导出使用独立目录，不复用游戏更新前或失败残留的模型。
    const target = mkdtempSync(join(directory, `${shipId}-`))
    const sidecar = join(target, 'armor.json')
    const temporary = join(target, 'model.partial.glb')
    const log = join(target, 'export.log')
    const args = ['--game-dir', gameDir, 'export-ship', shipId, '--no-textures',
      '--output', sidecarSupported ? join(target, 'visual.glb') : temporary,
      ...(sidecarSupported ? ['--armor-json', sidecar] : ['--contents', 'armor'])]
    if (options['model-hull']) args.push('--hull', options['model-hull'])
    console.log(`从本地游戏导出装甲：${shipId}`)
    try {
      const result = await run(command, args, { encoding: 'utf8', windowsHide: true, timeout: 600000, maxBuffer: 4 * 1024 * 1024 })
      writeFileSync(log, `${result.stdout || ''}\n${result.stderr || ''}`)
      let bytes
      if (sidecarSupported) bytes = readToolkitArmor(sidecar, shipId)
      else {
        if (statSync(temporary).size > MAX_MODEL_BYTES) throw new Error('模型文件超过 100 MiB 限制')
        bytes = readFileSync(temporary)
      }
      const decoded = decodeModel(bytes, shipId)
      const path = join(target, `${shipId}.glb`)
      if (sidecarSupported) writeFileSync(path, bytes)
      else renameSync(temporary, path)
      return { path, info: { source: `本地游戏 · Toolkit ${sidecarSupported ? '逐面装甲' : '装甲几何'}导出 · ${shipId}`,
        exportedAt: new Date().toISOString(), geometry: 'armor', thicknessMetadata: Boolean(decoded.armor),
        log, hullSelection: options['model-hull'] || null } }
    } catch (error) {
      writeFileSync(log, `\n${error.stdout || ''}\n${error.stderr || ''}\n${error.message}`, { flag: 'a' })
      throw Object.assign(new Error(`Toolkit 导出 ${shipId} 失败：${error.killed ? '超过 10 分钟限制' : (error.stderr || error.message).slice(-2000)}；日志：${log}`), { toolkitLog: log })
    }
  }
}
