#!/usr/bin/env node
/**
 * iwarship-anylize 主入口脚本
 *
 * 新流程：
 * 1. 从 /wowsdb/index 获取 I18N、shipName、serverVersion
 * 2. 从 serverVersion.ASIA.versionId 获取版本号 (369)
 * 3. 请求 /wowsdb/data/get-ship-detail/369 获取全量数据
 * 4. 生成 CSV、Excel、HTML
 *
 * 用法:
 *   node fetch-data.js                    # 使用默认 cookie.txt
 *   node fetch-data.js --cookie custom.txt # 使用自定义 Cookie 文件
 *   node fetch-data.js --no-excel          # 不生成 Excel
 *   node fetch-data.js --no-html          # 不生成网页
 *
 * 输出目录: data/
 */

import { mkdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

// 导入模块
import { loadCookie, isValidCookie } from './lib/cookie.js'
import { fetchIndexData, fetchFullData } from './lib/index-fetcher.js'
import { writeAllCSVs, loadMapping, generateCSV, transformData } from './lib/csv-writer.js'
import { exportDataToExcel } from './lib/excel-writer.js'
import { generateHTML, generateCategoryHTML } from './lib/html-writer.js'
import { saveJSON } from './lib/preset.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// 默认配置
const DEFAULT_COOKIE_FILE = 'cookie.txt'
const DEFAULT_DATA_DIR = 'data'
const DEFAULT_PRESET_DIR = 'preset'
const DEFAULT_OUTPUT_DIR = 'output'

/**
 * 显示使用帮助
 */
function showHelp() {
  console.log(`
🏴‍☠️ iwarship-anylize - 战舰世界数据抓取工具

用法:
  node fetch-data.js [选项]

选项:
  -c, --cookie <file>  Cookie 文件路径 (默认: cookie.txt)
  -o, --output <dir>   输出目录 (默认: output)
      --no-excel       不生成 Excel 文件
      --no-html        不生成网页
      --skip-preset    跳过下载 I18N 和 shipName
  -h, --help           显示帮助信息
  -v, --verbose        详细输出模式

示例:
  node fetch-data.js
  node fetch-data.js --cookie my-cookie.txt
  node fetch-data.js --no-html
`)
}

/**
 * 解析命令行参数
 */
function parseArgs() {
  const args = process.argv.slice(2)
  const options = {
    cookieFile: DEFAULT_COOKIE_FILE,
    dataDir: DEFAULT_DATA_DIR,
    presetDir: DEFAULT_PRESET_DIR,
    outputDir: DEFAULT_OUTPUT_DIR,
    verbose: false,
    generateExcel: true,
    generateHTML: true,
    skipPreset: false
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]

    if (arg === '-h' || arg === '--help') {
      showHelp()
      process.exit(0)
    }

    if (arg === '-v' || arg === '--verbose') {
      options.verbose = true
      continue
    }

    if ((arg === '-c' || arg === '--cookie') && i + 1 < args.length) {
      options.cookieFile = args[++i]
      continue
    }

    if ((arg === '-o' || arg === '--output') && i + 1 < args.length) {
      options.outputDir = args[++i]
      continue
    }

    if (arg === '--no-excel') {
      options.generateExcel = false
      continue
    }

    if (arg === '--no-html') {
      options.generateHTML = false
      continue
    }

    if (arg === '--skip-preset') {
      options.skipPreset = true
      continue
    }
  }

  return options
}

/**
 * 主函数
 */
