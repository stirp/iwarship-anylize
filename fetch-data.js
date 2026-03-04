#!/usr/bin/env node
/**
 * iwarship-anylize 主入口脚本
 *
 * 流程：
 * 1. 从 /wowsdb/index 获取 I18N、shipName、serverVersion
 * 2. 从 serverVersion.ASIA.versionId 获取版本号
 * 3. 请求 /wowsdb/data/get-ship-detail 获取全量数据
 * 4. 生成 HTML（CSV 导出功能集成在 HTML 页面中）
 *
 * 用法:
 *   node fetch-data.js                    # 使用默认 cookie.txt
 *   node fetch-data.js --cookie custom.txt # 使用自定义 Cookie 文件
 *   node fetch-data.js --no-html          # 不生成网页
 *
 * 输出目录: output/
 */

import { mkdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

// 导入模块
import { fetchIndexData, fetchFullData } from './lib/index-fetcher.js'
import { loadMapping, transformData, setPresets } from './lib/csv-writer.js'
import { generateHTML } from './lib/html-writer.js'
// preset 数据在内存中使用，不写入文件

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// 默认配置
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
  -o, --output <dir>   输出目录 (默认: output)
      --no-html        不生成网页
  -h, --help           显示帮助信息
  -v, --verbose        详细输出模式

示例:
  node fetch-data.js
  node fetch-data.js --no-html
`)
}

/**
 * 解析命令行参数
 */
function parseArgs() {
  const args = process.argv.slice(2)
  const options = {
    outputDir: DEFAULT_OUTPUT_DIR,
    verbose: false,
    generateHTML: true
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
  console.log(`   输出目录:   ${options.outputDir}`)
  console.log(`   生成网页:   ${options.generateHTML ? '是' : '否'}`)
  console.log('')

  // 1. 确保输出目录存在
  const outputDir = join(__dirname, options.outputDir)
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true })
    console.log(`📁 创建目录: ${outputDir}`)
  }
  console.log('')

  // 2. 获取 index 页面数据 (I18N, shipName, versionId)
  console.log('🔄 步骤 1: 获取初始化数据...\n')

  const indexData = await fetchIndexData()

  // 设置预设数据供转换函数使用
  setPresets(indexData.shipName, indexData.i18n)

  const versionId = indexData.versionId || 369

  // 3. 获取全量数据
  console.log('')
  console.log(`🔄 步骤 2: 获取全量数据 (versionId: ${versionId})...\n`)

  const fullData = await fetchFullData(versionId, options.verbose)

  // API Key 到 类别名的映射
  const categoryMapping = {
    'hull': '船体',
    'artillery': '火炮',
    'torpedoes': '鱼雷',
    'aircraft': '飞机',
    'atba': '副炮',
    'airSupport': '空袭',
    'airDefense': '防空',
    'pingerGun': '声呐',
    'asw': '反潜武器',
    'ability': '消耗品',
    'penetration': '弹道穿深',
    'specials': '特色'
  }

  // 4. 生成网页（需要先转换数据）
  // CSV/Excel 导出功能集成在 HTML 页面中，点击导出按钮时动态生成
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
  }

  console.log('')
  console.log('📁 输出文件:')
  if (options.generateHTML) {
    console.log(`   网页:    ${outputDir}/index.html`)
  }
  console.log('')
  console.log('💡 提示: 在 HTML 页面中点击"导出"按钮可下载 CSV')

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
