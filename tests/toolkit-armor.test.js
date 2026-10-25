import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { runInNewContext } from 'node:vm'
import { Vector3 } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { convertToolkitArmor } from '../web/toolkit-armor.js'
import { decodeModel, comparePlate, plateVisible } from '../web/armor-format.js'
import { createToolkitExporter } from '../lib/toolkit-exporter.js'
import { generateArmorViewer } from '../lib/armor-viewer-writer.js'
import { parseOptions, validateOptions } from '../lib/options.js'

const fixture = readFileSync(new URL('./fixtures/toolkit-armor.json', import.meta.url), 'utf8')
const sample = () => JSON.parse(fixture)
const readPacked = path => {
  let payload
  runInNewContext(readFileSync(path, 'utf8'), { document: { currentScript: { dataset: { request: 'test' } } },
    __wowsArmorReceive: (_, data) => { payload = data } })
  return payload
}

test('Toolkit 三角面按材质和几何层转换，保留零值、隐藏标记和多个炮塔实例', async () => {
  const decoded = decodeModel(convertToolkitArmor(sample(), 'PJSB510'), 'PJSB510')
  assert.equal(decoded.armor.totals.plates, 4)
  assert.equal(decoded.armor.totals.triangles, 5)
  assert.deepEqual(decoded.armor.plates.map(plate => plate.thickness_mm), [32, 0, 250, 250])
  assert.equal(decoded.armor.plates[0].triangles, 2)
  assert.equal(decoded.armor.plates[1].layer, 2)
  assert.equal(decoded.armor.plates[1].hidden_in_viewer, true)
  assert.equal(plateVisible(decoded.armor.plates[1], { zones: new Set(['Citadel']), hidden: new Set(), minimum: 0, maximum: 100 }), false)
  // Three.js 解析后的原语关联与实际顶点坐标，验证不是仅生成合法 JSON。
  const gltf = await new GLTFLoader().parseAsync(decoded.buffer, '')
  gltf.scene.updateMatrixWorld(true)
  const meshes = []
  gltf.scene.traverse(object => { if (object.isMesh) meshes.push(object) })
  assert.equal(meshes.length, 4)
  const parts = meshes.map(object => {
    assert.equal(object.geometry.attributes.normal.count, object.geometry.attributes.position.count)
    assert.ok(Math.abs(new Vector3().fromBufferAttribute(object.geometry.attributes.normal, 0).length() - 1) < 1e-6)
    const association = gltf.parser.associations.get(object)
    const plate = decoded.plateMap.get(`${association.meshes}:${association.primitives}`)
    const point = new Vector3().fromBufferAttribute(object.geometry.attributes.position, 1).applyMatrix4(object.matrixWorld)
    return { plate, point }
  })
  assert.deepEqual(parts.find(part => part.plate.mount?.hp === 'HP_GUN_1').point.toArray(), [10, 3, -3])
  assert.deepEqual(parts.find(part => part.plate.mount?.hp === 'HP_GUN_2').point.toArray(), [-9, 3, 2])
  assert.equal(comparePlate(decoded.armor.plates[0], decoded.armor, [{ component: 'A_Hull', material: 61, layer: 1, thickness: 32 }]).status, 'missing')
})

test('查看器直接读取带 BOM 的 Toolkit JSON，转换 GLB 仍检查舰船编号', () => {
  const decoded = decodeModel(Buffer.from(`\ufeff  \n${fixture}`), 'PJSB510')
  assert.equal(decoded.armor.totals.triangles, 5)
  assert.throws(() => decodeModel(decoded.buffer, 'PASC001'), /不一致/)
  assert.throws(() => convertToolkitArmor(sample(), '../invalid'), /舰船编号/)
})