async function main() {
  console.log('')
  console.log('🏴‍☠️ iwarship-anylize - 战舰世界数据抓取工具')
  console.log('='.repeat(50))
  console.log('')

  // 解析参数
  const options = parseArgs()

  // 显示配置
  console.log('📋 配置:')
  console.log(`   Cookie 文件: ${options.cookieFile}`)
  console.log(`   数据目录:   ${options.dataDir}`)
  console.log(`   预设目录:   ${options.presetDir}`)
  console.log(`   输出目录:   ${options.outputDir}`)
  console.log(`   生成 Excel: ${options.generateExcel ? '是' : '否'}`)
  console.log(`   生成网页:   ${options.generateHTML ? '是' : '否'}`)
  console.log(`   跳过预设:   ${options.skipPreset ? '是' : '否'}`)
  console.log('')

  // 1. 确保目录存在
  const dataDir = join(__dirname, options.dataDir)
  const presetDir = join(__dirname, options.presetDir)
  const outputDir = join(__dirname, options.outputDir)

  for (const dir of [dataDir, presetDir, outputDir]) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
      console.log(`📁 创建目录: ${dir}`)
    }
  }
  console.log('')

  // 2. 获取 index 页面数据 (I18N, shipName, versionId)
  console.log('🔄 步骤 1: 获取初始化数据...\n')

  // 加载 cookie
  let cookieString = ''
  try {
    const cookies = loadCookie(options.cookieFile)
    cookieString = Object.entries(cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join('; ')
    console.log('🔐 已加载 Cookie')
  } catch (e) {
    console.log('⚠️ 无法加载 Cookie，将使用匿名请求')
  }

  let indexData
  if (options.skipPreset) {
    console.log('⚠️ 跳过预设下载，使用现有文件')
    indexData = { versionId: 369, gameVersion: '' } // 默认值
  } else {
    indexData = await fetchIndexData(cookieString)

    // 保存 I18N
    console.log('💾 保存 I18N...')
    saveJSON(join(presetDir, 'i18n.json'), indexData.i18n)

    // 保存 shipName
    console.log('💾 保存舰船名称...')
    saveJSON(join(presetDir, 'name.json'), indexData.shipName)
  }

  const versionId = indexData.versionId || 369

  // 3. 获取全量数据
  console.log('')
  console.log(`🔄 步骤 2: 获取全量数据 (versionId: ${versionId})...\n`)

  const fullData = await fetchFullData(versionId)

  // 4. 写入分类数据到 CSV
  console.log('')
  console.log('🔄 步骤 3: 写入 CSV 文件...\n')

  // 将全量数据按类别写入
  const categoryMapping = {
    'airSupport': '空袭',
    'specials': '特色',
    'aircraft': '飞机',
    'torpedoes': '鱼雷',
    'asw': '反潜武器',
    'penetration': '弹道穿深',
    'ability': '消耗品',
    'airDefense': '防空',
    'atba': '副炮',
    'artillery': '火炮',
    'hull': '船体',
    'pingerGun': '声呐'  // 新增！
  }

  let successCount = 0
  let failedCount = 0

  for (const [apiKey, categoryName] of Object.entries(categoryMapping)) {
    const records = fullData[apiKey]
    if (!records || records.length === 0) {
      console.log(`   ⚠️ ${categoryName}: 无数据`)
      continue
    }

    // 写入 CSV
    const { writeCSV } = await import('./lib/csv-writer.js')
    const mapping = loadMapping(categoryName)
    const filepath = join(dataDir, `${categoryName}.csv`)

    if (mapping) {
      const success = writeCSV(filepath, records, mapping)
      if (success) {
        console.log(`   ✅ ${categoryName}: ${records.length} 条记录`)
        successCount++
      } else {
        console.log(`   ❌ ${categoryName}: 写入失败`)
        failedCount++
      }
    } else {
      // 无 mapping 时直接写入 JSON
      saveJSON(filepath.replace('.csv', '.json'), records)
      console.log(`   ✅ ${categoryName}: ${records.length} 条记录 (JSON)`)
      successCount++
    }
  }

  console.log('')
  console.log(`📊 CSV 写入统计: ${successCount} 成功, ${failedCount} 失败`)

  // 5. 生成 Excel
  if (options.generateExcel) {
    console.log('')
    console.log('🔄 步骤 4: 生成 Excel 文件...\n')

    const excelPath = join(outputDir, 'wows-data.xlsx')
    await exportDataToExcel(fullData, {}, excelPath)
  }

  // 6. 生成网页（需要先转换数据）
  if (options.generateHTML) {
    console.log('')
    console.log('🔄 步骤 5: 生成网页...\n')

    // 转换数据并生成网页
    const htmlData = {}
    for (const [apiKey, categoryName] of Object.entries(categoryMapping)) {
      const records = fullData[apiKey]
      if (records && records.length > 0) {
        const mapping = loadMapping(categoryName)
        if (mapping) {
          htmlData[categoryName] = transformData(records, mapping)
        } else {
          htmlData[categoryName] = records
        }
      }
    }

    const indexPath = join(outputDir, 'index.html')
    const gameVersion = indexData.gameVersion || ''
    generateHTML(htmlData, indexPath, gameVersion)

    // 为每个类别生成独立页面
    for (const [apiKey, categoryName] of Object.entries(categoryMapping)) {
      if (htmlData[categoryName]) {
        generateCategoryHTML(categoryName, htmlData[categoryName], join(outputDir, `${categoryName}.html`))
      }
    }
  }

  console.log('')
  console.log('📁 输出文件:')
  console.log(`   数据 CSV: ${dataDir}/`)
  console.log(`   预设数据: ${presetDir}/`)
  if (options.generateExcel) {
    console.log(`   Excel:   ${outputDir}/wows-data.xlsx`)
  }
  if (options.generateHTML) {
    console.log(`   网页:    ${outputDir}/index.html`)
  }

  console.log('')
  console.log('✨ 完成！')
  console.log('')
}

// 执行主函数
main().catch(error => {
  console.error('\n❌ 发生错误:', error.message)
  console.error(error.stack)
  process.exit(1)
})
