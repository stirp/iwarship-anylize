import childProcess from 'node:child_process'
import { syncBuiltinESMExports } from 'node:module'
import { promisify } from 'node:util'
import { writeFileSync } from 'node:fs'
import { plainGLB } from './plain-glb.js'

const original = promisify(childProcess.execFile)
const originalCallback = childProcess.execFile
childProcess.execFile = (...args) => originalCallback(...args)
childProcess.execFile[promisify.custom] = async (command, args, options) => {
  // 项目内集成的导出器与 PATH 上的命令都按同一个假导出器处理。
  if (!/wowsunpack(\.exe)?$/i.test(String(command))) return original(command, args, options)
  if (args.includes('--help')) return { stdout: '--contents <CONTENTS> [mesh, armor, both]' }
  // 资源指纹依赖真实导出器；测试环境不支持时让调用方退回按构建号复用。
  if (!args.includes('export-ship')) throw Object.assign(new Error('unknown command'), { stderr: 'unknown command' })
  const id = args[args.indexOf('export-ship') + 1]
  if (id === 'PASC001') throw Object.assign(new Error('exit code 1'), { stderr: 'Ship not found PASC001' })
  if (args[args.indexOf('--contents') + 1] !== 'armor') throw new Error('未选择装甲几何')
  // 缺少输出路径时直接失败，避免把内容写到错误位置。
  const output = args[args.indexOf('--output') + 1]
  if (!output) throw new Error('缺少 --output')
  writeFileSync(output, plainGLB())
  return { stdout: `Exported ${id}` }
}
syncBuiltinESMExports()
