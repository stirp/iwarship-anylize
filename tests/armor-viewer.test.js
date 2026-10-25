import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, symlinkSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { runInNewContext } from 'node:vm'
import { decodeModel, comparePlate, plateVisible, plateZone } from '../web/armor-format.js'
import { generateArmorViewer } from '../lib/armor-viewer-writer.js'
import { createPreviewServer } from '../lib/preview-server.js'
import { createShipDataLoader, unpackModel } from '../web/armor-data.js'
import { createModelCache } from '../lib/model-cache.js'

const plate = { source: 'hull', material: 61, layer: 1, material_name: 'Cit_Belt', zone: 'Citadel', thickness_mm: 410, primitive: 0 }
const armor = { schema: 'wows-armor-export/1', ship: { key: 'PJSB510_Shikishima', hull_component: 'A_Hull' }, plates: [plate], totals: { plates: 1, triangles: 1 } }

function makeGLB(extras = armor, shipMesh = 0) {
  const json = { asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: shipMesh }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, extras: { plate_index: 0 } }] }],
    buffers: [{ byteLength: 36 }], bufferViews: [{ buffer: 0, byteLength: 36 }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [-1, 0, 0], max: [1, 1, 0] }], extras: extras ? { wows_armor: extras } : {} }
  const encoded = Buffer.from(JSON.stringify(json))
  const jsonLength = Math.ceil(encoded.length / 4) * 4
  const bytes = Buffer.alloc(12 + 8 + jsonLength + 8 + 36)
  bytes.writeUInt32LE(0x46546c67, 0); bytes.writeUInt32LE(2, 4); bytes.writeUInt32LE(bytes.length, 8)
  bytes.writeUInt32LE(jsonLength, 12); bytes.writeUInt32LE(0x4e4f534a, 16)
  bytes.fill(0x20, 20, 20 + jsonLength); encoded.copy(bytes, 20)
  bytes.writeUInt32LE(36, 20 + jsonLength); bytes.writeUInt32LE(0x004e4942, 24 + jsonLength)
  Buffer.from(new Float32Array([-1, 0, 0, 1, 0, 0, 0, 1, 0]).buffer).copy(bytes, 28 + jsonLength)
  return bytes
}

test('GLB 装甲元数据通过 mesh/primitive 索引关联，拒绝错误舰船和损坏文件', () => {
  const decoded = decodeModel(makeGLB(), 'PJSB510')
  assert.equal(decoded.plateMap.get('0:0').thickness_mm, 410)
  assert.equal(decoded.armor.ship.hull_component, 'A_Hull')
  assert.throws(() => decodeModel(makeGLB(), 'PJSB001'), /不一致/)
  assert.throws(() => decodeModel(makeGLB().subarray(0, 30)), /GLB/)
  assert.throws(() => decodeModel(makeGLB({ ...armor, schema: 'unknown' })), /不支持/)
  assert.equal(decodeModel(makeGLB(null)).armor, undefined)
})

test('厚度对照区分舰体、炮塔挂载与几何层，保留差异和零值', () => {
  const parameters = [
    { component: 'A_Hull', part: 'A_Hull', material: 61, layer: 1, thickness: 410 },
    { component: 'B_Hull', part: 'B_Hull', material: 61, layer: 1, thickness: 500 },
    { component: 'A_Hull', part: 'A_Hull', material: 61, layer: 2, thickness: 200 },
    { component: 'A_Artillery', part: 'HP_JGM_1', material: 61, layer: 1, thickness: 0 },
    { component: 'A_Artillery', part: 'HP_JGM_2', material: 61, layer: 1, thickness: 650 }
  ]
  assert.equal(comparePlate(plate, armor, parameters).status, 'match')
  assert.equal(comparePlate({ ...plate, thickness_mm: 400 }, armor, parameters).status, 'mismatch')
  assert.equal(comparePlate({ ...plate, layer: 2 }, armor, parameters).thickness, 200)
  const turret = { ...plate, source: 'mount', mount: { hp: 'HP_JGM_1', component: 'A_Artillery' }, thickness_mm: 0 }
  assert.equal(comparePlate(turret, armor, parameters).status, 'match')
  assert.equal(comparePlate(plate, armor, []).status, 'missing')
  assert.equal(comparePlate(plate, armor, [...parameters, { ...parameters[0], thickness: 420 }]).status, 'ambiguous')
})

