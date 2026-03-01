/**
 * Excel 导出模块
 * 将 CSV 数据转换为 Excel 文件
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import * as XLSX from 'xlsx'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/**
 * 读取 CSV 文件
 * @param {string} filepath - CSV 文件路径
 * @returns {Array} - CSV 数据数组
 */
function readCSV(filepath) {
  const content = readFileSync(filepath, 'utf-8')
  const lines = content.split('\n').filter(line => line.trim())

  if (lines.length === 0) return []

  // 解析表头
  const headers = parseCSVLine(lines[0])

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
 * @param {string} line - CSV 行
 * @returns {Array} - 解析后的值数组
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
 * 将单个 CSV 转换为 Excel 工作表
 * @param {string} csvPath - CSV 文件路径
 * @returns {Object} - Excel 工作表数据
 */
function csvToSheet(csvPath) {
  if (!existsSync(csvPath)) {
    return null
  }

  const data = readCSV(csvPath)
  if (data.length === 0) {
    return null
  }

  return XLSX.utils.json_to_sheet(data)
}

/**
 * 导出所有 CSV 为 Excel 文件
 * @param {string} dataDir - CSV 数据目录
 * @param {string} outputPath - 输出 Excel 路径
 * @returns {boolean} - 是否成功
 */
export function exportToExcel(dataDir, outputPath) {
  try {
    const workbook = XLSX.utils.book_new()

    // 读取所有 CSV 文件
    const fs = require('fs')
    const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.csv'))

    for (const file of files) {
      const csvPath = join(dataDir, file)
      const sheetName = file.replace('.csv', '').replace(/[-‐‑‒–—‐]/g, '_').slice(0, 31) // Excel 工作表名称最长31字符

      const sheet = csvToSheet(csvPath)
      if (sheet) {
        XLSX.utils.book_append_sheet(workbook, sheet, sheetName)
      }
    }

    // 写入 Excel 文件
    XLSX.writeFile(workbook, outputPath)
    console.log(`✅ Excel 文件已生成: ${outputPath}`)
    return true
  } catch (error) {
    console.error(`❌ Excel 导出失败: ${error.message}`)
    return false
  }
}

/**
 * 导出所有数据为单个 Excel（所有类别在一个工作簿）
 * @param {Object} allData - 所有类别数据
 * @param {Object} mappings - 字段映射
 * @param {string} outputPath - 输出路径
 */
export function exportDataToExcel(allData, mappings, outputPath) {
  try {
    const workbook = XLSX.utils.book_new()

    for (const [category, data] of Object.entries(allData)) {
      if (!data || data.length === 0) continue

      const mapping = mappings[category]
      if (!mapping) continue

      // 转换数据
      const transformed = transformData(data, mapping)

      // 创建工作表
      const sheet = XLSX.utils.json_to_sheet(transformed)

      // 设置列宽
      const headers = Object.keys(mapping).filter(k => k !== 'i18nkey')
      const colWidths = headers.map(h => ({ wch: Math.max(h.length, 15) }))
      sheet['!cols'] = colWidths

      // 添加工作表
      const sheetName = category.slice(0, 31)
      XLSX.utils.book_append_sheet(workbook, sheet, sheetName)
    }

    XLSX.writeFile(workbook, outputPath)
    console.log(`✅ Excel 文件已生成: ${outputPath}`)
    return true
  } catch (error) {
    console.error(`❌ Excel 导出失败: ${error.message}`)
    return false
  }
}

/**
 * 根据映射转换数据
 */
function transformData(data, mapping) {
  return data.map(record => {
    const result = {}
    for (const [key, path] of Object.entries(mapping)) {
      if (key === 'i18nkey') continue

      try {
        let value = getNestedValue(record, path.replace(/^\./, ''))
        if (value === null || value === undefined) {
          value = ''
        } else if (typeof value === 'object') {
          value = JSON.stringify(value)
        }
        result[key] = value
      } catch {
        result[key] = ''
      }
    }
    return result
  })
}

/**
 * 获取嵌套字段值
 */
function getNestedValue(obj, path) {
  const keys = path.split('.').filter(k => k)
  let current = obj

  for (const key of keys) {
    if (current === null || current === undefined) return null
    current = current[key]
  }

  return current
}
