/**
 * 恢复舰船外观模型。
 *
 * 外观模型是 Toolbox 导出的原始混合场景（toolkit-scene.glb），
 * 与装甲模型同目录成对存放。跨版本复用装甲模型时若未一并保留场景，
 * 历史缓存清理后外观就再也找不回来。
 *
 * 本脚本从旧版本页面数据包里取回原始场景字节，补入模型库，
 * 再按模型库中的场景重新打包当前版本的外观。
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { decodeModel } from '../web/armor-format.js'
import { packToolkitAppearance } from '../lib/toolkit-appearance.js'
import { readArmorPackage, writeArmorPackage } from '../lib/armor-package.js'
import { modelLibrary } from '../lib/model-store.js'

const { values, positionals } = parseArgs({ allowPositionals: true, options: {
  from: { type: 'string' }, to: { type: 'string' }, 'output-root': { type: 'string' }, ships: { type: 'string' }
} })
if (positionals.length !== 2) throw new Error('用法：node scripts/restore-armor-appearance.js <旧版本目录> <当前版本目录> --output-root <工作区根目录>')
if (!values['output-root']) throw new Error('缺少 --output-root（工作区根目录）')

const from = join(resolve(positionals[0]), 'armor', 'ships')
const to = join(resolve(positionals[1]), 'armor', 'ships')
const library = modelLibrary(resolve(values['output-root']))
if (!existsSync(from)) throw new Error(`旧版本页面数据包不存在：${from}`)
if (!existsSync(to)) throw new Error(`当前版本页面数据包不存在：${to}`)

let repacked = 0
let skipped = 0
const failures = []
const selected = values.ships ? new Set(values.ships.split(',').map(id => id.trim()).filter(Boolean)) : null
const ids = readdirSync(to).filter(file => file.endsWith('.js')).map(file => file.replace(/\.js$/, ''))
  .filter(id => !selected || selected.has(id))

for (const id of ids) {
  const payload = readArmorPackage(join(to, `${id}.js`), id)
  // 当前版本已有外观时无需处理。
  if (!payload.modelBase64 || payload.appearanceBase64) { skipped++; continue }
  const source = join(from, `${id}.js`)
  if (!existsSync(source)) { skipped++; continue }
  const previous = readArmorPackage(source, id)
  if (!previous.appearanceBase64) { skipped++; continue }
  try {
    const modelPath = join(library, id, `${id}.glb`)
    // 场景必须与同一份装甲模型配对，否则查看器里的外观与厚度对不上。
    if (!existsSync(modelPath) || !readFileSync(modelPath).equals(Buffer.from(payload.modelBase64, 'base64'))) {
      skipped++
      continue
    }
    const scenePath = join(library, id, 'toolkit-scene.glb')
    if (!existsSync(scenePath)) {
      const scene = Buffer.from(previous.appearanceBase64, 'base64')
      // 旧数据包里可能有损坏的场景，先校验再落盘，避免坏文件留在模型库。
      try { decodeModel(scene, id) } catch (error) {
        failures.push({ id, error: error.message })
        console.warn(`${id} 外观场景校验失败，未写入模型库：${error.message}`)
        skipped++
        continue
      }
      mkdirSync(join(library, id), { recursive: true })
      writeFileSync(scenePath, scene)
    }
    if (packToolkitAppearance(payload, modelPath)) {
      delete payload.appearanceError
      writeArmorPackage(join(to, `${id}.js`), payload)
      repacked++
    } else skipped++
  } catch (error) {
    failures.push({ id, error: error.message })
    console.warn(`${id} 恢复外观失败：${error.message}`)
  }
  if ((repacked + skipped) % 100 === 0) console.log(`恢复进度：${repacked + skipped}/${ids.length}`)
}

console.log(`外观恢复完成：重新打包 ${repacked} 艘，跳过 ${skipped} 艘，失败 ${failures.length} 艘`)
if (failures.length) {
  console.log(`失败编号：${failures.map(item => item.id).join(', ')}`)
  process.exitCode = 1
}
