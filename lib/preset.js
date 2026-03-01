/**
 * 预设数据处理模块
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'

/**
 * 保存 JSON 文件
 * @param {string} filepath - 文件路径
 * @param {*} data - 数据
 */
export function saveJSON(filepath, data) {
  writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf-8')
}

/**
 * 加载 JSON 文件
 * @param {string} filepath - 文件路径
 * @returns {*} - 数据
 */
export function loadJSON(filepath) {
  if (!existsSync(filepath)) {
    return null
  }
  return JSON.parse(readFileSync(filepath, 'utf-8'))
}
