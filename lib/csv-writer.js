/**
 * CSV 写入模块
 * 负责数据转换和 CSV 文件生成
 */

import { readFileSync, writeFileSync } from 'fs'
import { stringify } from 'csv-stringify/sync'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// 预设数据路径
const NAME_FILE = join(__dirname, '..', 'preset', 'name.json')
const I18N_FILE = join(__dirname, '..', 'preset', 'i18n.json')

// 舰船名称映射缓存
let nameCache = null
let i18nCache = null

/**
 * 加载预设数据
 */
function loadPresets() {
  if (!nameCache) {
    try {
      nameCache = JSON.parse(readFileSync(NAME_FILE, 'utf-8'))
    } catch {
      nameCache = {}
    }
  }

  if (!i18nCache) {
    try {
      i18nCache = JSON.parse(readFileSync(I18N_FILE, 'utf-8'))
    } catch {
      i18nCache = {}
    }
  }

  return { nameCache, i18nCache }
}

/**
 * 加载映射文件
 * @param {string} category - 类别名称
 * @returns {Object} - 映射配置
 */
export function loadMapping(category) {
  const mappingPath = join(__dirname, '..', 'mapping', `${category}mapping.json`)

  try {
    return JSON.parse(readFileSync(mappingPath, 'utf-8'))
  } catch (error) {
    console.error(`❌ 映射文件加载失败: ${mappingPath}`)
    return null
  }
}

/**
 * 根据映射转换单条记录
 * @param {Object} record - 原始数据记录
 * @param {Object} mapping - 字段映射配置
 * @returns {Object} - 转换后的记录
 */
function transformRecord(record, mapping) {
  const result = {}

  for (const [outputKey, jqPath] of Object.entries(mapping)) {
    // 跳过 i18nkey
    if (outputKey === 'i18nkey') continue

    try {
      // 处理特殊格式: (.field + .other.field)
      if (jqPath.startsWith('(') && jqPath.endsWith(')')) {
        // 简单的字段拼接表达式
        const match = jqPath.match(/\(([^)]+)\)/)
        if (match) {
          const expr = match[1]
          // 替换点分隔符为空 (例如 ".index + .upgrade.air" -> ".index" 和 ".upgrade.air")
          const parts = expr.split('+').map(p => p.trim())
          let value = ''

          for (const part of parts) {
            const cleanPart = part.replace(/\./g, '')
            const trimmedPart = cleanPart.replace(/\s/g, '')
            const val = getNestedValue(record, trimmedPart)
            if (val !== null && val !== undefined) {
              value += String(val)
            }
          }

          result[outputKey] = value
        }
      } else if (jqPath.includes('|')) {
        // 条件处理: (.field | if type == "array" then join("|") else . end)
        const match = jqPath.match(/"\(([^)]+)\)"/)
        if (match) {
          const field = match[1]
          const cleanField = field.replace(/"/g, '')
          const val = getNestedValue(record, cleanField)

          if (Array.isArray(val)) {
            result[outputKey] = val.join('|')
          } else {
            result[outputKey] = val
          }
        } else {
          result[outputKey] = getNestedValue(record, jqPath.slice(1))
        }
      } else {
        // 普通字段路径
        result[outputKey] = getNestedValue(record, jqPath.slice(1))
      }
    } catch (error) {
      result[outputKey] = null
    }
  }

  return result
}

/**
 * 获取嵌套字段值
 * @param {Object} obj - 源对象
 * @param {string} path - 路径 (如 "upgrade.hull")
 * @returns {*} - 字段值
 */
function getNestedValue(obj, path) {
  const keys = path.split('.')
  let current = obj

  for (const key of keys) {
    if (current === null || current === undefined) {
      return null
    }
    current = current[key]
  }

  return current
}

/**
 * 替换名称占位符
 * @param {Object} records - 转换后的记录数组
 * @returns {Object[]} - 替换后的记录
 */
function replaceNames(records) {
  const { nameCache } = loadPresets()

  return records.map(record => {
    const newRecord = { ...record }

    // 尝试用小写键查找名称
    for (const [key, value] of Object.entries(newRecord)) {
      if (value && typeof value === 'string' && value.length > 0) {
        const lowerKey = value.toLowerCase()
        if (nameCache[lowerKey] && nameCache[lowerKey].zh) {
          newRecord[key] = nameCache[lowerKey].zh
        }
      }
    }

    return newRecord
  })
}

/**
 * 替换 i18n key
 * @param {Object} records - 记录数组
 * @param {Object} mapping - 映射配置
 * @returns {Object[]} - 替换后的记录
 */
