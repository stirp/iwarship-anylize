import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { parseOptions, validateOptions } from '../lib/options.js'
import { safeSegment, createOutputDirectory } from '../lib/output.js'
import { generateHTML } from '../lib/html-writer.js'

const fixture = resolve('tests/fixtures/gameparams.json')
const python = process.env.TEST_PYTHON || 'python3'
const parse = args => validateOptions(parseOptions(args))
const run = (args, extra = []) => spawnSync(process.execPath, [...extra, 'fetch-data.js', '--translations', resolve('tests/fixtures/translations.json'), '--model-mode', 'manual', ...args], {
  encoding: 'utf8', timeout: 30000
})
const files = directory => readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
  const path = join(directory, entry.name)
  return entry.isDirectory() ? files(path) : [path.replaceAll('\\', '/')]
})

test('范围参数规范化，拒绝未知和不兼容选项', () => {
  const options = parse(['--source', 'all', '--regions', 'asia,EU', '--categories', '船体,armor', '--ships', 'PJSB510,Shikishima'])
  assert.deepEqual(options.sources, ['iwarship', 'gameparams'])
  assert.deepEqual(options.regions, ['ASIA', 'EU'])
  assert.deepEqual(options.categories, ['hull', 'armor'])
  assert.throws(() => parse(['--source', 'iwarship', '--categories', 'armor']), /不支持/)
  assert.throws(() => parse(['--source', 'gameparams', '--gameparams', fixture]), /game-version/)
  assert.throws(() => parse(['--regions', 'all,ASIA']), /不能/)
  assert.throws(() => parseOptions(['--soruce', 'gameparams']))
  assert.throws(() => parseOptions(['--ships']))
  assert.equal(parse([])['model-mode'], 'embedded')
  assert.equal(parse(['--source', 'gameparams']).ref, 'master')
  assert.equal(parse(['--source', 'gameparams', '--ref', 'custom-ref']).ref, 'custom-ref')
  assert.throws(() => parse(['--model-mode', 'server']), /model-mode/)
})

test('完整生成两区域，只包含选中舰船、类别与相关弹药，保留分层和零值', () => {
  const output = mkdtempSync(join(tmpdir(), 'wows-generation-'))
  const args = ['--source', 'gameparams', '--gameparams', fixture, '--game-version', 'fixture', '--python', python,
    '--regions', 'ASIA,EU', '--ships', 'PJSB510', '--categories', 'hull,armor,projectiles', '--verbose', '--output', output]
  const result = run(args)
  assert.equal(result.status, 0, result.stderr)
  const generated = files(output)
  const manifests = generated.filter(path => path.endsWith('manifest.json')).map(path => JSON.parse(readFileSync(path)))
  assert.deepEqual(manifests.map(item => item.region).sort(), ['ASIA', 'EU'])
  const asia = manifests.find(item => item.region === 'ASIA')
  assert.equal(asia.counts.hull, 2)
  assert.equal(asia.counts.armor, 1)
  assert.equal(asia.armorDetails.count, 5)
  assert.equal(asia.counts.projectiles, 1)
  const armor = JSON.parse(readFileSync(generated.find(path => path.includes('/ASIA/') && path.endsWith('/armor-details.json'))))
  assert.equal(armor.find(row => row['参数键'] === 65597 && row['配置'] === 'A_Hull')['厚度(mm)'], 410)
  assert.equal(armor.find(row => row['参数键'] === 131133)['层'], 2)
  assert.equal(armor.find(row => row['参数键'] === 1)['厚度(mm)'], 0)
  const html = readFileSync(generated.find(path => path.includes('/ASIA/') && !path.includes('/armor/') && path.endsWith('index.html')), 'utf8')
  assert.ok(html.includes('数据来源: gameparams'))
  assert.ok(html.includes('armor/index.html?ship=PJSB510'))
  assert.equal(asia.viewer.ships, 1)
  assert.ok(!html.includes('OTHER_SHIP'))
  assert.ok(generated.some(path => path.endsWith('PJSB510.md')))
  assert.ok(generated.some(path => path.endsWith('raw.jsonl')))
  // 同版本同区域重跑覆盖同一套输出，不再增加快照目录。
  assert.equal(run([...args, '--no-html', '--no-markdown']).status, 0)
  assert.equal(files(output).filter(path => path.endsWith('manifest.json')).length, 2)
})

