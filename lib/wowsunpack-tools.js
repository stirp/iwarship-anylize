import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/** 项目内集成的导出器变体，顺序即优先级：先要逐面装甲 JSON，再退回上游版。 */
const variants = [
  { name: 'armor-json', directory: 'armor-json' },
  { name: 'upstream', directory: 'upstream' }
]

const executableName = () => (process.platform === 'win32' ? 'wowsunpack.exe' : 'wowsunpack')

/**
 * 读取集成变体的版本登记。版本写在 versions.json 里，
 * 避免为了显示一行版本号额外启动一次导出器进程。
 */
function versionRegistry(root) {
  try {
    return JSON.parse(readFileSync(join(root, 'tools', 'wowsunpack', 'versions.json'), 'utf8'))
  } catch { return {} }
}

/**
 * 列出候选导出器。显式指定时只用它；否则项目内集成版本优先，最后才用 PATH 上的命令。
 */
export function toolCandidates(root, explicit) {
  if (explicit) return [{ command: explicit, variant: 'custom', version: '' }]
  const registry = versionRegistry(root)
  const candidates = []
  for (const variant of variants) {
    const command = join(root, 'tools', 'wowsunpack', variant.directory, executableName())
    if (existsSync(command)) {
      candidates.push({ command, variant: variant.name, version: registry[variant.name]?.version || '' })
    }
  }
  candidates.push({ command: 'wowsunpack', variant: 'path', version: '' })
  return candidates
}

/**
 * 探测候选导出器，优先返回支持逐面装甲 JSON 的版本；
 * 都不可用时抛出带各候选失败原因的异常。
 */
export async function probeExporters(candidates, run) {
  const settings = { encoding: 'utf8', windowsHide: true, timeout: 15000, maxBuffer: 1024 * 1024 }
  const failures = []
  let fallback = null
  for (const candidate of candidates) {
    try {
      const help = await run(candidate.command, ['export-ship', '--help'], settings)
      const sidecarSupported = /--armor-json\b/.test(help.stdout)
      if (!sidecarSupported && !/--contents\b/.test(help.stdout)) throw new Error('缺少 --armor-json 或 --contents 接口')
      // 逐面装甲 JSON 是本项目的硬需求，命中即停；只支持 --contents 的留作回退。
      if (sidecarSupported) return { ...candidate, sidecarSupported }
      fallback ||= { ...candidate, sidecarSupported }
    } catch (error) {
      failures.push(`${candidate.command}：${error.message}`)
    }
  }
  if (fallback) return fallback
  throw new Error(`无法使用装甲导出器：${failures.join('；')}。请确认 wowsunpack 在 PATH 中，或用 --wowsunpack 指定支持 export-ship --contents / --armor-json 的程序。`)
}
