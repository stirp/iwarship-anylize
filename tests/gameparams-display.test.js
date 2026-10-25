import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { summarizeArmor } from '../lib/armor-summary.js'
import { buildGameParamsRows } from '../lib/gameparams-tables.js'
import { prepareTranslations, readTranslations } from '../lib/sources/translations.js'
import { generateHTML } from '../lib/html-writer.js'

const fixture = JSON.parse(readFileSync(new URL('./fixtures/gameparams.json', import.meta.url)))
const translations = readTranslations(resolve('tests/fixtures/translations.json'))
const ship = data => ({ kind: 'Ship', key: 'PJSB510_Shikishima', data })

test('装甲每舰一行，多配置和层独立取范围，不累加、不把零值或跨区域材质当外板', () => {
  const data = structuredClone(fixture.ASIA.PJSB510_Shikishima)
  Object.assign(data.A_Hull.armor, { 65584: 32, 131120: 19, 65585: 0, 65586: 150, 65786: 500, 65670: 560 })
  Object.assign(data.B_Hull.armor, { 65584: 38 })
  data.A_Artillery.HP_GUN_1.armor = { 65570: 650 }
  data.A_ATBA = { HP_SECONDARY: { armor: { 65570: 20 } } }
  const details = buildGameParamsRows(ship(data), ['armor'], translations).map(item => item.row)
  const [row] = summarizeArmor(details)
  assert.equal(summarizeArmor(details).length, 1)
  assert.equal(row['名字'], '敷岛')
  assert.equal(row['舰艏外板最薄(mm)'], 19)
  assert.equal(row['舰艏外板最厚(mm)'], 38)
  assert.equal(row['侧舷装甲最厚(mm)'], 420)
  assert.equal(row['核心区侧壁最薄(mm)'], 200)
  assert.equal(row['主炮塔正面最薄(mm)'], 650)
  assert.equal(row['主炮座最厚(mm)'], 560)
  assert.equal(row['舰艉外板最薄(mm)'], null)
  assert.match(row['配置范围'], /A_Hull.*B_Hull/)
  assert.ok(details.some(detail => detail['厚度(mm)'] === 0))
  const another = details.map(detail => ({ ...detail, 编号: 'PZSB529' }))
  assert.equal(summarizeArmor([...details, ...another]).length, 2)
})

test('实体种类和适用范围不污染舰种、类型筛选，舰船国家和名称使用中文', () => {
  for (const kind of ['Aircraft', 'Projectile', 'Modernization', 'Crew']) {
    const rows = buildGameParamsRows({ key: kind, kind, data: { group: ['upgradeable', 'premium'], typeinfo: { species: 'Bomb' } } }, ['aircraft', 'projectiles', 'modernizations', 'crew'])
    assert.equal(rows[0].row['舰种'], undefined)
    assert.equal(rows[0].row['类型'], undefined)
    assert.ok(rows[0].row['实体类别'])
  }
  const data = { ...fixture.ASIA.PJSB510_Shikishima, group: 'ultimate', typeinfo: { species: 'Battleship', nation: 'United_Kingdom' } }
  const row = buildGameParamsRows(ship(data), ['hull'], translations)[0].row
  assert.equal(row['名字'], '敷岛')
  assert.equal(row['国家'], '英国')
  assert.equal(row['类型'], '特殊舰船')
  assert.equal(row['最大航速(节)'], 27)
  assert.equal(row.health, undefined)
})

test('防空对象展开中文数值列，缺失光环保留空值，单位转换不改变伤害周期含义', () => {
  const data = { index: 'PJSB510', A_AirDefense: { AuraNear: { areaDamage: 29, areaDamagePeriod: 2 / 7, maxDistance: 2500, hitChance: 0.85, bubbleDamage: 0, effect: { texture: 'huge' } } },
    A_Artillery: { barrelDiameter: 0.51 } }
  const rows = buildGameParamsRows(ship(data), ['airDefense', 'artillery'])
  const aa = rows[0].row
  assert.equal(aa['近程防空·每周期伤害'], 29)
  assert.equal(aa['近程防空·命中率(%)'], 85)
  assert.equal(aa['近程防空·爆炸云伤害'], 0)
  assert.equal(aa['远程防空·每周期伤害'], null)
  assert.equal(aa.AuraNear, undefined)
  assert.ok(!JSON.stringify(aa).includes('texture'))
  assert.equal(rows[1].row['炮管口径(mm)'], 510)
})

