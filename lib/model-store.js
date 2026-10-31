import { copyFileSync, existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

/** 工作区模型库：跨版本复用的模型都归集到这里，版本目录不再保留模型。 */
export function modelLibrary(root) {
  return join(root, '.cache', 'local-models')
}

/** 随模型一起保留的伴生文件：外观场景、逐面装甲数据与导出日志。 */
const siblings = ['armor.json', 'toolkit-scene.glb', 'export.log']

/**
 * 把历史模型并入模型库。目录名与舰船编号一致时整体移动，
 * 旧缓存把模型放在带随机后缀的目录里时只搬需要的文件。
 */
export function adoptModel(fromPath, library, shipId) {
  const fromDirectory = dirname(fromPath)
  const target = join(library, shipId)
  if (fromDirectory === target) return fromPath
  mkdirSync(library, { recursive: true })
  if (existsSync(target)) {
    const existing = join(target, basename(fromPath))
    if (existsSync(existing) && statSync(existing).size > 0) {
      // 目标已有模型时仍要补齐外观场景等伴生文件，
      // 否则源目录随历史缓存清理后，外观就再也找不回来了。
      for (const sibling of siblings) {
        const source = join(fromDirectory, sibling)
        const destination = join(target, sibling)
        if (!existsSync(source) || existsSync(destination)) continue
        try { renameSync(source, destination) } catch { copyFileSync(source, destination) }
      }
      return existing
    }
    rmSync(target, { recursive: true, force: true })
  }
  const name = basename(fromDirectory)
  if (name === shipId || name.startsWith(`${shipId}-`)) {
    try {
      renameSync(fromDirectory, target)
      return join(target, basename(fromPath))
    } catch { /* 跨盘移动失败时退回复制。 */ }
  }
  mkdirSync(target, { recursive: true })
  try {
    renameSync(fromPath, join(target, basename(fromPath)))
    for (const sibling of siblings) {
      const source = join(fromDirectory, sibling)
      if (existsSync(source)) renameSync(source, join(target, sibling))
    }
  } catch {
    copyFileSync(fromPath, join(target, basename(fromPath)))
    for (const sibling of siblings) {
      const source = join(fromDirectory, sibling)
      if (existsSync(source)) copyFileSync(source, join(target, sibling))
    }
  }
  return join(target, basename(fromPath))
}
