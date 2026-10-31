/** 使用批次对应的本地缓存刷新比较表，不重新下载或导出 3D 模型。 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { createHash } from 'node:crypto'
import { readGameParams } from '../lib/sources/gameparams.js'
import { readTranslations } from '../lib/sources/translations.js'
import { resolvePython } from '../lib/python.js'
import { buildGameParamsRows } from '../lib/gameparams-tables.js'
import { categoryNames } from '../lib/categories.js'
import { generateHTML } from '../lib/html-writer.js'
import { writeMarkdown, writeColumnCoverage } from '../lib/output.js'

const directory = resolve(process.argv[2] || '')
const manifestPath = join(directory, 'manifest.json')
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
if (!process.argv[2] || manifest.source !== 'gameparams') throw new Error('请指定已有 GameParams 批次目录')
const revision = manifest.provenance?.revision
if (!/^[a-f0-9]{40}$/.test(revision || '')) throw new Error('批次未记录固定提交，无法确认缓存版本')
const cache = resolve(directory, '../../../..', '.cache')
const input = join(cache, 'gameparams', revision, 'GameParams.data')
const bytes = readFileSync(input)
const blob = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')
if (blob !== manifest.provenance.gitBlob) throw new Error('GameParams 缓存与批次版本不一致')
const translationsPath = join(cache, 'translations', revision, 'lang.json')
const translations = readTranslations(translationsPath)
// 比较页与独立实体参数分开；历史批次按原有类别补上对应的新页面。
for (const [source, addition] of [['artillery', 'penetration'], ['aircraft', 'aircraftDetails'], ['ability', 'abilityDetails']]) {
  if (manifest.selection.categories.includes(source) && !manifest.selection.categories.includes(addition)) manifest.selection.categories.push(addition)
}
const categories = manifest.selection.categories.filter(key => key !== 'armor')
const updated = Object.fromEntries(categories.map(key => [key, []]))
await readGameParams({ path: input }, { python: await resolvePython(), regions: [manifest.region],
  ships: manifest.selection.ships, translationsPath }, categories, event => {
  if (event.event !== 'record') return
  for (const { category, row } of buildGameParamsRows(event, categories, translations)) updated[category].push(row)
})
if (!Object.values(updated).some(rows => rows.length)) throw new Error('刷新未生成任何记录')
const tables = {}
for (const key of manifest.selection.categories) {
  if (!categoryNames[key]) continue
  tables[categoryNames[key]] = updated[key] || JSON.parse(readFileSync(join(directory, 'data', `${key}.json`), 'utf8'))
}
const viewerLinks = Object.fromEntries((tables.装甲 || []).filter(row =>
  existsSync(join(directory, 'armor', 'ships', `${row.编号}.js`)))
  .map(row => [row.编号, `armor/index.html?ship=${row.编号}`]))
manifest.note = '各比较页按舰船配置组织，独立实体见参数页。旧版列对齐状态和计算条件见各表说明；待核实列保留为空，不以旧版本数值填充。装甲各配置和各层厚度不相加。'
if (!generateHTML(tables, join(directory, 'index.html'), manifest.gameVersion, { ...manifest, viewerLinks })) throw new Error('页面刷新失败')
for (const [key, rows] of Object.entries(updated)) {
  writeFileSync(join(directory, 'data', `${key}.json`), JSON.stringify(rows))
  manifest.counts[key] = rows.length
}
if (manifest.formats.markdown) writeMarkdown(Object.fromEntries(Object.entries(updated).map(([key, rows]) => [categoryNames[key], rows])), directory, manifest)
manifest.displayUpdatedAt = new Date().toISOString()
manifest.displaySchema = 'ship-comparison-v2'
manifest.columnCoverage = writeColumnCoverage(tables, directory)
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
console.log('比较表已刷新：', manifest.displayUpdatedAt, Object.fromEntries(categories.map(key => [key, manifest.counts[key]])))
