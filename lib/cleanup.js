import { existsSync, readdirSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'

/** 列出某个来源下的全部版本目录，形如 <root>/<source>/<version>/<region>。 */
function versionDirectories(root, source) {
  const base = join(root, source)
  const directories = []
  let versions
  try { versions = readdirSync(base, { withFileTypes: true }) } catch { return directories }
  for (const version of versions) {
    if (!version.isDirectory()) continue
    const versionPath = join(base, version.name)
    let regions
    try { regions = readdirSync(versionPath, { withFileTypes: true }) } catch { continue }
    for (const region of regions) {
      if (!region.isDirectory()) continue
      directories.push(join(versionPath, region.name))
    }
  }
  return directories
}

const sizeOf = directory => {
  let total = 0
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) total += sizeOf(path)
    else { try { total += statSync(path).size } catch { /* 文件可能已被清理。 */ } }
  }
  return total
}

/**
 * 清理旧版本留下的模型中间产物。页面数据包已内嵌模型，删除中间产物不影响旧版本页面查看。
 * removeAll 为真时连同旧版本的数据表与页面一起删除。
 */
export function pruneOldVersions(root, source, { removeAll = false, keep = null } = {}) {
  if (!root || !source) return { removed: [], freed: 0 }
  const keepList = new Set(keep ? (Array.isArray(keep) ? keep : [keep]) : [])
  const removed = []
  let freed = 0
  for (const directory of versionDirectories(root, source)) {
    const toolkit = join(directory, 'armor', 'toolkit')
    if (existsSync(toolkit)) {
      freed += sizeOf(toolkit)
      rmSync(toolkit, { recursive: true, force: true })
      removed.push(join(directory, 'armor', 'toolkit'))
    }
    // 删除整个旧版本目录时保留本次刚生成的版本。
    if (removeAll && !keepList.has(directory)) {
      freed += sizeOf(directory)
      rmSync(directory, { recursive: true, force: true })
      removed.push(directory)
    }
  }
  return { removed, freed }
}
