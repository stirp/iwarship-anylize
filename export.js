#!/usr/bin/env node
/**
 * 导出脚本
 * 从已下载的 CSV 数据生成 Excel 和 HTML
 *
 * 用法:
 *   node export.js              # 生成 Excel 和 HTML
 *   node export.js --excel      # 仅生成 Excel
 *   node export.js --html       # 仅生成 HTML
 */

import { existsSync, mkdirSync, readdirSync, readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { loadMapping } from './lib/csv-writer.js'
import { exportDataToExcel } from './lib/excel-writer.js'
import { generateHTML, generateCategoryHTML } from './lib/html-writer.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// 数据类别映射
const DATA_CATEGORIES = {
  '空袭': 'airSupport',
  '特色': 'specials',
  '飞机': 'aircraft',
  '鱼雷': 'torpedoes',
  '反潜武器': 'asw',
  '弹道穿深': 'penetration',
  '消耗品': 'ability',
  '防空': 'airDefense',
  '副炮': 'atba',
  '火炮': 'artillery',
  '船体': 'hull'
}

/**
 * 解析命令行参数
 */
function parseArgs() {
  const args = process.argv.slice(2)
  return {
    dataDir: join(__dirname, 'data'),
    outputDir: join(__dirname, 'output'),
    generateExcel: !args.includes('--html'),
    generateHTML: !args.includes('--excel')
  }
}

/**
 * 读取 CSV 文件
 */
function readCSV(filepath) {
  const content = readFileSync(filepath, 'utf-8')
  const lines = content.split('\n').filter(line => line.trim())

  if (lines.length === 0) return []

  // 解析表头（处理 BOM 和引号）
  const headers = parseCSVLine(lines[0].replace(/^\uFEFF/, ''))

  // 解析数据行
  const data = []
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i])
    if (values.length > 0) {
      const row = {}
      headers.forEach((header, index) => {
        row[header] = values[index] || ''
      })
      data.push(row)
    }
  }

  return data
}

/**
 * 解析 CSV 单行
 */
function parseCSVLine(line) {
  const result = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }

  result.push(current.trim())
  return result
}

/**
 * 主函数
 */
async function main() {
  console.log('')
  console.log('📦 iwarship-anylize 数据导出工具')
  console.log('='.repeat(40))
  console.log('')

  const options = parseArgs()
  const dataDir = options.dataDir
  const outputDir = options.outputDir

  // 确保输出目录存在
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true })
  }

  // 检查数据目录
  if (!existsSync(dataDir)) {
    console.error(`❌ 数据目录不存在: ${dataDir}`)
    console.log('   请先运行: node fetch-data.js')
    process.exit(1)
  }

  // 读取 CSV 文件
  console.log('📂 读取数据文件...')
  const files = readdirSync(dataDir).filter(f => f.endsWith('.csv'))

  if (files.length === 0) {
    console.error(`❌ 数据目录为空: ${dataDir}`)
    process.exit(1)
  }

  const data = {}
  for (const file of files) {
    // 从文件名提取类别（去掉 .csv 后缀）
    let category = file.replace('.csv', '')
    // 如果没有对应的中文类别名，使用文件名
    data[category] = readCSV(join(dataDir, file))
    console.log(`   ${category}: ${data[category].length} 条记录`)
  }

  console.log('')

  // 生成 Excel
  if (options.generateExcel) {
    console.log('📊 生成 Excel 文件...')

    const mappings = {}
    for (const cat of Object.keys(DATA_CATEGORIES)) {
      mappings[cat] = loadMapping(cat)
    }

    // 尝试加载映射，如果没有则使用 CSV 的列名
    for (const [cat, records] of Object.entries(data)) {
      if (records.length > 0 && !mappings[cat]) {
        const headers = Object.keys(records[0])
        mappings[cat] = headers.reduce((acc, h) => { acc[h] = '.' + h; return acc }, {})
      }
    }

    const excelPath = join(outputDir, 'wows-data.xlsx')
    await exportDataToExcel(data, mappings, excelPath)
  }

  // 生成网页
  if (options.generateHTML) {
    console.log('🌐 生成网页...')

    const indexPath = join(outputDir, 'index.html')
    generateHTML(data, indexPath)

    // 为每个类别生成独立页面
    for (const [cat, records] of Object.entries(data)) {
      if (records && records.length > 0) {
        generateCategoryHTML(cat, records, join(outputDir, `${cat}.html`))
      }
    }
  }

  console.log('')
  console.log('📁 输出目录:', outputDir)
  if (options.generateExcel) {
    console.log('   Excel: wows-data.xlsx')
  }
  if (options.generateHTML) {
    console.log('   网页:  index.html')
    console.log('          *.html (各分类页面)')
  }
  console.log('')
  console.log('✨ 完成！')
  console.log('')
}

main().catch(error => {
  console.error('❌ 错误:', error.message)
  process.exit(1)
})