test('舰长技能避免递归生成数千列，升级品修正保持可排序的数值', () => {
  const data = { CrewPersonality: { isUnique: true }, Skills: { Example: { modifiers: { x: 123 }, LogicTrigger: { nested: {} } } }, UniqueSkills: {} }
  const crew = buildGameParamsRows({ kind: 'Crew', key: 'captain', data }, ['crew'])[0].row
  assert.equal(crew['技能数'], 1)
  assert.ok(Object.keys(crew).length < 20)
  const upgrade = buildGameParamsRows({ kind: 'Modernization', key: 'upgrade', data: { modifiers: { GMShotDelay: { Battleship: 0.88 }, asAdditionalChargesCombined: 1 } } }, ['modernizations'])[0].row
  assert.equal(upgrade['主炮装填时间系数·战列舰'], 0.88)
  assert.equal(upgrade['额外空袭充能'], 1)
})

test('中文关键词在 Python 选船阶段生效并保留引用弹药', () => {
  const result = spawnSync(process.env.TEST_PYTHON || 'python3', ['scripts/read-gameparams.py', 'tests/fixtures/gameparams.json',
    '--regions', '["ASIA"]', '--ships', '["敷岛"]', '--categories', '["armor","projectiles"]', '--translations', 'tests/fixtures/translations.json'], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  const records = result.stdout.trim().split('\n').map(JSON.parse).filter(event => event.event === 'record')
  assert.equal(records.filter(event => event.kind === 'Ship').length, 1)
  assert.ok(records.some(event => event.key === 'SHELL_AP'))
})

test('公共中文词条固定到参数提交，校验缓存，显式词条损坏时失败', async t => {
  const root = mkdtempSync(join(tmpdir(), 'wows-translations-'))
  const revision = 'a'.repeat(40)
  const bytes = Buffer.from(JSON.stringify({ zh_sg: translations }))
  const sha = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')
  let downloads = 0
  t.mock.method(globalThis, 'fetch', async url => {
    assert.ok(url.includes(revision))
    if (url.includes('/contents/')) return new Response(JSON.stringify({ size: bytes.length, sha }))
    downloads++
    return new Response(bytes)
  })
  const input = { provenance: { revision } }
  const result = await prepareTranslations({}, input, root)
  assert.equal(result.dictionary.IDS_PJSB510, '敷岛')
  assert.equal(result.provenance.versionMatched, true)
  await prepareTranslations({}, input, root)
  assert.equal(downloads, 1)
  writeFileSync(result.path, 'bad')
  await prepareTranslations({}, input, root)
  assert.equal(downloads, 2)
  writeFileSync(result.path, '{}')
  await assert.rejects(prepareTranslations({ translations: result.path }, input, root), /翻译文件/)
})

test('仅装甲表显示 3D 列，厚度使用数值排序且附加部位可选择显示', () => {
  const path = join(mkdtempSync(join(tmpdir(), 'wows-display-')), 'index.html')
  const row = { 编号: 'PJSB510', 名字: '敷岛', '舰艏外板最薄(mm)': 32, '核心区甲板最厚(mm)': 200 }
  generateHTML({ 船体: [row], 装甲: [row] }, path, 'test', { viewerLinks: { PJSB510: 'armor/index.html?ship=PJSB510' } })
  const html = readFileSync(path, 'utf8')
  assert.equal((html.match(/<th data-field="__armorViewer"/g) || []).length, 1)
  assert.ok(!html.includes('打开独立 3D 装甲查看器'))
  assert.match(html, /data-field="舰艏外板最薄\(mm\)" data-sortable="true" data-sorter="numericSorter"/)
  assert.match(html, /data-field="核心区甲板最厚\(mm\)"[^>]*data-visible="false"/)
})
