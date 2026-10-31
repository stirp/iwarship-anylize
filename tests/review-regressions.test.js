import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, readdirSync, writeFileSync, truncateSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { runInNewContext } from 'node:vm'
import { generateHTML } from '../lib/html-writer.js'
import { writeOutput } from '../lib/output.js'
import { prepareGameParams } from '../lib/sources/gameparams.js'
import { buildGameParamsRows } from '../lib/gameparams-tables.js'
import { generateArmorViewer } from '../lib/armor-viewer-writer.js'

const fixture = resolve('tests/fixtures/gameparams.json')
const python = process.env.TEST_PYTHON || 'python3'
const files = directory => readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
  const path = join(directory, entry.name)
  return entry.isDirectory() ? files(path) : [path]
})
const frontmatter = path => Object.fromEntries(readFileSync(path, 'utf8').split('---')[1].trim().split('\n').map(line => {
  const [, key, value] = line.match(/^(".*?"): (.*)$/)
  return [JSON.parse(key), JSON.parse(value)]
}))

// 用生成的真实选项和页面脚本驱动筛选，Bootstrap Table 仅替换为数据接收端。
function tablePage(html, storage = new Map()) {
  const tables = new Map(), tabs = new Map()
  const rows = [...html.matchAll(/class="row mb-3 filter-row" data-table="([^"]+)"([\s\S]*?)<table /g)].map(([, name, content]) => {
    const groups = [...content.matchAll(/class="filter-group" data-field="([^"]+)"(?: data-alt="([^"]+)")?([\s\S]*?)<\/div>/g)].map(([, field, alt, inputs]) => {
      const checkboxes = [...inputs.matchAll(/type="checkbox" value="([^"]*)"/g)].map(([, value]) => ({
        value, checked: false, addEventListener(event, callback) { this[event] = callback }
      }))
      return { dataset: { field, alt }, querySelectorAll: selector => selector.endsWith(':checked') ? checkboxes.filter(cb => cb.checked) : checkboxes }
    })
    tabs.set(`#${name}-tab`, { addEventListener(event, callback) { this[event] = callback } })
    return { dataset: { table: name }, querySelectorAll: () => groups }
  })
  const document = {
    querySelectorAll: selector => selector === '.filter-row' ? rows : [],
    querySelector: selector => tabs.get(selector) || null,
    addEventListener() {}
  }
  runInNewContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], {
    document,
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    $: selector => ({ bootstrapTable(action, value) {
      if (typeof action === 'object') tables.set(selector, action.data)
      if (action === 'load') tables.set(selector, value)
    } })
  })
  return { tables, tabs, rows, storage }
}

test('跨类别筛选保留无匹配舰种，切回和刷新后仍生效，取消后恢复记录', () => {
  const root = mkdtempSync(join(tmpdir(), 'wows-filter-regression-'))
  const path = join(root, 'index.html')
  generateHTML({ 船体: [{ 名字: '驱逐舰', 舰种: '驱逐舰', 等级: 8, 国家: '日本', 类型: '普通' }],
    飞机: [{ 名字: '航母', 舰种: '航空母舰', 等级: 10, 国籍: '美国', group: '特殊' }] }, path)
  const html = readFileSync(path, 'utf8')
  let page = tablePage(html)
  const checkbox = (table, value) => page.rows.find(row => row.dataset.table === table).querySelectorAll()
    .flatMap(group => group.querySelectorAll('input')).find(cb => cb.value === value)
  for (const value of ['驱逐舰', '航空母舰', '8', '10', '日本', '美国', '普通', '特殊']) assert.ok(checkbox('飞机', value))
  checkbox('船体', '驱逐舰').checked = true
  checkbox('船体', '驱逐舰').change()
  page.tabs.get('#飞机-tab')['shown.bs.tab']()
  assert.equal(page.tables.get('#table-飞机').length, 0)
  assert.equal(checkbox('飞机', '驱逐舰').checked, true)
  page.tabs.get('#船体-tab')['shown.bs.tab']()
  assert.equal(page.tables.get('#table-船体').length, 1)
  page = tablePage(html, page.storage)
  assert.equal(page.tables.get('#table-飞机').length, 0)
  checkbox('飞机', '驱逐舰').checked = false
  checkbox('飞机', '驱逐舰').change()
  assert.equal(page.tables.get('#table-飞机').length, 1)
})

