/**
 * Markdown 文件生成模块
 * 为 Obsidian 生成可检索的 Markdown 文件集合
 */

import { mkdirSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { transformData } from './csv-writer.js'

// 类别中文名映射
const categoryNames = {
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

/**
 * 生成单个 Markdown 文件内容
 * @param {Object} record - 数据记录
 * @param {string} category - 类别名
 * @param {Object} mapping - 字段映射
 * @param {string} chineseName - 中文名字
 * @returns {string} - Markdown 内容
 */
function generateMarkdownContent(record, category, mapping, chineseName = '', includeFrontmatter = true, includeStats = true) {
    const lines = []
    const [transformed] = transformData([record], mapping)

    // 生成 frontmatter
    const frontmatter = {}

    // 先添加英文名字和中文名字
    const englishName = record.name || record.index || ''
    if (englishName) {
        frontmatter['英文名字'] = englishName
    }
    if (chineseName) {
        frontmatter['中文名字'] = chineseName
    }

    // 添加其他字段
    for (const [displayName, value] of Object.entries(transformed)) {
        if (includeStats && value !== undefined && value !== null) {
            frontmatter[displayName] = value
        }
    }

    // 写入 frontmatter
    if (includeFrontmatter) {
        lines.push('---')
        for (const [key, value] of Object.entries(frontmatter)) {
            lines.push(`${key}: ${JSON.stringify(value)}`)
        }
        lines.push('---')
        lines.push('')
    }

    // 生成正文表格
    // 使用英文名作为标题，如果有中文名则加上
    const title = englishName || record.index || category
    const displayTitle = chineseName ? `${title} (${chineseName})` : title
    lines.push(`# ${displayTitle}`)
    lines.push('')
    lines.push('| 属性 | 值 |')
    lines.push('|------|-----|')

    for (const [displayName, value] of Object.entries(transformed)) {
        if (value !== undefined && value !== null) {
            lines.push(`| ${displayName} | ${formatValue(value).replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>')} |`)
        }
    }

    return lines.join('\n')
}

/**
 * 格式化值
 */
function formatValue(value) {
    if (Array.isArray(value)) {
        return value.join(', ')
    }
    if (typeof value === 'object') {
        return JSON.stringify(value)
    }
    return String(value)
}

/**
 * 生成 Markdown 文件集合
 * @param {Object} data - 全量数据
 * @param {Object} mappings - 映射配置
 * @param {string} outputDir - 输出目录
 * @param {string} gameVersion - 游戏版本号
 * @param {Function} getChineseNameFn - 获取中文名字函数
 * @param {Function} getEnglishNameFn - 获取英文名字函数
 */
export function generateMarkdown(data, mappings, outputDir, gameVersion, getChineseNameFn, getEnglishNameFn) {
    const folderName = `战舰世界数据${gameVersion}`
    const baseDir = join(outputDir, folderName)

    for (const [apiKey, categoryName] of Object.entries(categoryNames)) {
        const records = data[apiKey]
        if (!records || records.length === 0) continue

        const categoryDir = join(baseDir, categoryName)

        // 创建目录
        if (!existsSync(categoryDir)) {
            mkdirSync(categoryDir, { recursive: true })
        }

        // 获取映射
        const mapping = mappings[categoryName]
        if (!mapping) continue

        const groupedRecords = new Map()
        for (const record of records) {
            // 使用英文名作为文件名
            const englishName = getEnglishNameFn ? getEnglishNameFn(record) : (record.name || record.index)
            const filename = sanitizeFilename(englishName || record.index || 'unknown')
            const group = groupedRecords.get(filename) || []
            group.push(record)
            groupedRecords.set(filename, group)
        }

        for (const [filename, group] of groupedRecords) {
            const content = group.map((record, position) => {
                const chineseName = getChineseNameFn ? getChineseNameFn(record.index) : ''
                return generateMarkdownContent(record, categoryName, mapping, chineseName, position === 0, group.length === 1)
            }).join('\n\n')
            const filePath = join(categoryDir, `${filename}.md`)

            writeFileSync(filePath, content, 'utf-8')
        }

        console.log(`✅ 已生成 ${categoryName}: ${groupedRecords.size} 个文件，${records.length} 条记录`)
    }

    console.log(`\n📁 Markdown 文件已生成到: ${baseDir}`)
    console.log('💡 可在 Obsidian 中使用 Dataview 查询')
}

/**
 * 清理文件名
 */
function sanitizeFilename(name) {
    return String(name)
        .replace(/[<>:"/\\|?*]/g, '_')
        .replace(/\s+/g, '_')
        .slice(0, 100)
}
