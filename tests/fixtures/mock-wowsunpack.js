import childProcess from 'node:child_process'
import { syncBuiltinESMExports } from 'node:module'
import { promisify } from 'node:util'
import { writeFileSync } from 'node:fs'
import { plainGLB } from './plain-glb.js'

const original = promisify(childProcess.execFile)
const originalCallback = childProcess.execFile
childProcess.execFile = (...args) => originalCallback(...args)
childProcess.execFile[promisify.custom] = async (command, args, options) => {
  if (command !== 'wowsunpack') return original(command, args, options)
  if (args.includes('--help')) return { stdout: '--contents <CONTENTS> [mesh, armor, both]' }
  const id = args[args.indexOf('export-ship') + 1]
  if (id === 'PASC001') throw Object.assign(new Error('exit code 1'), { stderr: 'Ship not found PASC001' })
  if (args[args.indexOf('--contents') + 1] !== 'armor') throw new Error('未选择装甲几何')
  writeFileSync(args[args.indexOf('--output') + 1], plainGLB())
  return { stdout: `Exported ${id}` }
}
syncBuiltinESMExports()