test('iwarship 单配置 Markdown 保留中英文名称及 Dataview 数值属性', () => {
  const root = mkdtempSync(join(tmpdir(), 'wows-markdown-regression-'))
  const result = spawnSync(process.execPath, ['--import', pathToFileURL(resolve('tests/fixtures/mock-iwarship.js')).href, 'fetch-data.js',
    '--source', 'iwarship', '--categories', 'hull', '--ships', 'PJSB510', '--no-html', '--output', root], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  const attributes = frontmatter(files(root).find(path => path.endsWith('PJSB510.md')))
  assert.equal(attributes['英文名字'], 'PJSB510_Shikishima')
  assert.equal(attributes['中文名字'], '敷岛')
  assert.equal(attributes['等级'], 10)
  assert.equal(attributes['舰种'], '战列舰')
  assert.equal(attributes['血量'], 97200)
  assert.equal(attributes['来源'], 'iwarship')
})

test('Markdown 多配置不冒用单行统计，单配置保留零值并安全编码属性名', async () => {
  const root = mkdtempSync(join(tmpdir(), 'wows-markdown-configs-'))
  await writeOutput({ hull: [
    { 编号: 'PJSB510', 英文名字: 'Shikishima', 中文名字: '敷岛', 配置: 'A', health: 100 },
    { 编号: 'PJSB510', 英文名字: 'Shikishima', 中文名字: '敷岛', 配置: 'B', health: 200 },
    { 编号: 'PASC001', health: 0, '含:冒号\n换行': 'yes', 空值: null }
  ] }, root, { source: 'gameparams', gameVersion: 'test', region: 'ASIA' }, { generateMarkdown: true })
  const multi = frontmatter(join(root, 'markdown/船体/PJSB510.md'))
  assert.equal(multi['中文名字'], '敷岛')
  assert.equal(multi['英文名字'], 'Shikishima')
  assert.equal('health' in multi, false)
  const single = frontmatter(join(root, 'markdown/船体/PASC001.md'))
  assert.equal(single.health, 0)
  assert.equal(single['含:冒号\n换行'], 'yes')
  assert.equal('空值' in single, false)
})

test('本地 GameParams 先拒绝超限文件，正常文件的流式 SHA256 正确', async () => {
  const root = mkdtempSync(join(tmpdir(), 'wows-input-limit-'))
  const path = join(root, 'large.json')
  writeFileSync(path, '')
  // 稀疏文件用于验证读取前的限制，不实际写入数百 MiB。
  truncateSync(path, 512 * 1024 * 1024 + 1)
  await assert.rejects(prepareGameParams({ gameparams: path, 'game-version': 'test' }, root), /超过 512 MiB/)
  const valid = join(root, 'valid.json')
  const bytes = Buffer.from(JSON.stringify({ note: '流式哈希'.repeat(40000) }))
  writeFileSync(valid, bytes)
  const input = await prepareGameParams({ gameparams: valid, 'game-version': 'test' }, root)
  assert.equal(input.provenance.sha256, createHash('sha256').update(bytes).digest('hex'))
  assert.equal(input.gameVersion, 'test')
})

test('共享消耗品按配置追踪飞机和弹药，多舰合并引用，全量仍保留所有配置', () => {
  const root = mkdtempSync(join(tmpdir(), 'wows-ability-configs-'))
  const data = JSON.parse(readFileSync(fixture))
  const params = data.ASIA
  params.ABILITY.name = 'ABILITY'
  for (const config of ['Default', 'Alternative', 'Unused']) {
    params.ABILITY[config] = { consumableType: 'fighter', numConsumables: 0, plane: `PLANE_${config}`,
      cycle: ['ABILITY', config] }
    params[`PLANE_${config}`] = { index: `PLANE_${config}`, typeinfo: { type: 'Aircraft' }, bombName: `SHELL_${config}` }
    params[`SHELL_${config}`] = { index: `SHELL_${config}`, typeinfo: { type: 'Projectile' }, alphaDamage: 123 }
  }
  params.OTHER_SHIP.ShipAbilities = { Slot0: { abils: [['ABILITY', 'Alternative']] } }
  params.PJSB510_Shikishima.ShipAbilities.AbilitySlot1 = { abils: [['ABILITY', 'Default']] }
  const path = join(root, 'params.json')
  writeFileSync(path, JSON.stringify(data))
  const execute = (ships, categories = ['abilityDetails', 'aircraftDetails', 'projectiles']) => {
    const result = spawnSync(python, ['scripts/read-gameparams.py', path, '--regions', '["ASIA"]',
      '--ships', JSON.stringify(ships), '--categories', JSON.stringify(categories)], { encoding: 'utf8', timeout: 10000 })
    assert.equal(result.status, 0, result.stderr)
    return result.stdout.trim().split('\n').map(line => JSON.parse(line)).filter(event => event.event === 'record')
      .flatMap(event => buildGameParamsRows(event, categories))
  }
  for (const [ships, configs] of [[['PJSB510'], ['Default']], [['PJSB510', 'PASC001'], ['Alternative', 'Default']],
    [[], ['Alternative', 'Default', 'Unused']]]) {
    const rows = execute(ships)
    assert.deepEqual(rows.filter(item => item.category === 'abilityDetails' && item.row['编号'] === 'ABILITY').map(item => item.row['配置']).sort(), configs)
    assert.deepEqual(rows.filter(item => item.category === 'aircraftDetails').map(item => item.row['编号']).sort(), configs.map(config => `PLANE_${config}`))
    assert.deepEqual(rows.filter(item => item.row['编号'].startsWith('SHELL_') && item.row['编号'] !== 'SHELL_AP').map(item => item.row['编号']).sort(), configs.map(config => `SHELL_${config}`))
  }
  const projectilesOnly = execute(['PJSB510'], ['projectiles'])
  assert.deepEqual(projectilesOnly.map(item => item.row['编号']).sort(), ['SHELL_AP', 'SHELL_Default'])
})

test('非装甲分类不生成 3D 入口，飞机实体编号不会成为舰船', async () => {
  const root = mkdtempSync(join(tmpdir(), 'wows-aircraft-viewer-'))
  const result = spawnSync(process.execPath, ['--import', pathToFileURL(resolve('tests/fixtures/mock-iwarship.js')).href, 'fetch-data.js',
    '--source', 'iwarship', '--categories', 'aircraft', '--ships', 'PJSA110', '--model-mode', 'manual', '--output', root], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  const paths = files(root)
  const manifest = JSON.parse(readFileSync(paths.find(path => path.endsWith('manifest.json'))))
  assert.equal(manifest.viewer, null)
  assert.ok(!paths.some(path => path.endsWith('armor/ships/PJSA110.js')))
  const html = readFileSync(paths.find(path => path.endsWith('index.html') && !path.includes('/armor/')), 'utf8')
  assert.ok(!html.includes('armor/index.html?ship=PJSA110'))
  const planes = await generateArmorViewer({ aircraft: [{ 编号: 'PJPA001' }] }, join(root, 'planes'),
    { source: 'gameparams' }, { generateHTML: true, 'model-mode': 'manual' })
  assert.equal(planes, null)
})
