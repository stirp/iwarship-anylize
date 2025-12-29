/**
 * Cookie 读取与解析模块
 * 保留原始 URL 编码格式，因为服务器需要编码后的 Cookie
 */

import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/**
 * 解析 Cookie 字符串 (保留原始编码)
 * @param {string} cookieStr - Cookie 字符串
 * @returns {Object} - 解析后的 Cookie 对象 (key 未解码，value 未解码)
 */
export function parseEncodedCookie(cookieStr) {
  const cookies = {}
  if (!cookieStr) return cookies

  // 按分号分割
  const pairs = cookieStr.split(';')

  for (const pair of pairs) {
    const trimmed = pair.trim()
    if (!trimmed) continue

    const eqIndex = trimmed.indexOf('=')
    if (eqIndex > 0) {
      const key = trimmed.substring(0, eqIndex)
      const value = trimmed.substring(eqIndex + 1)
      if (key) {
        cookies[key] = value
      }
    }
  }

  return cookies
}

/**
 * 将 Cookie 对象转换为 header 字符串 (保留原始编码)
 * @param {Object} cookies - Cookie 对象
 * @returns {string} - Cookie header 字符串
 */
export function stringifyCookie(cookies) {
  return Object.entries(cookies)
    .map(([key, value]) => `${key}=${value}`)
    .join('; ')
}

/**
 * 从文件读取 Cookie (保留原始编码)
 * @param {string} filename - Cookie 文件路径
 * @param {string} basePath - 基础路径
 * @returns {Object} - 解析后的 Cookie 对象
 */
export function loadCookie(filename = 'cookie.txt', basePath = __dirname) {
  const filePath = join(basePath, '..', filename)

  try {
    const content = readFileSync(filePath, 'utf-8').trim()
    // 不进行 URL 解码，直接返回
    return parseEncodedCookie(content)
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`Cookie 文件未找到: ${filePath}\n请创建该文件并填入 Cookie`)
    }
    throw error
  }
}

/**
 * 检测 Cookie 是否包含有效会话标识
 * @param {Object} cookies - Cookie 对象
 * @returns {boolean} - 是否有效
 */
export function isValidCookie(cookies) {
  // 检查常见的登录标识
  const loginIndicators = ['wordpress_logged_in', 'sbjs_session', 'session']
  return Object.keys(cookies).some(key =>
    loginIndicators.some(indicator => key.includes(indicator))
  )
}

/**
 * 从 fetch 响应检测是否需要重新登录
 * @param {Response} response - Fetch 响应对象
 * @param {string} url - 请求 URL
 * @returns {boolean} - 是否需要重新登录
 */
export function needsReLogin(response, url) {
  // 检查是否重定向到登录页
  if (response.url && response.url.includes('/login')) {
    return true
  }

  // 检查响应状态
  if (response.status === 401 || response.status === 403) {
    return true
  }

  return false
}
