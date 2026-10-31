/** 原位更新既有查看器；指定游戏目录时只重新导出所选舰船模型。 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { packToolkitAppearance } from '../lib/toolkit-appearance.js'
import { writeArmorViewerAssets } from '../lib/armor-viewer-writer.js'
import { shipIdPattern } from '../web/armor-format.js'
import { readArmorPackage, writeArmorPackage } from '../lib/armor-package.js'
import { createToolkitExporter } from '../lib/toolkit-exporter.js'

const { values, positionals } = parseArgs({ allowPositionals: true, options: {
  ships: { type: 'string' }, 'game-dir': { type: 'string' }, wowsunpack: { type: 'string' },
  'model-hull': { type: 'string' }, python: { type: 'string' }
} })
if (positionals.length !== 1) throw new Error('用法：node scripts/refresh-armor-viewer.js "输出目录" [--ships PJSB510,PGSD737] [--game-dir "游戏目录"]')
if (!values['game-dir'] && (values.wowsunpack || values['model-hull'] || values.python)) throw new Error('导出器、舰体及 Python 选项需要 --game-dir')
const directory = resolve(positionals[0])
const source = join(directory, 'armor')
const html = readFileSync(join(source, 'index.html'), 'utf8')
const config = JSON.parse(html.match(/<script id="viewer-config" type="application\/json">([\s\S]*?)<\/script>/)?.[1] || 'null')
if (!config?.ships) throw new Error('批次缺少查看器配置')
const ids = values.ships ? [...new Set(values.ships.split(','))] : Object.keys(config.ships)
if (!ids.length || ids.some(id => !shipIdPattern.test(id) || !config.ships[id])) throw new Error('舰船编号无效或不在本批次中')
const target = source
const exportModel = values['game-dir'] ? await createToolkitExporter({ ...values, 'force-models': true }) : null
let appearanceCount = 0
const failures = []
for (const [index, id] of ids.entries()) {
  const payloadPath = join(source, 'ships', `${id}.js`)
  const payload = readArmorPackage(payloadPath, id)
  let modelPath
  if (exportModel) {
    try {
      const model = await exportModel(id, join(target, 'toolkit'))
      modelPath = model.path
      payload.modelBase64 = readFileSync(modelPath).toString('base64')
      payload.modelInfo = model.info
      delete payload.modelError
      delete payload.appearanceBase64
      delete payload.appearanceFormat
      delete payload.appearanceError
    } catch (error) {
      failures.push({ id, error: error.message })
      console.warn(`${id} 重新导出失败，保留原数据包：${error.message}`)
      continue
    }
  }
  try {
    if (packToolkitAppearance(payload, modelPath)) delete payload.appearanceError
  } catch (error) { payload.appearanceError = error.message }
  if (payload.appearanceBase64) appearanceCount++
  config.ships[id].embedded = Boolean(payload.modelBase64)
  writeArmorPackage(payloadPath, payload)
  if ((index + 1) % 50 === 0) console.log(`刷新进度：${index + 1}/${ids.length}`)
}
// 局部刷新不能缩小舰船列表，否则原数据表中其他舰船的链接会失效。
writeArmorViewerAssets(target, config)
const manifestPath = join(directory, 'manifest.json')
if (existsSync(manifestPath)) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  manifest.viewer = { ...manifest.viewer, path: 'armor/index.html', refreshedAt: new Date().toISOString(), refreshFailures: failures }
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
}
console.log(`查看器已原位更新：${join(target, 'index.html')}\n刷新 ${ids.length} 艘，带外观 ${appearanceCount} 艘，重新导出失败 ${failures.length} 艘。原数据表链接直接生效。`)
if (failures.length) process.exitCode = 1
