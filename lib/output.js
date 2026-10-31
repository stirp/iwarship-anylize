import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { categoryNames } from './categories.js'
import { generateHTML } from './html-writer.js'
import { generateArmorViewer } from './armor-viewer-writer.js'
import { summarizeArmor } from './armor-summary.js'
import { columnCoverage } from './gameparams-legacy-columns.js'

export function writeColumnCoverage(tables, directory) {
  const coverage = Object.fromEntries(Object.entries(tables).map(([category, rows]) => [category, columnCoverage(category, rows)])
    .filter(([, columns]) => columns.length))
  writeFileSync(join(directory, 'data', 'column-coverage.json'), JSON.stringify(coverage, null, 2))
  const lines = ['# 旧版列对齐清单', '', '对应旧版字段映射；当前版本数据不从旧页面复制。待核实项保留为空，当前范围无值不等于零。', '']
  for (const [category, columns] of Object.entries(coverage)) {
    lines.push(`## ${category}`, '', '| 旧版列 | 当前列 | 状态 | 有值行数 | 说明 |', '| --- | --- | --- | ---: | --- |')
    for (const column of columns) lines.push(`| ${column.original} | ${column.target} | ${column.status} | ${column.populated} | ${column.reason} |`)
    lines.push('')
  }
  writeFileSync(join(directory, 'column-coverage.md'), lines.join('\n'))
  return 'data/column-coverage.json'
}

export function safeSegment(value) {
  const text = String(value)
  if (/^[\p{L}\p{N}_.-]+$/u.test(text) && text !== '.' && text !== '..') return text
  return `${text.replace(/[^\p{L}\p{N}_.-]/gu, '_').slice(0, 80)}-${createHash('sha256').update(text).digest('hex').slice(0, 8)}`
}

export function createOutputDirectory(root, source, version, region) {
  // 同一来源、版本和区域维护固定入口；模型单独刷新，不创建历史快照。
  const directory = join(root, source, safeSegment(version), safeSegment(region))
  mkdirSync(directory, { recursive: true })
  return directory
}

export function writeMarkdown(tables, directory, metadata) {
  const cell = value => String(value ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>')
  for (const [category, rows] of Object.entries(tables)) {
    const groups = new Map()
    for (const row of rows) {
      const identity = row['编号'] || row['名字'] || row['名称'] || category
      if (!groups.has(identity)) groups.set(identity, [])
      groups.get(identity).push(row)
    }
    const target = join(directory, 'markdown', category)
    mkdirSync(target, { recursive: true })
    for (const [identity, records] of groups) {
      // 单配置保留 Dataview 统计字段；多配置不将某一行伪装为整舰属性。
      const attributes = records.length === 1 ? { ...records[0] } : {}
      for (const name of ['英文名字', '中文名字']) {
        if (records[0][name]) attributes[name] = records[0][name]
      }
      Object.assign(attributes, { 来源: metadata.source, 版本: metadata.gameVersion, 区域: metadata.region, 编号: identity })
      const lines = ['---', ...Object.entries(attributes)
        .filter(([, value]) => value !== undefined && value !== null)
        .map(([key, value]) => `${JSON.stringify(key)}: ${JSON.stringify(value)}`), '---', '', `# ${cell(identity)}`, '']
      for (const row of records) {
        lines.push(`## ${cell(row['名字'] || row['名称'] || identity)} ${cell(row['配置'] || '')}`, '', '| 属性 | 值 |', '| --- | --- |')
        for (const [key, value] of Object.entries(row)) {
          if (value !== undefined && value !== null) lines.push(`| ${cell(key)} | ${cell(value)} |`)
        }
        lines.push('')
      }
      writeFileSync(join(target, `${safeSegment(identity)}.md`), lines.join('\n'))
    }
  }
}

/** 两个来源共用文件输出；manifest 最后写入，代表该批次已完成。 */
export async function writeOutput(tablesByKey, directory, metadata, options) {
  const tables = {}
  const counts = {}
  const dataDir = join(directory, 'data')
  mkdirSync(dataDir, { recursive: true })
  const armorDetails = tablesByKey.armor
  const displayTables = armorDetails ? { ...tablesByKey, armor: summarizeArmor(armorDetails) } : tablesByKey
  if (armorDetails) writeFileSync(join(dataDir, 'armor-details.json'), JSON.stringify(armorDetails))
  for (const [key, rows] of Object.entries(displayTables)) {
    counts[key] = rows.length
    writeFileSync(join(dataDir, `${key}.json`), JSON.stringify(rows))
    if (rows.length) tables[categoryNames[key]] = rows
  }
  if (!Object.keys(tables).length) throw new Error(`${metadata.source}/${metadata.region} 所选范围没有可输出的数据`)
  const viewer = armorDetails?.length ? await generateArmorViewer({ armor: armorDetails }, directory, metadata, options) : null
  if (options.generateHTML && !generateHTML(tables, join(directory, 'index.html'), metadata.gameVersion, { ...metadata, viewerLinks: viewer?.links })) {
    throw new Error('网页生成失败')
  }
  if (options.generateMarkdown) writeMarkdown(tables, directory, metadata)
  const columnCoveragePath = metadata.source === 'gameparams' ? writeColumnCoverage(tables, directory) : null
  const manifest = { ...metadata, generatedAt: new Date().toISOString(), counts, columnCoverage: columnCoveragePath,
    armorDetails: armorDetails ? { path: 'data/armor-details.json', count: armorDetails.length } : null,
    viewer: viewer ? { path: viewer.path, ships: viewer.ships, modelSource: viewer.modelSource,
      embeddedModels: viewer.embeddedModels, modelFailures: viewer.modelFailures } : null,
    selection: { ships: options.ships, categories: Object.keys(tablesByKey) },
    formats: { json: true, html: options.generateHTML, markdown: options.generateMarkdown, raw: Boolean(options.verbose) } }
  writeFileSync(join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2))
  console.log(`输出完成：${directory}`)
  return manifest
}