test('输出目录按来源、版本和区域固定，重跑不增加目录层级', () => {
  const root = mkdtempSync(join(tmpdir(), 'wows-fixed-output-'))
  const path = createOutputDirectory(root, 'gameparams', '15.10', 'ASIA')
  assert.equal(path, join(root, 'gameparams/15.10/ASIA'))
  assert.equal(createOutputDirectory(root, 'gameparams', '15.10', 'ASIA'), path)
  assert.deepEqual(readdirSync(path), [])
})

test('同时生成两个来源，目录和来源记录相互独立', () => {
  const output = mkdtempSync(join(tmpdir(), 'wows-two-sources-'))
  const result = run(['--source', 'all', '--gameparams', fixture, '--game-version', 'fixture', '--python', python,
    '--regions', 'ASIA', '--ships', 'PJSB510', '--categories', 'hull', '--output', output],
  ['--import', pathToFileURL(resolve('tests/fixtures/mock-iwarship.js')).href])
  assert.equal(result.status, 0, result.stderr)
  const manifests = files(output).filter(path => path.endsWith('manifest.json')).map(path => JSON.parse(readFileSync(path)))
  assert.deepEqual(manifests.map(item => item.source).sort(), ['gameparams', 'iwarship'])
  const iwarship = manifests.find(item => item.source === 'iwarship')
  assert.equal(iwarship.counts.hull, 1)
  assert.equal(iwarship.provenance.versionId, 42)
})

test('未知区域、未命中舰船和缺少 Python 都返回失败且不留下完成标记', () => {
  for (const scope of [['--regions', 'UNKNOWN'], ['--ships', 'NOT_FOUND'], ['--python', 'nonexistent-wows-python']]) {
    const output = mkdtempSync(join(tmpdir(), 'wows-invalid-'))
    const result = run(['--source', 'gameparams', '--gameparams', fixture, '--game-version', 'fixture', '--python', python,
      '--categories', 'hull', '--output', output, ...scope])
    assert.notEqual(result.status, 0)
    assert.equal(files(output).filter(path => path.endsWith('manifest.json')).length, 0)
  }
})

test('一个来源失败不会阻止另一个来源生成，但整体返回失败', () => {
  const output = mkdtempSync(join(tmpdir(), 'wows-partial-'))
  const result = run(['--source', 'all', '--gameparams', fixture, '--game-version', 'fixture', '--python', python,
    '--regions', 'DEFAULT', '--categories', 'hull', '--output', output], ['--import', pathToFileURL(resolve('tests/fixtures/mock-iwarship.js')).href])
  assert.notEqual(result.status, 0)
  const manifests = files(output).filter(path => path.endsWith('manifest.json')).map(path => JSON.parse(readFileSync(path)))
  assert.deepEqual(manifests.map(item => item.source), ['gameparams'])
})

test('通过弹药类型识别反潜空袭', () => {
  const output = mkdtempSync(join(tmpdir(), 'wows-asw-'))
  const input = join(output, 'params.json')
  const data = JSON.parse(readFileSync(fixture))
  data.ASIA.PJSB510_Shikishima.A_AirSupport = { maxDist: 11000, ammoList: ['ASW_PLANE'] }
  data.ASIA.ASW_PLANE = { typeinfo: { type: 'Aircraft' }, bombName: 'DEPTH_CHARGE' }
  data.ASIA.DEPTH_CHARGE = { typeinfo: { type: 'Projectile' }, ammoType: 'depthcharge' }
  writeFileSync(input, JSON.stringify(data))
  const result = run(['--source', 'gameparams', '--gameparams', input, '--game-version', 'fixture', '--python', python,
    '--regions', 'ASIA', '--categories', 'asw,airSupport', '--ships', 'PJSB510', '--output', output])
  assert.equal(result.status, 0, result.stderr)
  const manifest = JSON.parse(readFileSync(files(output).find(path => path.endsWith('manifest.json'))))
  assert.equal(manifest.counts.asw, 1)
  assert.equal(manifest.counts.airSupport, 0)
})

