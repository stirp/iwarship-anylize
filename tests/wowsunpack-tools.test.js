import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { probeExporters, toolCandidates } from '../lib/wowsunpack-tools.js'

const executableName = process.platform === 'win32' ? 'wowsunpack.exe' : 'wowsunpack'

/** 造一个包含集成导出器的假项目根目录。 */
function fakeRoot(variants) {
  const root = mkdtempSync(join(tmpdir(), 'wows-tools-'))
  for (const variant of variants) {
    const directory = join(root, 'tools', 'wowsunpack', variant)
    mkdirSync(directory, { recursive: true })
    writeFileSync(join(directory, executableName), '')
  }
  return root
}

test('未指定导出器时按逐面装甲 JSON 优先的顺序列出候选', () => {
  const root = fakeRoot(['armor-json', 'upstream'])
  const candidates = toolCandidates(root, null)
  assert.deepEqual(candidates.map(item => item.variant), ['armor-json', 'upstream', 'path'])
  assert.equal(candidates.at(-1).command, 'wowsunpack')
})

test('显式指定导出器时只使用该程序', () => {
  const root = fakeRoot(['armor-json'])
  const candidates = toolCandidates(root, 'D:/custom/wowsunpack.exe')
  assert.deepEqual(candidates.map(item => item.command), ['D:/custom/wowsunpack.exe'])
})

test('探测优先选支持逐面装甲 JSON 的导出器', async () => {
  const root = fakeRoot(['armor-json', 'upstream'])
  const candidates = toolCandidates(root, null)
  const probed = await probeExporters(candidates, async (command) => {
    if (command.includes('armor-json')) return { stdout: '--armor-json <PATH>' }
    return { stdout: '--contents <CONTENTS>' }
  })
  assert.equal(probed.variant, 'armor-json')
  assert.equal(probed.sidecarSupported, true)
})

test('只有官方导出器时退回装甲几何并标记缺少逐面数据', async () => {
  const root = fakeRoot(['upstream'])
  const probed = await probeExporters(toolCandidates(root, null), async () => ({ stdout: '--contents <CONTENTS>' }))
  assert.equal(probed.variant, 'upstream')
  assert.equal(probed.sidecarSupported, false)
})

test('全部候选不可用时给出各候选的失败原因', async () => {
  const root = fakeRoot(['armor-json'])
  await assert.rejects(probeExporters(toolCandidates(root, null), async () => ({ stdout: '--output <PATH>' })),
    /缺少 --armor-json 或 --contents/)
})
