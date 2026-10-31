import { readFileSync } from 'node:fs'

/** 导出日志里出现的资源目录名，形如 ASA013_Essex_1945。 */
const candidate = /['"]([A-Z]{3}\d{3}_[A-Za-z0-9_]+)['"]/g

/**
 * 从导出日志中提取该舰船实际使用的客户端资源目录名。
 *
 * 客户端资源目录名与 GameParams 的舰船编号不是同一套编号：
 * PASA020 对应 ASA013_Essex_1945，PJSD706 对应 JSD013_Fubuki_1942。
 * 日志会打印部件名（炮塔、目录等），只有客户端确实存在的舰船目录才算数，
 * 因此必须用索引里的目录集合过滤；出现多个候选时取目录名最长的一个，
 * 分件名都是目录名加后缀，不会比目录名本身更长。
 */
export function extractModelDirectory(text, known) {
  const names = new Set()
  candidate.lastIndex = 0
  let match
  while ((match = candidate.exec(text))) names.add(match[1])
  const valid = [...names].filter(name => known.has(name))
  if (!valid.length) return null
  return valid.sort((left, right) => right.length - left.length)[0]
}

/** 读取导出日志并提取资源目录名；日志缺失或读不出时返回 null。 */
export function modelDirectoryFromLog(logPath, known) {
  if (!logPath) return null
  try {
    return extractModelDirectory(readFileSync(logPath, 'utf8'), known)
  } catch { return null }
}
