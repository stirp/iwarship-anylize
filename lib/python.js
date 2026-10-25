import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const runFile = promisify(execFile)
const probe = 'import json,sys; print(json.dumps({"version": list(sys.version_info[:3]), "executable": sys.executable}))'

/** 执行版本探测，跳过未安装、过旧或 Windows Store 占位的 Python 命令。 */
export async function resolvePython(requested, { platform = process.platform, run = runFile } = {}) {
  const commands = requested ? [requested] : platform === 'win32' ? ['py', 'python', 'python3'] : ['python3', 'python']
  const failures = []
  for (const command of commands) {
    const args = /(?:^|[/\\])py(?:\.exe)?$/i.test(command) ? ['-3'] : []
    try {
      const { stdout } = await run(command, [...args, '-X', 'utf8', '-c', probe], {
        encoding: 'utf8', windowsHide: true, timeout: 10000, maxBuffer: 64 * 1024
      })
      const { version, executable } = JSON.parse(stdout.trim())
      if (!Array.isArray(version) || version.length < 2 || !version.every(Number.isInteger) || typeof executable !== 'string' || !executable) {
        throw new Error('未返回有效的 Python 版本和程序路径')
      }
      if (version[0] !== 3 || version[1] < 10) throw new Error(`版本 ${version.join('.')}，需要 Python 3.10+`)
      return executable
    } catch (error) {
      const reason = error.code === 'ENOENT' ? '命令不存在'
        : error.code === 9009 ? '退出码 9009：Python 未安装或命中了 Windows Store 占位程序'
          : error.killed ? '版本检测超时' : error.message
      failures.push(`${command}: ${reason}`)
    }
  }
  throw new Error(`无法启动可用的 Python 3.10+。请安装 Python 后重新打开终端，或用 --python 指定 python.exe 的完整路径。\n${failures.join('\n')}`)
}
