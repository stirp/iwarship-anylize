import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { categoryNames } from './categories.js'
import { generateHTML } from './html-writer.js'
import { generateArmorViewer } from './armor-viewer-writer.js'

export function safeSegment(value) {
  const text = String(value)
  if (/^[\p{L}\p{N}_.-]+$/u.test(text) && text !== '.' && text !== '..') return text
  return `${text.replace(/[^\p{L}\p{N}_.-]/gu, '_').slice(0, 80)}-${createHash('sha256').update(text).digest('hex').slice(0, 8)}`
}

export function createOutputDirectory(root, source, version, region) {
  // 独立批次避免缩小筛选范围后残留上次生成的舰船文件。
  const run = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`
  const directory = join(root, source, safeSegment(version), safeSegment(region), run)
  mkdirSync(directory, { recursive: true })
  return directory
}

function writeMarkdown(tables, directory, metadata) {
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
  for (const [key, rows] of Object.entries(tablesByKey)) {
    counts[key] = rows.length
    writeFileSync(join(dataDir, `${key}.json`), JSON.stringify(rows))
    if (rows.length) tables[categoryNames[key]] = rows
  }
  if (!Object.keys(tables).length) throw new Error(`${metadata.source}/${metadata.region} 所选范围没有可输出的数据`)
  const viewer = await generateArmorViewer(tablesByKey, directory, metadata, options)
  if (options.generateHTML && !generateHTML(tables, join(directory, 'index.html'), metadata.gameVersion, { ...metadata, viewerLinks: viewer?.links })) {
    throw new Error('网页生成失败')
  }
  if (options.generateMarkdown) writeMarkdown(tables, directory, metadata)
  const manifest = { ...metadata, generatedAt: new Date().toISOString(), counts,
    viewer: viewer ? { path: viewer.path, ships: viewer.ships, modelSource: viewer.modelSource,
      embeddedModels: viewer.embeddedModels, modelFailures: viewer.modelFailures } : null,
    selection: { ships: options.ships, categories: Object.keys(tablesByKey) },
    formats: { json: true, html: options.generateHTML, markdown: options.generateMarkdown, raw: Boolean(options.verbose) } }
  writeFileSync(join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2))
  console.log(`输出完成：${directory}`)
  return manifest
}
