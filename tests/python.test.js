import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { resolvePython } from '../lib/python.js'

const available = (executable, version = [3, 13, 0]) => ({ stdout: JSON.stringify({ executable, version }) })

test('Windows 跳过缺失启动器与退出码 9009 的别名，选择可用解释器', async () => {
  const calls = []
  const executable = await resolvePython(undefined, { platform: 'win32', run: async (command, args) => {
    calls.push([command, args])
    if (command === 'py') throw Object.assign(new Error('missing'), { code: 'ENOENT' })
    if (command === 'python') throw Object.assign(new Error('store alias'), { code: 9009 })
    return available('C:/Python313/python.exe')
  } })
  assert.equal(executable, 'C:/Python313/python.exe')
  assert.deepEqual(calls.map(([command]) => command), ['py', 'python', 'python3'])
  assert.equal(calls[0][1][0], '-3')
})

test('显式 Python 路径保持完整，py 启动器使用 Python 3，指定失败不回退', async () => {
  for (const command of ['C:/Program Files/Python313/python.exe', 'C:\\Windows\\py.exe', 'py']) {
    const executable = await resolvePython(command, { run: async (actual, args, options) => {
      assert.equal(actual, command)
      assert.equal(args[0], command.endsWith('python.exe') ? '-X' : '-3')
      assert.equal(options.shell, undefined)
      return available('C:/Real Python/python.exe')
    } })
    assert.equal(executable, 'C:/Real Python/python.exe')
  }
  const calls = []
  await assert.rejects(resolvePython('broken-python', { run: async command => {
    calls.push(command)
    throw Object.assign(new Error('alias'), { code: 9009 })
  } }), /--python[\s\S]*9009/)
  assert.deepEqual(calls, ['broken-python'])
})

test('自动检测跳过旧版和无效版本，全部不可用时给出安装指引', async () => {
  const calls = []
  const executable = await resolvePython(undefined, { platform: 'linux', run: async command => {
    calls.push(command)
    return command === 'python3' ? available('/old/python', [3, 9, 9]) : available('/new/python', [3, 10, 0])
  } })
  assert.deepEqual(calls, ['python3', 'python'])
  assert.equal(executable, '/new/python')
  for (const response of [available('/old/python', [2, 7, 18]), { stdout: 'not python' }, { stdout: '{}' }]) {
    await assert.rejects(resolvePython('python', { run: async () => response }), /Python 3\.10\+.*安装 Python/)
  }
})

test('缺少解释器时在联网下载前失败，自动检测可完成本地 GameParams 生成', () => {
  const output = mkdtempSync(join(tmpdir(), 'wows-python-'))
  const failed = spawnSync(process.execPath, ['fetch-data.js', '--source', 'gameparams', '--python', 'nonexistent-wows-python',
    '--ships', 'PJSB510', '--categories', 'armor', '--output', output], { encoding: 'utf8', timeout: 15000 })
  assert.equal(failed.status, 1, failed.stderr)
  assert.match(failed.stderr, /无法启动可用的 Python 3\.10\+/)
  assert.equal(failed.stdout.includes('下载公开'), false)
  assert.deepEqual(readdirSync(output), [])
  const success = spawnSync(process.execPath, ['fetch-data.js', '--source', 'gameparams',
    '--gameparams', resolve('tests/fixtures/gameparams.json'), '--game-version', 'fixture',
    '--ships', 'PJSB510', '--categories', 'armor', '--no-html', '--no-markdown', '--output', output],
  { encoding: 'utf8', timeout: 15000 })
  assert.equal(success.status, 0, success.stderr)
  assert.match(success.stdout, /生成完成/)
})
