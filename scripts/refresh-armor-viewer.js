/** 从已有离线包重建查看器，不联网、不调用游戏导出器、不覆盖旧批次。 */
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { packToolkitAppearance } from '../lib/toolkit-appearance.js'
import { writeArmorViewerAssets } from '../lib/armor-viewer-writer.js'
import { shipIdPattern } from '../web/armor-format.js'

const { values, positionals } = parseArgs({ allowPositionals: true, options: { ships: { type: 'string' } } })
if (positionals.length !== 1) throw new Error('用法：node scripts/refresh-armor-viewer.js "批次目录" [--ships PJSB510,PGSD737]')
const directory = resolve(positionals[0])
const source = join(directory, 'armor')
const html = readFileSync(join(source, 'index.html'), 'utf8')
const config = JSON.parse(html.match(/<script id="viewer-config" type="application\/json">([\s\S]*?)<\/script>/)?.[1] || 'null')
if (!config?.ships) throw new Error('批次缺少查看器配置')
const ids = values.ships ? [...new Set(values.ships.split(','))] : Object.keys(config.ships)
if (!ids.length || ids.some(id => !shipIdPattern.test(id) || !config.ships[id])) throw new Error('舰船编号无效或不在本批次中')
const target = mkdtempSync(join(directory, 'armor-refreshed-'))
mkdirSync(join(target, 'ships'))
let appearanceCount = 0
for (const id of ids) {
  const content = readFileSync(join(source, 'ships', `${id}.js`), 'utf8')
  const prefix = 'globalThis.__wowsArmorReceive(document.currentScript.dataset.request,'
  if (!content.startsWith(prefix) || !content.trimEnd().endsWith(');')) throw new Error(`${id} 数据包格式无效`)
  const payload = JSON.parse(content.trimEnd().slice(prefix.length, -2))
  if (payload.id !== id) throw new Error(`${id} 数据包编号不一致`)
  try {
    if (packToolkitAppearance(payload)) { appearanceCount++; delete payload.appearanceError }
  } catch (error) { payload.appearanceError = error.message }
  const packed = JSON.stringify(payload).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')
  writeFileSync(join(target, 'ships', `${id}.js`), `${prefix}${packed});\n`)
}
writeArmorViewerAssets(target, { ...config, ships: Object.fromEntries(ids.map(id => [id, config.ships[id]])) })
console.log(`查看器已生成：${join(target, 'index.html')}\n舰船 ${ids.length}，补齐外观 ${appearanceCount}；其余保留原模型。`)
