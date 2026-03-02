/**
 * 初始化数据获取模块
 * 从 index 页面获取 I18N、shipName、serverVersion
 */

import https from 'https'

const BASE_URL = 'https://iwarship.net'
const DEFAULT_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

/**
 * 简单的 HTTPS 请求
 */
function httpsRequest(url, cookie = '') {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url)

    const headers = {
      'User-Agent': DEFAULT_UA,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
    }

    if (cookie) {
      headers['Cookie'] = cookie
    }

    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers
    }

    const req = https.request(options, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => resolve(data))
    })

    req.on('error', reject)
    req.setTimeout(30000, () => {
      req.destroy()
      reject(new Error('请求超时'))
    })

    req.end()
  })
}

/**
 * 获取 index 页面并解析关键数据
 * @returns {Object} - { i18n, shipName, serverVersion, versionId }
 */
export async function fetchIndexData(cookie = '') {
  console.log('📡 获取 index 页面...')

  const url = `${BASE_URL}/wowsdb/index`
  const html = await httpsRequest(url, cookie)

  if (!html) {
    throw new Error('无法获取 index 页面')
  }

  // 解析 I18N - HTML 中使用了 \" 转义
  let i18n = {}
  const i18nMatch = html.match(/var I18N = \[\];\s*I18N\['zh-cn'\] = JSON\.parse\("(\{.*?})"\)/s)
  if (i18nMatch) {
    try {
      const unescaped = i18nMatch[1]
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\')
      i18n = JSON.parse(unescaped)
    } catch (e) {
      console.warn('⚠️ I18N 解析失败:', e.message)
    }
  }

  // 解析 shipName - HTML 中使用了 \" 转义
  let shipName = {}
  const shipNameMatch = html.match(/var shipName = JSON\.parse\("(\{.*?})"\)/s)
  if (shipNameMatch) {
    try {
      const unescaped = shipNameMatch[1]
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\')
      shipName = JSON.parse(unescaped)
    } catch (e) {
      console.warn('⚠️ shipName 解析失败:', e.message)
    }
  }

  // 解析 serverVersion
  let serverVersion = {}
  let versionId = 369 // 默认值
  let gameVersion = '' // 游戏版本号
  const versionPatterns = [
    /var serverVersion = (\{[^;]+\});/,
    /serverVersion\s*=\s*(\{[^;]+\});/
  ]
  for (const pattern of versionPatterns) {
    const match = html.match(pattern)
    if (match) {
      try {
        serverVersion = JSON.parse(match[1])
        if (serverVersion.ASIA?.versionId) {
          versionId = serverVersion.ASIA.versionId
        }
        if (serverVersion.ASIA?.gameVersion) {
          gameVersion = serverVersion.ASIA.gameVersion
        }
        break
      } catch (e) {}
    }
  }

  console.log(`✅ 获取成功`)
  console.log(`   - I18N 条目: ${Object.keys(i18n).length}`)
  console.log(`   - 舰船名称: ${Object.keys(shipName).length}`)
  console.log(`   - 服务器版本: ${Object.keys(serverVersion).join(', ') || '未知'}`)
  console.log(`   - ASIA versionId: ${versionId}`)
  console.log(`   - 游戏版本: ${gameVersion}`)

  return { i18n, shipName, serverVersion, versionId, gameVersion }
}

/**
 * 获取完整的舰船数据
 * @param {number} versionId - 版本 ID
 * @returns {Object} - 全量数据
 */
export async function fetchFullData(versionId, saveRaw = false) {
  console.log(`📡 获取全量数据 (versionId: ${versionId})...`)

  const url = `${BASE_URL}/wowsdb/data/get-ship-detail/${versionId}`

  // JSON 请求
  const rawData = await fetchJSON(url)

  if (!rawData) {
    throw new Error('无法获取数据')
  }

  // 保存原始数据用于调试
  if (saveRaw) {
    const { writeFileSync } = await import('fs')
    writeFileSync('./temp_raw_data.json', JSON.stringify(rawData, null, 2))
    console.log('💾 已保存原始数据到 temp_raw_data.json')
  }

  // API 返回的数据中每个字段的值是字符串化的 JSON，需要解析
  const jsonData = {}
  for (const [key, value] of Object.entries(rawData)) {
    if (typeof value === 'string') {
      try {
        jsonData[key] = JSON.parse(value)
      } catch (e) {
        jsonData[key] = []
        console.warn(`⚠️ 解析 ${key} 失败`)
      }
    } else {
      jsonData[key] = value
    }
  }

  // 统计
  const categories = Object.keys(jsonData)
  const totalRecords = categories.reduce((sum, cat) => sum + (jsonData[cat]?.length || 0), 0)

  console.log(`✅ 数据获取成功`)
  console.log(`   - 数据类别: ${categories.length}`)
  console.log(`   - 总记录数: ${totalRecords}`)

  return jsonData
}

/**
 * 发送 JSON 请求
 */
async function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url)

    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: {
        'User-Agent': DEFAULT_UA,
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'X-Requested-With': 'XMLHttpRequest'
      }
    }

    const req = https.request(options, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try {
          resolve(JSON.parse(data))
        } catch (e) {
          reject(new Error('JSON 解析失败: ' + data.slice(0, 100)))
        }
      })
    })

    req.on('error', reject)
    req.setTimeout(60000, () => {  // 全量数据较大，增加超时时间
      req.destroy()
      reject(new Error('请求超时'))
    })

    req.end()
  })
}
