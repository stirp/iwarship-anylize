import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { convertToolkitArmor } from '../web/toolkit-armor.js'
import { MAX_MODEL_BYTES, shipIdPattern } from '../web/armor-format.js'

const runFile = promisify(execFile)

export function readToolkitArmor(path, shipId) {
  if (statSync(path).size > MAX_MODEL_BYTES) throw new Error('Toolkit 装甲 JSON 超过 100 MiB 限制')
  const payload = JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''))
  return convertToolkitArmor(payload, shipId, MAX_MODEL_BYTES)
}

/** 接入带 --armor-json 的 Toolkit 兼容导出器；不把普通 GLB 的颜色当成厚度。 */
export async function createToolkitExporter(options, { run = runFile } = {}) {
  const command = options.wowsunpack
  try {
    const help = await run(command, ['export-ship', '--help'], { encoding: 'utf8', windowsHide: true, timeout: 15000, maxBuffer: 1024 * 1024 })
    if (!/--armor-json\b/.test(help.stdout)) throw new Error('缺少 --armor-json 接口')
  } catch (error) {
    throw new Error(`无法使用装甲导出器：${error.message}。请通过 --wowsunpack 指定 WoWS Toolbox 的 wowsunpack_armor.exe；官方普通版 GLB 导出没有逐三角面装甲信息。`)
  }
  const gameDir = resolve(options['game-dir'])
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
      await run(command, args, { encoding: 'utf8', windowsHide: true, timeout: 600000, maxBuffer: 4 * 1024 * 1024 })
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