test('ALL 覆盖全部参数组，单区域 JSON 仅以 DEFAULT 暴露', () => {
  const output = mkdtempSync(join(tmpdir(), 'wows-region-'))
  const execute = (input, regions) => spawnSync(python, ['scripts/read-gameparams.py', input,
    '--regions', JSON.stringify(regions), '--categories', '["hull"]', '--ships', '["PJSB510"]'], { encoding: 'utf8' })
  const result = execute(fixture, ['ALL'])
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(JSON.parse(result.stdout.split('\n')[0]).regions, ['DEFAULT', 'ASIA', 'EU'])
  const path = join(output, 'single.json')
  writeFileSync(path, JSON.stringify(JSON.parse(readFileSync(fixture)).ASIA))
  assert.notEqual(execute(path, ['ASIA']).status, 0)
  assert.equal(execute(path, ['DEFAULT']).status, 0)
})

test('限制 Pickle 全局对象，拒绝执行任意函数', () => {
  const output = mkdtempSync(join(tmpdir(), 'wows-pickle-'))
  const path = join(output, 'invalid.data')
  const setup = spawnSync(python, ['-c', 'import pickle,zlib,sys;open(sys.argv[1],"wb").write(zlib.compress(pickle.dumps(eval))[::-1])', path])
  assert.equal(setup.status, 0)
  const result = spawnSync(python, ['scripts/read-gameparams.py', path, '--regions', '["ASIA"]', '--categories', '["hull"]'], { encoding: 'utf8' })
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /Unsupported pickle global/)
})

test('真实格式的压缩 Pickle 对象组件也可独立提取装甲', () => {
  const output = mkdtempSync(join(tmpdir(), 'wows-valid-pickle-'))
  const path = join(output, 'GameParams.data')
  const setup = spawnSync(python, ['-c', `
import json,pickle,zlib,sys,types
module=types.ModuleType('GameParams')
Data=type('GPData',(),{'__module__':'GameParams'})
module.GPData=Data
sys.modules['GameParams']=module
def objects(value):
    if isinstance(value,dict):
        result=Data()
        result.__dict__.update({k:objects(v) for k,v in value.items()})
        return result
    if isinstance(value,list):return [objects(v) for v in value]
    return value
with open(sys.argv[1]) as stream:root=json.load(stream)
root={region:{key:objects(value) for key,value in params.items()} for region,params in root.items()}
with open(sys.argv[2],'wb') as stream:stream.write(zlib.compress(pickle.dumps(root,protocol=2))[::-1])
`, fixture, path], { encoding: 'utf8' })
  assert.equal(setup.status, 0, setup.stderr)
  const result = run(['--source', 'gameparams', '--gameparams', path, '--game-version', 'fixture', '--python', python,
    '--categories', 'armor', '--ships', 'PJSB510', '--no-html', '--no-markdown', '--output', output])
  assert.equal(result.status, 0, result.stderr)
  const manifest = JSON.parse(readFileSync(files(output).find(file => file.endsWith('manifest.json'))))
  assert.equal(manifest.counts.armor, 1)
})

test('输出路径不能越界，HTML 安全嵌入文本且显示后续记录独有字段', () => {
  assert.ok(!safeSegment('../../escape').includes('/'))
  assert.notEqual(safeSegment('..'), '..')
  const output = mkdtempSync(join(tmpdir(), 'wows-html-'))
  const path = join(output, 'index.html')
  assert.equal(generateHTML({ 装甲: [{ 名字: '</script><script>alert(1)</script>' }, { 名字: 'safe', 独有字段: 0 }] }, path, '<version>', { source: 'gameparams' }), true)
  const html = readFileSync(path, 'utf8')
  assert.ok(!html.includes('</script><script>alert(1)</script>'))
  assert.ok(html.includes('data-field="独有字段"'))
  assert.ok(html.includes('&lt;version&gt;'))
})