test('区域、厚度、游戏隐藏标记和手动隐藏共同决定可见性', () => {
  const filters = { zones: new Set(['Citadel']), hidden: new Set(), minimum: 0, maximum: 500, includeHidden: false }
  assert.equal(plateVisible(plate, filters), true)
  assert.equal(plateVisible(plate, { ...filters, maximum: 400 }), false)
  assert.equal(plateVisible({ ...plate, hidden_in_viewer: true }, filters), false)
  assert.equal(plateVisible(plate, { ...filters, hidden: new Set([plate]) }), false)
  assert.equal(plateVisible(plate, { ...filters, zones: new Set() }), false)
  assert.equal(plateZone({ material_name: 'GkBar', zone: 'Hull' }), 'Barbette')
})

function readPacked(path) {
  let payload
  runInNewContext(readFileSync(path, 'utf8'), { document: { currentScript: { dataset: { request: 'test' } } },
    __wowsArmorReceive: (token, value) => { assert.equal(token, 'test'); payload = value } })
  return payload
}

test('查看器打包本地模型和参数，数据包无需 fetch 即可读取', async () => {
  const root = mkdtempSync(join(tmpdir(), 'wows-viewer-'))
  const models = join(root, 'models'); mkdirSync(models)
  writeFileSync(join(models, 'PJSB510.glb'), makeGLB())
  const tables = { armor: [{ 编号: 'PJSB510', 名字: '</script><script>bad()</script>', 配置: 'A_Hull', 部件: 'A_Hull', 层: 1, 材质编号: 61, '厚度(mm)': 410 }] }
  const metadata = { source: 'gameparams', gameVersion: 'fixture', region: 'ASIA' }
  assert.equal(await generateArmorViewer(tables, root, metadata, { generateHTML: false }), null)
  assert.equal(await generateArmorViewer(tables, root, metadata, { generateHTML: true, 'no-3d': true }), null)
  const result = await generateArmorViewer(tables, root, metadata, { generateHTML: true, 'models-dir': models })
  assert.equal(result.links.PJSB510, 'armor/index.html?ship=PJSB510')
  assert.equal(result.embeddedModels, 1)
  const data = readPacked(join(root, 'armor/ships/PJSB510.js'))
  assert.equal(data.parameters[0].thickness, 410)
  assert.deepEqual(Buffer.from(unpackModel(data.modelBase64)), makeGLB())
  assert.equal(decodeModel(unpackModel(data.modelBase64), 'PJSB510').armor.plates[0].thickness_mm, 410)
  const html = readFileSync(join(root, 'armor/index.html'), 'utf8')
  assert.ok(!html.includes('</script><script>bad()'))
  assert.ok(html.includes('\\u003c/script>'))
  assert.ok(readFileSync(join(root, 'armor/viewer.js')).length > 1000)
})

test('生成时下载公开模型，跨批次复用缓存；手动模式不下载但保留参数', async () => {
  const root = mkdtempSync(join(tmpdir(), 'wows-embedded-'))
  const tables = { armor: [{ 编号: 'PJSB510', 配置: 'A_Hull', 部件: 'A_Hull', 层: 1, 材质编号: 61, '厚度(mm)': 410 }] }
  let requests = 0
  const options = { generateHTML: true, outputRoot: root, fetchModel: async () => { requests++; return new Response(makeGLB()) } }
  const metadata = { source: 'gameparams', gameVersion: 'fixture', region: 'ASIA' }
  const first = await generateArmorViewer(tables, join(root, 'first'), metadata, options)
  await generateArmorViewer(tables, join(root, 'second'), metadata, options)
  assert.equal(first.embeddedModels, 1)
  assert.equal(requests, 1)
  const manual = await generateArmorViewer(tables, join(root, 'manual'), metadata, { ...options, 'model-mode': 'manual' })
  assert.equal(requests, 1)
  assert.equal(manual.embeddedModels, 0)
  const payload = readPacked(join(root, 'manual/armor/ships/PJSB510.js'))
  assert.equal(payload.parameters[0].thickness, 410)
  assert.equal(payload.modelBase64, null)
})

test('模型缺失不会丢失表格参数，并在生成清单记录具体失败舰船', async () => {
  const root = mkdtempSync(join(tmpdir(), 'wows-pack-missing-'))
  const result = await generateArmorViewer({ hull: [{ 编号: 'PJSB510' }] }, root, {}, {
    generateHTML: true, fetchModel: async () => new Response('missing', { status: 404 })
  })
  assert.equal(result.embeddedModels, 0)
  assert.equal(result.modelFailures[0].id, 'PJSB510')
  assert.match(readPacked(join(root, 'armor/ships/PJSB510.js')).modelError, /404/)
})