test('拒绝缺失厚度、错位三角面、无效索引、坐标系和矩阵，不猜测元数据', () => {
  const changes = [
    data => { data.schema = 'wows-toolbox-armor-viewer/v3' },
    data => { data.axis_forward = '+Z' },
    data => { data.meshes[0].triangle_info.pop() },
    data => { data.meshes[0].indices[0] = 999 },
    data => { data.meshes[0].indices[0] = 0.5 },
    data => { data.meshes[0].positions[0][0] = Infinity },
    data => { data.meshes[1].transform[15] = 0 },
    data => { delete data.meshes[0].triangle_info[0].thickness_mm },
    data => { data.meshes[0].triangle_info[0].model_index = -1 },
    data => { data.meshes[0].triangle_info[0].material_id = 999 },
    data => { data.meshes = [] }
  ]
  for (const mutate of changes) {
    const data = sample(); mutate(data)
    assert.throws(() => convertToolkitArmor(data, 'PJSB510'))
  }
  assert.throws(() => convertToolkitArmor(sample(), 'PJSB510', 128), /超过模型大小限制/)
})

test('本地模型目录优先转换装甲 sidecar，打包后无需读取 JSON 或联网', async () => {
  const root = mkdtempSync(join(tmpdir(), 'wows-toolkit-local-'))
  writeFileSync(join(root, 'PJSB510.armor.json'), fixture)
  writeFileSync(join(root, 'PJSB510.glb'), '不应加载这个外观文件')
  const target = join(root, 'result')
  const result = await generateArmorViewer({ armor: [{ 编号: 'PJSB510' }] }, target, {}, {
    generateHTML: true, 'models-dir': root, fetchModel: () => { throw new Error('不应联网') }
  })
  assert.equal(result.embeddedModels, 1)
  assert.equal(result.modelSource, 'embedded-local')
  const data = readPacked(join(target, 'armor/ships/PJSB510.js'))
  assert.equal(decodeModel(Buffer.from(data.modelBase64, 'base64'), 'PJSB510').armor.plates.length, 4)
})

test('导出器检查能力，以参数数组传递带空格的路径，按选船转换并隔离每次输出', async () => {
  const root = mkdtempSync(join(tmpdir(), 'wows-toolkit-export-'))
  const calls = []
  const options = { 'game-dir': root, wowsunpack: 'C:/Tools With Spaces/wowsunpack_armor.exe', 'model-hull': 'B' }
  const run = async (command, args, settings) => {
    calls.push(args)
    assert.equal(command, options.wowsunpack)
    assert.equal(settings.shell, undefined)
    if (args.includes('--help')) return { stdout: '--armor-json <PATH>' }
    assert.equal(args[args.indexOf('--game-dir') + 1], resolve(root))
    assert.equal(args[args.indexOf('--hull') + 1], 'B')
    assert.equal(args[args.indexOf('export-ship') + 1], 'PJSB510')
    writeFileSync(args[args.indexOf('--armor-json') + 1], fixture)
    return { stdout: '' }
  }
  const exporter = await createToolkitExporter(options, { run })
  const first = await exporter('PJSB510', join(root, 'output'))
  const second = await exporter('PJSB510', join(root, 'output'))
  assert.notEqual(first.path, second.path)
  assert.equal(calls.filter(args => args.includes('--help')).length, 1)
  assert.equal(decodeModel(readFileSync(first.path), 'PJSB510').armor.plates.length, 4)
  assert.equal(first.info.hullSelection, 'B')
  assert.equal(readdirSync(join(root, 'output')).length, 2)
})

test('普通 Toolkit 缺少 sidecar 能力时明确失败，单舰导出失败记录原因且不回退公网', async () => {
  const root = mkdtempSync(join(tmpdir(), 'wows-toolkit-failure-'))
  const options = { 'game-dir': root, wowsunpack: 'wowsunpack', generateHTML: true }
  await assert.rejects(createToolkitExporter(options, { run: async () => ({ stdout: '--contents <CONTENTS>' }) }), /缺少 --armor-json/)
  const result = await generateArmorViewer({ hull: [{ 编号: 'PXSB030' }] }, root, {}, { ...options,
    fetchModel: () => { throw new Error('不应联网') }, toolkitRuntime: { run: async (_, args) => {
      if (args.includes('--help')) return { stdout: '--armor-json' }
      throw Object.assign(new Error('exit code 1'), { stderr: 'Ship not found PXSB030' })
    } }
  })
  assert.equal(result.modelSource, 'embedded-game')
  assert.equal(result.embeddedModels, 0)
  assert.match(result.modelFailures[0].error, /Ship not found PXSB030/)
  assert.equal(existsSync(join(root, 'armor/index.html')), true)
})

