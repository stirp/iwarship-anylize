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

test('外观保留原生局部坐标和旋转挂载矩阵，原始装甲层不参与显示', () => {
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
  assert.ok(point.distanceTo(new Vector3(3, 3, -10)) < 1e-6)
  assert.deepEqual(mount.position.toArray(), [2, 3, -10])
})

test('非对称舰艉和螺旋桨保持同侧，轴朝向和局部负缩放不被改写', () => {
  const scene = new Group(), stern = new Mesh(new BoxGeometry(), new MeshStandardMaterial())
  stern.geometry.translate(0, 0, 4)
  const propeller = new Mesh(new BoxGeometry(), new MeshStandardMaterial())
  propeller.position.set(0.2, -0.3, 3.4)
  propeller.scale.set(-1, 1, 1)
  scene.add(stern, propeller)
  scene.updateMatrixWorld(true)
  const sternPoint = new Vector3().fromBufferAttribute(stern.geometry.attributes.position, 0)
  const beforeStern = stern.localToWorld(sternPoint.clone())
  const beforeShaft = propeller.localToWorld(new Vector3(0, 0, 0.2))
  prepareToolkitAppearance({ scene, parser: { associations: new Map(), json: {} } })
  scene.updateMatrixWorld(true)
  assert.deepEqual(stern.localToWorld(sternPoint).toArray(), beforeStern.toArray())
  assert.deepEqual(propeller.localToWorld(new Vector3(0, 0, 0.2)).toArray(), beforeShaft.toArray())
  assert.deepEqual(propeller.scale.toArray(), [-1, 1, 1])
})

test('正常生成路径打包配对外观，仍保留可交互装甲', async () => {
  const root = mkdtempSync(join(tmpdir(), 'wows-appearance-writer-'))
  writeFileSync(join(root, 'PJSB510.glb'), convertToolkitArmor(fixture, 'PJSB510'))
  writeFileSync(join(root, 'toolkit-scene.glb'), plainGLB())
  writeFileSync(join(root, 'PASC001.glb'), plainGLB())
  await generateArmorViewer({ armor: [{ 编号: 'PJSB510' }, { 编号: 'PASC001' }] }, join(root, 'result'), {}, {
    generateHTML: true, 'models-dir': root, fetchModel: () => { throw new Error('不应联网') }
  })
  let payload
  runInNewContext(readFileSync(join(root, 'result/armor/ships/PJSB510.js'), 'utf8'), {
    document: { currentScript: { dataset: { request: 'test' } } }, __wowsArmorReceive: (_, data) => { payload = data }
  })
  assert.ok(payload.modelBase64)
  assert.ok(payload.appearanceBase64)
  assert.equal(payload.appearanceFormat, 'toolkit-scene/v1')
  // 局部原位刷新保留其他舰船和数据表入口，重复运行不增加副本。
  const other = readFileSync(join(root, 'result/armor/ships/PASC001.js'), 'utf8')
  const original = readFileSync(join(root, 'result/armor/index.html'), 'utf8')
  writeFileSync(join(root, 'result/index.html'), '<a href="armor/index.html?ship=PJSB510">3D</a>')
  writeFileSync(join(root, 'result/armor/viewer.js'), 'outdated viewer')
  const refreshed = spawnSync(process.execPath, ['scripts/refresh-armor-viewer.js', join(root, 'result'), '--ships', 'PJSB510'], { encoding: 'utf8' })
  assert.equal(refreshed.status, 0, refreshed.stderr)
  assert.equal(readFileSync(join(root, 'result/armor/index.html'), 'utf8'), original)
  assert.notEqual(readFileSync(join(root, 'result/armor/viewer.js'), 'utf8'), 'outdated viewer')
  assert.equal(readFileSync(join(root, 'result/armor/ships/PASC001.js'), 'utf8'), other)
  assert.equal(readdirSync(join(root, 'result')).some(name => name.startsWith('armor-refreshed-')), false)
  assert.ok(readFileSync(join(root, 'result/armor/ships/PJSB510.js'), 'utf8').includes('appearanceBase64'))
  assert.equal(spawnSync(process.execPath, ['scripts/refresh-armor-viewer.js', join(root, 'result')], { encoding: 'utf8' }).status, 0)
  assert.deepEqual(readdirSync(join(root, 'result')).sort(), ['armor', 'index.html'])
})