function replaceI18n(records, mapping) {
  const { i18nCache } = loadPresets()
  const i18nKeyPath = mapping.i18nkey

  if (!i18nKeyPath) return records

  return records.map(record => {
    const newRecord = { ...record }

    // 查找 i18n key
    const i18nKey = getNestedValue(record, i18nKeyPath.replace('.', ''))

    if (i18nKey && Array.isArray(i18nKey) && i18nKey.length > 0) {
      for (const key of i18nKey) {
        const lowerKey = key.toLowerCase()
        if (i18nCache[lowerKey]) {
          // 替换所有匹配的 i18n key
          for (const [field, value] of Object.entries(newRecord)) {
            if (value === key || (typeof value === 'string' && value.includes(key))) {
              newRecord[field] = i18nCache[lowerKey]
            }
          }
        }
      }
    }

    return newRecord
  })
}

/**
 * 应用枚举值映射
 * @param {Object} record - 单条记录
 * @returns {Object} - 映射后的记录
 */
function applyEnumMappings(record) {
  const result = { ...record }

  // 舰船类型
  const shipTypes = {
    'Battleship': '战列舰',
    'Destroyer': '驱逐舰',
    'Cruiser': '巡洋舰',
    'AirCarrier': '航空母舰',
    'Submarine': '潜艇'
  }

  if (result['舰种'] && shipTypes[result['舰种']]) {
    result['舰种'] = shipTypes[result['舰种']]
  }

  // 类型分组
  const groups = {
    'demoWithoutStats': '测试',
    'demoWithStats': '测试',
    'earlyAccess': '抢先体验',
    'specialUnsellable': '不可出售',
    'special': '加值',
    'start': '初始',
    'superShip': '超战',
    'ultimate': '特种',
    'upgradeableExclusive': '全局研发',
    'upgradeableUltimate': '全局特种',
    'upgradeable': '研发'
  }

  if (result['类型'] && groups[result['类型']]) {
    result['类型'] = groups[result['类型']]
  }

  // 国家
  const nations = {
    'Commonwealth': '英联邦',
    'Europe': '欧洲',
    'France': '法国',
    'Germany': '德国',
    'Italy': '意大利',
    'Spain': '西班牙',
    'Japan': '日本',
    'Netherlands': '荷兰',
    'Russia': '苏联',
    'United_Kingdom': '英国',
    'USA': '美国',
    'Pan_Asia': '泛亚',
    'Pan_America': '泛美洲'
  }

  if (result['国家'] && nations[result['国家']]) {
    result['国家'] = nations[result['国家']]
  }

  return result
}

/**
 * 生成 CSV 字符串
 * @param {Object[]} data - 数据数组
 * @param {Object} mapping - 字段映射
 * @returns {string} - CSV 字符串
 */
export function generateCSV(data, mapping) {
  if (!data || data.length === 0) {
    return ''
  }

  // 获取列名 (排除 i18nkey)
  const columns = Object.keys(mapping).filter(key => key !== 'i18nkey')

  // 转换数据
  let transformed = data.map(record => transformRecord(record, mapping))
  transformed = transformed.map(record => applyEnumMappings(record))
  transformed = replaceNames(transformed)

  // 添加表头
  const output = []

  // 表头行
  output.push(columns)

  // 数据行
  for (const record of transformed) {
    const row = columns.map(col => {
      const value = record[col]
      if (value === null || value === undefined) {
        return ''
      }
      if (typeof value === 'object') {
        return JSON.stringify(value)
      }
      return String(value)
    })
    output.push(row)
  }

  // 转换为 CSV 字符串
  return stringify(output)
}

/**
 * 写入 CSV 文件
 * @param {string} filepath - 输出文件路径
 * @param {Object[]} data - 数据数组
 * @param {Object} mapping - 字段映射
 * @returns {boolean} - 是否成功
 */
export function writeCSV(filepath, data, mapping) {
  try {
    const csv = generateCSV(data, mapping)

    if (!csv) {
      console.warn(`⚠️ 无数据可写入: ${filepath}`)
      return false
    }

    // 添加 UTF-8 BOM 以便 Excel 正确识别中文
    const BOM = '\uFEFF'
    writeFileSync(filepath, BOM + csv, 'utf-8')

    console.log(`✅ 已生成: ${filepath}`)
    return true

  } catch (error) {
    console.error(`❌ CSV 写入失败: ${filepath}`)
    console.error(`   错误: ${error.message}`)
    return false
  }
}

/**
 * 批量写入多个 CSV 文件
 * @param {Object} allData - 所有类别的数据
 * @param {string} outputDir - 输出目录
 * @returns {Object} - 写入结果统计
 */
export async function writeAllCSVs(allData, outputDir) {
  const results = {
    success: 0,
    failed: 0,
    files: []
  }

  for (const [category, data] of Object.entries(allData)) {
    const mapping = loadMapping(category)

    if (!mapping) {
      results.failed++
      continue
    }

    const filepath = join(outputDir, `${category}.csv`)

    // 使用 setImmediate 在主线程中写入
    await new Promise(resolve => setImmediate(resolve))

    const success = writeCSV(filepath, data, mapping)

    if (success) {
      results.success++
      results.files.push(filepath)
    } else {
      results.failed++
    }
  }

  return results
}