test('生成器可从兼容导出器完成模型打包', async () => {
  const root = mkdtempSync(join(tmpdir(), 'wows-toolkit-generated-'))
  const result = await generateArmorViewer({ hull: [{ 编号: 'PJSB510' }] }, root, {}, {
    generateHTML: true, 'game-dir': root, wowsunpack: 'wowsunpack_armor',
    toolkitRuntime: { run: async (_, args) => {
      if (args.includes('--help')) return { stdout: '--armor-json' }
      writeFileSync(args[args.indexOf('--armor-json') + 1], fixture)
      return { stdout: '' }
    } }
  })
  assert.equal(result.embeddedModels, 1)
  const payload = readPacked(join(root, 'armor/ships/PJSB510.js'))
  assert.match(payload.modelInfo.source, /本地游戏/)
  assert.equal(decodeModel(Buffer.from(payload.modelBase64, 'base64'), 'PJSB510').armor.totals.triangles, 5)
})

test('模型来源选项拒绝冲突，保留游戏目录和导出器的完整路径', () => {
  const root = mkdtempSync(join(tmpdir(), 'wows-toolkit-options-'))
  const parse = args => validateOptions(parseOptions(args))
  const base = ['--game-dir', root, '--wowsunpack', 'C:/Tools With Spaces/wowsunpack_armor.exe']
  assert.equal(parse(base).wowsunpack, base[3])
  assert.equal(parse(['--game-dir', root])['game-dir'], root)
  for (const extra of [['--models-dir', root], ['--model-mode', 'manual'], ['--no-html'], ['--no-3d']]) {
    assert.throws(() => parse([...base, ...extra]))
  }
  assert.throws(() => parse(['--model-hull', 'A']), /需要 --game-dir/)
})

test('省略导出器路径时使用 PATH 中的兼容导出器，仍检查装甲接口', async () => {
  const options = { 'game-dir': tmpdir() }
  const run = async (command, args) => {
    assert.equal(command, 'wowsunpack_armor')
    assert.deepEqual(args, ['export-ship', '--help'])
    return { stdout: '--armor-json <PATH>' }
  }
  assert.equal(typeof await createToolkitExporter(options, { run }), 'function')
  await assert.rejects(createToolkitExporter(options, {
    run: async () => { throw Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' }) }
  }), /请通过 --wowsunpack 指定/)
  await assert.rejects(createToolkitExporter(options, {
    run: async () => ({ stdout: '--output <OUTPUT>' })
  }), /缺少 --armor-json/)
})

test('本地 Pickle 不兼容时转换一次并重试，后续舰船复用兼容参数', async () => {
  const root = mkdtempSync(join(tmpdir(), 'wows-toolkit-compat-'))
  let conversions = 0
  let exports = 0
  const exporter = await createToolkitExporter({ 'game-dir': root, python: 'test-python', outputRoot: root }, {
    run: async (command, args, settings) => {
      if (args.includes('--help')) return { stdout: '--armor-json' }
      if (command === 'test-python') {
        conversions++
        assert.equal(args.at(-1), join(root, '.cache', 'toolkit'))
        return { stdout: 'progress\n' + JSON.stringify({ game_params: join(root, 'compat.data') }) + '\n' }
      }
      exports++
      if (exports === 1) throw Object.assign(new Error('exit 1'), { stderr: 'Pickle(Syntax(ValueNotHashable))' })
      assert.equal(settings.env.WOWS_GAME_PARAMS_OVERRIDE, join(root, 'compat.data'))
      writeFileSync(args[args.indexOf('--armor-json') + 1], fixture)
      return { stdout: '' }
    }
  })
  await exporter('PJSB510', root)
  await exporter('PJSB510', root)
  assert.equal(conversions, 1)
  assert.equal(exports, 3)
})
