import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Group, Mesh, BoxGeometry, MeshStandardMaterial, Vector3 } from 'three'
import { convertToolkitArmor } from '../web/toolkit-armor.js'
import { prepareToolkitAppearance } from '../web/toolkit-appearance.js'
import { packToolkitAppearance } from '../lib/toolkit-appearance.js'
import { plainGLB } from './fixtures/plain-glb.js'
import { generateArmorViewer } from '../lib/armor-viewer-writer.js'
import { runInNewContext } from 'node:vm'

const fixture = JSON.parse(readFileSync(new URL('./fixtures/toolkit-armor.json', import.meta.url)))

test('从旧缓存日志恢复外观，拒绝同编号不同装甲，验证自包含资源', () => {
  const directory = mkdtempSync(join(tmpdir(), 'wows-appearance-'))
  const armor = convertToolkitArmor(fixture, 'PJSB510')
  const log = join(directory, 'export.log'), scene = join(directory, 'toolkit-scene.glb')
  writeFileSync(join(directory, 'PJSB510.glb'), armor)
  writeFileSync(scene, plainGLB())
  writeFileSync(log, `Exported to ${scene} (123 bytes)\r\n`)
  const payload = { id: 'PJSB510', modelBase64: Buffer.from(armor).toString('base64'), modelInfo: { log } }
  assert.equal(packToolkitAppearance(payload), true)
  assert.deepEqual(Buffer.from(payload.appearanceBase64, 'base64'), plainGLB())
  writeFileSync(scene, '损坏文件')
  assert.throws(() => packToolkitAppearance(payload), /完整/)
  writeFileSync(join(directory, 'PJSB510.glb'), plainGLB())
  assert.equal(packToolkitAppearance(payload), false)
})

test('外观翻转局部 Z 而非挂载位置，原始装甲层不参与显示', () => {
  const scene = new Group(), mount = new Group(), armor = new Group()
  const mesh = new Mesh(new BoxGeometry(), new MeshStandardMaterial())
  mount.position.set(2, 3, -10)
  mount.rotation.y = Math.PI / 2
  mount.add(mesh); scene.add(mount, armor)
  armor.name = 'Armor'; armor.add(new Mesh(new BoxGeometry(), new MeshStandardMaterial()))
  const result = prepareToolkitAppearance({ scene, parser: { associations: new Map(), json: {} } })
  assert.deepEqual(result.meshes, [mesh])
  assert.equal(armor.visible, false)
  scene.updateMatrixWorld(true)
  const point = mesh.localToWorld(new Vector3(0, 0, 1))
  assert.ok(point.distanceTo(new Vector3(1, 3, -10)) < 1e-6)
  assert.deepEqual(mount.position.toArray(), [2, 3, -10])
})

test('正常生成路径打包配对外观，仍保留可交互装甲', async () => {
  const root = mkdtempSync(join(tmpdir(), 'wows-appearance-writer-'))
  writeFileSync(join(root, 'PJSB510.glb'), convertToolkitArmor(fixture, 'PJSB510'))
  writeFileSync(join(root, 'toolkit-scene.glb'), plainGLB())
  await generateArmorViewer({ armor: [{ 编号: 'PJSB510' }] }, join(root, 'result'), {}, {
    generateHTML: true, 'models-dir': root, fetchModel: () => { throw new Error('不应联网') }
  })
  let payload
  runInNewContext(readFileSync(join(root, 'result/armor/ships/PJSB510.js'), 'utf8'), {
    document: { currentScript: { dataset: { request: 'test' } } }, __wowsArmorReceive: (_, data) => { payload = data }
  })
  assert.ok(payload.modelBase64)
  assert.ok(payload.appearanceBase64)
  assert.equal(payload.appearanceFormat, 'toolkit-local-z-reflection/v1')
  // 命令只读取已打包数据，不依赖游戏安装或 Python；原页面不被覆盖。
  const original = readFileSync(join(root, 'result/armor/index.html'), 'utf8')
  const refreshed = spawnSync(process.execPath, ['scripts/refresh-armor-viewer.js', join(root, 'result'), '--ships', 'PJSB510'], { encoding: 'utf8' })
  assert.equal(refreshed.status, 0, refreshed.stderr)
  assert.equal(readFileSync(join(root, 'result/armor/index.html'), 'utf8'), original)
  const target = readdirSync(join(root, 'result')).find(name => name.startsWith('armor-refreshed-'))
  assert.ok(readFileSync(join(root, 'result', target, 'ships/PJSB510.js'), 'utf8').includes('appearanceBase64'))
})
