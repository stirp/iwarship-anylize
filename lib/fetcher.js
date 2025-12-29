/**
 * HTTP 请求模块
 * 使用 Node.js HTTPS 模块，支持 Cookie、UA、请求重试
 */

import https from 'https'
import { stringifyCookie, needsReLogin } from './cookie.js'

// 配置常量
const BASE_URL = 'https://iwarship.net/wowsdb/data/get-ship-data'
const DEFAULT_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const REQUEST_DELAY = 1000 // 请求间隔 (ms)
const MAX_RETRIES = 3

// 数据类别映射
export const DATA_CATEGORIES = {
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
 * 睡眠函数
 * @param {number} ms - 毫秒数
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * HTTPS 请求封装
 * @param {string} url - 请求 URL
 * @param {Object} cookies - Cookie 对象
 * @returns {Promise<string>} - 响应文本
 */
function httpsRequest(url, cookies) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url)

    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: {
        'User-Agent': DEFAULT_UA,
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Referer': 'https://iwarship.net/wowsdb/',
        'Origin': 'https://iwarship.net',
        'Cookie': stringifyCookie(cookies)
      }
    }

    const req = https.request(options, (res) => {
      let data = ''

      res.on('data', (chunk) => {
        data += chunk
      })

      res.on('end', () => {
        resolve({ status: res.statusCode, data })
      })
    })

    req.on('error', (e) => {
      reject(e)
    })

    req.setTimeout(30000, () => {
      req.destroy()
      reject(new Error('Request timeout'))
    })

    req.end()
  })
}

/**
 * 检测响应是否有效
 * @param {number} status - HTTP 状态码
 * @param {string} data - 响应数据
 * @param {string} url - 请求 URL
 * @returns {boolean} - 是否有效
 */
function isValidResponse(status, data, url) {
  if (status !== 200) {
    console.error(`❌ HTTP 错误: ${status}`)
    return false
  }

  // 检查是否需要重新登录
  if (data.includes('login') || data.includes('Login')) {
    if (url.includes('/login')) {
      console.error('⚠️ 检测到需要重新登录，请更新 cookie.txt')
      return false
    }
  }

  // 检查是否是有效 JSON 数组
  try {
    const parsed = JSON.parse(data)
    if (!Array.isArray(parsed)) {
      console.warn(`⚠️ 返回数据不是数组`)
      return false
    }
  } catch {
    console.warn(`⚠️ 返回数据不是有效 JSON`)
    return false
  }

  return true
}

/**
 * 获取单个类别的数据
 * @param {string} categoryName - 类别名称 (中文)
 * @param {Object} cookies - Cookie 对象
 * @param {boolean} verbose - 是否显示详细日志
 * @returns {Object|null} - 解析后的 JSON 数据
 */
export async function fetchCategory(categoryName, cookies, verbose = true) {
  const endpoint = DATA_CATEGORIES[categoryName]
  if (!endpoint) {
    console.error(`❌ 未知的类别: ${categoryName}`)
    return null
  }

  const url = `${BASE_URL}/${endpoint}?ptMode=true`

  if (verbose) {
    console.log(`📡 获取 [${categoryName}] 数据...`)
  }

  let lastError = null

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const { status, data } = await httpsRequest(url, cookies)

      if (!isValidResponse(status, data, url)) {
        return null
      }

      // 检查响应是否为空
      if (!data || data.trim().length === 0) {
        console.warn(`⚠️ [${categoryName}] 响应为空`)
        return null
      }

      const parsedData = JSON.parse(data)

      if (parsedData.length === 0) {
        console.warn(`⚠️ [${categoryName}] 数据为空数组`)
        return null
      }

      if (verbose) {
        console.log(`✅ [${categoryName}] 获取成功，共 ${parsedData.length} 条记录`)
      }

      return parsedData

    } catch (error) {
      lastError = error
      console.warn(`⚠️ [${categoryName}] 第 ${attempt}/${MAX_RETRIES} 次尝试失败: ${error.message}`)

      if (attempt < MAX_RETRIES) {
        await sleep(REQUEST_DELAY * attempt) // 递增延迟
      }
    }
  }

  console.error(`❌ [${categoryName}] 多次重试后失败: ${lastError?.message}`)
  return null
}

/**
 * 批量获取所有类别数据 (带进度显示)
 * @param {Object} cookies - Cookie 对象
 * @returns {Object} - 各类别数据对象
 */
export async function fetchAllData(cookies) {
  const categories = Object.keys(DATA_CATEGORIES)
  const total = categories.length

  console.log(`🚀 开始获取 ${total} 个类别的数据...\n`)

  const results = {}
  let successCount = 0

  for (let i = 0; i < categories.length; i++) {
    const category = categories[i]
    const progress = Math.round(((i + 1) / total) * 100)

    // 获取数据
    const data = await fetchCategory(category, cookies, false)

    // 进度显示
    const status = data !== null ? '✅' : '❌'
    console.log(`[${'='.repeat(Math.floor(progress / 2))}${' '.repeat(50 - Math.floor(progress / 2))}] ${progress}% ${status} ${category}`)

    if (data !== null) {
      results[category] = data
      successCount++
    }

    // 请求间隔
    if (i < categories.length - 1) {
      await sleep(REQUEST_DELAY)
    }
  }

  console.log(`\n📊 获取完成: ${successCount}/${total} 个类别成功\n`)

  return results
}
