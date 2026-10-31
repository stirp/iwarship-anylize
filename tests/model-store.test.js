import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { adoptModel } from '../lib/model-store.js'

test('模型库已有同编号模型时仍补齐外观场景', () => {
  const root = mkdtempSync(join(tmpdir(), 'wows-adopt-'))
  const library = join(root, 'local-models')
  const source = join(root, 'cache', 'PJSB510-abc123')
  mkdirSync(source, { recursive: true })
  writeFileSync(join(source, 'PJSB510.glb'), '装甲模型')
  writeFileSync(join(source, 'toolkit-scene.glb'), '外观场景')
  writeFileSync(join(source, 'armor.json'), '{}')
  writeFileSync(join(source, 'export.log'), '导出日志')
  // 模型库里已有同编号模型，只有模型文件。
  mkdirSync(join(library, 'PJSB510'), { recursive: true })
  writeFileSync(join(library, 'PJSB510', 'PJSB510.glb'), '装甲模型')

  const path = adoptModel(join(source, 'PJSB510.glb'), library, 'PJSB510')
  assert.equal(path, join(library, 'PJSB510', 'PJSB510.glb'))
  // 伴生文件必须补齐，否则源目录清理后外观再也找不回来。
  assert.equal(readFileSync(join(library, 'PJSB510', 'toolkit-scene.glb'), 'utf8'), '外观场景')
  assert.equal(readFileSync(join(library, 'PJSB510', 'armor.json'), 'utf8'), '{}')
  assert.equal(readFileSync(join(library, 'PJSB510', 'export.log'), 'utf8'), '导出日志')
})

test('模型库已有外观场景时保留原文件', () => {
  const root = mkdtempSync(join(tmpdir(), 'wows-adopt-'))
  const library = join(root, 'local-models')
  const source = join(root, 'cache', 'PJSB510-abc123')
  mkdirSync(source, { recursive: true })
  writeFileSync(join(source, 'PJSB510.glb'), '装甲模型')
  writeFileSync(join(source, 'toolkit-scene.glb'), '新场景')
  mkdirSync(join(library, 'PJSB510'), { recursive: true })
  writeFileSync(join(library, 'PJSB510', 'PJSB510.glb'), '装甲模型')
  writeFileSync(join(library, 'PJSB510', 'toolkit-scene.glb'), '原场景')

  adoptModel(join(source, 'PJSB510.glb'), library, 'PJSB510')
  assert.equal(readFileSync(join(library, 'PJSB510', 'toolkit-scene.glb'), 'utf8'), '原场景')
})

test('整体并入模型库时保留全部伴生文件', () => {
  const root = mkdtempSync(join(tmpdir(), 'wows-adopt-'))
  const library = join(root, 'local-models')
  const source = join(root, 'cache', 'PJSB510-abc123')
  mkdirSync(source, { recursive: true })
  writeFileSync(join(source, 'PJSB510.glb'), '装甲模型')
  writeFileSync(join(source, 'toolkit-scene.glb'), '外观场景')

  adoptModel(join(source, 'PJSB510.glb'), library, 'PJSB510')
  assert.ok(existsSync(join(library, 'PJSB510', 'toolkit-scene.glb')))
})