test('本地脚本加载器取消旧请求，忽略迟到包，并检测文件缺失和编号错误', async () => {
  const scripts = [], host = {}
  const document = { createElement: () => ({ dataset: {}, remove() {} }), head: { append: script => scripts.push(script) } }
  const load = createShipDataLoader(document, host)
  const controller = new AbortController()
  const first = load('PJSB510', controller.signal)
  controller.abort()
  await assert.rejects(first, { name: 'AbortError' })
  host.__wowsArmorReceive(scripts[0].dataset.request, { id: 'PJSB510' })
  const second = load('PJSB510')
  host.__wowsArmorReceive(scripts[1].dataset.request, { id: 'PJSB510', parameters: [] })
  assert.deepEqual(await second, { id: 'PJSB510', parameters: [] })
  const missing = load('PJSB510'); scripts[2].onerror()
  await assert.rejects(missing, /完整输出目录/)
  const wrong = load('PJSB510')
  host.__wowsArmorReceive(scripts[3].dataset.request, { id: 'PJSB001' })
  await assert.rejects(wrong, /编号不匹配/)
})

test('缓存相同长度但损坏时重新下载，防止将坏模型打包到离线页面', async () => {
  const root = mkdtempSync(join(tmpdir(), 'wows-cache-corrupt-'))
  let count = 0
  const load = createModelCache({ root, fetchModel: async () => { count++; return new Response(makeGLB()) } })
  const cached = await load('PJSB510')
  writeFileSync(cached.target, Buffer.alloc(makeGLB().length))
  await load('PJSB510')
  assert.equal(count, 2)
})

test('预览服务按需下载、合并并发请求、复用缓存并限制访问范围', async t => {
  const root = mkdtempSync(join(tmpdir(), 'wows-preview-'))
  const output = join(root, 'output'); mkdirSync(output)
  writeFileSync(join(output, 'index.html'), '<h1>fixture</h1>')
  const secret = join(root, 'outside.txt'); writeFileSync(secret, 'outside')
  symlinkSync(secret, join(output, 'outside.txt'))
  let requests = 0
  const server = await createPreviewServer({ root: output, fetchModel: async url => {
    requests++
    assert.equal(url.hostname, 'model-ships.wows.shinoaki.com')
    await new Promise(resolve => setTimeout(resolve, 15))
    return new Response(makeGLB(), { headers: { 'content-length': String(makeGLB().length), etag: 'fixture' } })
  } })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  t.after(() => { server.closeAllConnections(); server.close() })
  const base = `http://127.0.0.1:${server.address().port}`
  const results = await Promise.all([fetch(`${base}/__models/PJSB510.zst`), fetch(`${base}/__models/PJSB510.zst`)])
  assert.deepEqual(results.map(result => result.status), [200, 200])
  assert.deepEqual(Buffer.from(await results[0].arrayBuffer()), makeGLB())
  await results[1].arrayBuffer()
  const info = await fetch(`${base}/__models/PJSB510.json`).then(response => response.json())
  assert.equal(info.bytes, makeGLB().length)
  assert.equal(requests, 1)
  assert.equal((await fetch(`${base}/outside.txt`)).status, 403)
  assert.equal((await fetch(`${base}/.cache/anything`)).status, 403)
  assert.equal((await fetch(`${base}/__models/bad.zst`)).status, 400)
  assert.equal((await fetch(`${base}/__models/PJSB510.zst`, { method: 'POST' })).status, 405)
  assert.equal((await fetch(`${base}/__models/PJSB510.zst`, { headers: { 'sec-fetch-site': 'cross-site' } })).status, 403)
  assert.equal((await fetch(`${base}/index.html`, { method: 'HEAD' })).status, 200)
  assert.ok((await fetch(base).then(response => response.text())).includes('生成结果'))
  assert.ok(readdirSync(join(output, '.cache/models')).length)
})

test('远端缺失模型返回 404，不缓存错误页面', async t => {
  const root = mkdtempSync(join(tmpdir(), 'wows-missing-model-'))
  const server = await createPreviewServer({ root, fetchModel: async () => new Response('not found', { status: 404 }) })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  t.after(() => { server.closeAllConnections(); server.close() })
  const response = await fetch(`http://127.0.0.1:${server.address().port}/__models/PJSB510.zst`)
  assert.equal(response.status, 404)
})
