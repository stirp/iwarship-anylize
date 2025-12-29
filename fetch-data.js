#!/usr/bin/env node
/**
 * iwarship-anylize 主入口脚本
 *
 * 用法:
 *   node fetch-data.js                    # 使用默认 cookie.txt
 *   node fetch-data.js --cookie custom.txt # 使用自定义 Cookie 文件
 *
 * 输出目录: data/
 */

import { mkdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

// 导入模块
import { loadCookie, isValidCookie } from './lib/cookie.js'
import { fetchAllData, DATA_CATEGORIES } from './lib/fetcher.js'
import { writeAllCSVs } from './lib/csv-writer.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// 默认配置
const DEFAULT_COOKIE_FILE = 'cookie.txt'
const DEFAULT_OUTPUT_DIR = 'data'

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
  -o, --output <dir>   输出目录 (默认: data)
  -h, --help           显示帮助信息
  -v, --verbose        详细输出模式

示例:
  node fetch-data.js
  node fetch-data.js --cookie my-cookie.txt
  node fetch-data.js --output ./exports
`)
}

/**
 * 解析命令行参数
 */
function parseArgs() {
  const args = process.argv.slice(2)
  const options = {
    cookieFile: DEFAULT_COOKIE_FILE,
    outputDir: DEFAULT_OUTPUT_DIR,
    verbose: false
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
  console.log(`   输出目录:   ${options.outputDir}`)
  console.log(`   数据类别:   ${Object.keys(DATA_CATEGORIES).length} 个`)
  console.log('')

  // 1. 加载 Cookie
  console.log('🔐 加载 Cookie...')

  let cookies
  try {
    cookies = loadCookie(options.cookieFile)
  } catch (error) {
    console.error(`\n❌ ${error.message}\n`)
    console.log('💡 请按以下步骤操作:')
    console.log('   1. 用浏览器登录 https://iwarship.net')
    console.log('   2. 打开开发者工具 (F12) → Network')
    console.log('   3. 刷新页面，找到请求的 Cookie')
    console.log('   4. 复制完整的 Cookie 字符串')
    console.log('   5. 粘贴到 cookie.txt 文件中')
    console.log('')
    process.exit(1)
  }

  if (!isValidCookie(cookies)) {
    console.warn('\n⚠️ 警告: Cookie 可能无效，请检查是否包含登录会话')
  } else {
    console.log('✅ Cookie 加载成功')
  }
  console.log('')

  // 2. 确保输出目录存在
  const outputDir = join(__dirname, options.outputDir)
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true })
    console.log(`📁 创建输出目录: ${options.outputDir}`)
  } else {
    console.log(`📁 使用现有输出目录: ${options.outputDir}`)
  }
  console.log('')

  // 3. 获取数据
  console.log('🌐 开始抓取数据...\n')
  const data = await fetchAllData(cookies)

  // 4. 写入 CSV
  console.log('💾 写入 CSV 文件...\n')

  const writeResults = await writeAllCSVs(data, outputDir)

  console.log('')
  console.log('📊 写入统计:')
  console.log(`   成功: ${writeResults.success} 个文件`)
  console.log(`   失败: ${writeResults.failed} 个文件`)
  console.log('')

  if (writeResults.files.length > 0) {
    console.log('📄 生成的文件:')
    for (const file of writeResults.files) {
      const size = existsSync(file) ? `${(existsSync(file).length / 1024).toFixed(1)} KB` : '未知'
      console.log(`   - ${file}`)
    }
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
