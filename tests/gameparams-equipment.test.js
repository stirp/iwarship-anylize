import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { buildGameParamsRows } from '../lib/gameparams-tables.js'
import { torpedoComparison, aircraftComparison, airSupportComparison, aswComparison,
  pingerComparison, abilitySummary, artilleryExtras } from '../lib/gameparams-equipment.js'
import { legacyAliases, legacyColumns, alignLegacyRow, columnCoverage } from '../lib/gameparams-legacy-columns.js'
import { categoryNames } from '../lib/categories.js'
import { generateHTML } from '../lib/html-writer.js'

test('基林鱼雷对应旧表标伤、距离、反应时间，替换弹药不能叠加发射管数', () => {
  const mount = { numBarrels: 5, shotDelay: 103, rotationSpeed: [25, 25], ammoList: ['mk16', 'mk17'],
    torpedoAngles: [6, 20], HitLocationTorpedo: { maxHP: 1200, armorCoeff: 1 } }
  const mk16 = { alphaDamage: 53500, damage: 1200, speed: 66, maxDist: 350, visibilityFactor: 1.4, armingTime: 1 }
  const refs = { mk16, mk17: { ...mk16, alphaDamage: 50100, maxDist: 550 } }
  const rows = torpedoComparison({ HP_1: mount, HP_2: mount }, refs)
  assert.equal(rows.length, 2)
  assert.equal(rows[0].型号, '2 × 5')
  assert.equal(rows[0].标伤, 19033)
  assert.equal(rows[1].标伤, 17900)
  assert.equal(rows[0].射程, 10.5)
  assert.equal(rows[1].射程, 16.5)
  assert.equal(rows[0].反应时间, 7.9)
  assert.equal(rows[0].上浮距离, 177)
  assert.equal(rows[0]['180度旋转时间'], 7.2)
  assert.equal(rows[0].模块血量, 1200)
  assert.equal(rows[0].溅射防护口径, 0)
  assert.equal(torpedoComparison({ HP_1: mount }, {}).every(row => row.标伤 === null), true)
})

const plane = { name: 'PLANE', typeinfo: { type: 'Aircraft', species: 'Dive' },
  numPlanesInSquadron: 12, attackerSize: 3, attackCount: 2, projectilesPerAttack: 1,
  hangarSettings: { maxValue: 18, timeToRestore: 69, restoreAmount: 1 }, maxHealth: 2150,
  speedMoveWithBomb: 131, speedMax: 1.2672, maxForsageAmount: 20, forsageRegeneration: 0.5,
  minSpread: [1, 1], maxSpread: [2.5, 2.5], innerSalvoSize: [0.88, 2.07], outerSalvoSize: [1.17, 4.67], bombName: 'BOMB' }
const bomb = { typeinfo: { type: 'Projectile' }, ammoType: 'HE', alphaDamage: 11200, burnProb: 0.64 }

test('中途岛轰炸机还原机库、载弹、速度与基础散布，未知弹药不变成零', () => {
  const row = aircraftComparison(plane, { BOMB: bomb })
  assert.equal(row.机库, 18)
  assert.equal(row.整备时间, 69)
  assert.equal(row.飞机载弹, 2)
  assert.equal(row.最大速度, 166)
  assert.equal(row.引擎填充时间, 40)
  assert.equal(row.最小散布, '35 × 140')
  assert.equal(row.最大散布, '88 × 350')
  assert.equal(row.最小散布内圈, '26 × 62')
  assert.equal(row.标伤, 11200)
  assert.equal(row.点火率, 64)
  assert.equal(aircraftComparison(plane, {}).标伤, null)
})

test('仅选择飞机比较页时解析航空模块引用，独立实体只出现在参数页', () => {
  const directory = mkdtempSync(join(tmpdir(), 'wows-plane-join-'))
  const path = join(directory, 'params.json')
  writeFileSync(path, JSON.stringify({ ASIA: {
    SHIP: { index: 'SHIP', typeinfo: { type: 'Ship', species: 'AirCarrier' }, A_DiveBomber: { planes: ['PLANE'] } },
    PLANE: plane, BOMB: bomb, UNRELATED: { ...plane, name: 'UNRELATED' }
  } }))
  const result = spawnSync(process.env.TEST_PYTHON || 'python3', ['scripts/read-gameparams.py', path,
    '--regions', '["ASIA"]', '--ships', '["SHIP"]', '--categories', '["aircraft"]'], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  const events = result.stdout.trim().split('\n').map(JSON.parse).filter(event => event.event === 'record')
  assert.equal(events.length, 1)
  const rows = events.flatMap(event => buildGameParamsRows(event, ['aircraft']))
  assert.equal(rows.length, 1)
  assert.equal(rows[0].row.编号, 'SHIP')
  assert.equal(rows[0].row.舰种, '航空母舰')
  assert.equal(rows[0].row.飞机编号, 'PLANE')
  assert.equal(rows[0].row.标伤, 11200)
  assert.equal(events[0].references.UNRELATED, undefined)
  assert.equal(buildGameParamsRows({ kind: 'Aircraft', key: 'PLANE', data: plane }, ['aircraft']).length, 0)
  const detail = buildGameParamsRows({ kind: 'Aircraft', key: 'PLANE', data: plane }, ['aircraftDetails'])[0]
  assert.equal(detail.row.舰种, undefined)
  assert.equal(detail.row.实体类别, '飞机')
})

test('金狮空袭的连续投弹散布和敷岛反潜载弹分别计算', () => {
  const support = { maxDist: 13000, reloadTime: 100, chargesNum: 2, ammoList: ['PLANE'] }
  const aircraft = { ...plane, attackerSize: 12, attackCount: 6, attackInterval: 0.2, speedMoveWithBomb: 166,
    outerSalvoSize: [5, 2], innerSalvoSize: [5, 1], innerBombsPercentage: 66.6 }
  const refs = { PLANE: aircraft, BOMB: { ...bomb, alphaDamage: 6800, alphaPiercingHE: 37, burnProb: 0.39, fallTime: 5 } }
  const [row] = airSupportComparison(support, refs)
  assert.equal(row.攻击飞机数, 12)
  assert.equal(row.飞机载弹, 6)
  assert.equal(row.最小散布, '150 × 342')
  assert.equal(row.中央最小散布, '150 × 312')
  assert.equal(row.落弹时间, 5)
  assert.equal(row.最大距离, 13)
  const [asw] = aswComparison({ ...support, maxDist: 11000, reloadTime: 30 },
    { PLANE: { ...aircraft, attackerSize: 1, attackCount: 2 }, BOMB: { ...bomb, alphaDamage: 4900 } })
  assert.equal(asw.空袭飞机数, 1)
  assert.equal(asw.空袭载弹, 2)
  assert.equal(asw.空袭标伤, 4900)
  assert.equal(asw.空袭最大距离, 11)
  assert.equal(asw.空袭装填时间, 30)
  const [depth] = aswComparison({ maxPacks: 2, reloadTime: 40, HP_1: { numBombs: 4, ammoList: ['BOMB'] },
    HP_2: { numBombs: 10, ammoList: ['BOMB'] } }, { BOMB: { alphaDamage: 5100 } })
  assert.equal(depth.深弹炸弹数量, 14)
  assert.equal(depth.深弹可用数量, 2)
})

test('巴劳鱵的声呐嵌套参数与特殊消耗品槽位完整展开', () => {
  const row = pingerComparison({ waveDistance: 12000, waveReloadTime: 7,
    waveParams: [{ waveSpeed: [600, 600], startWaveWidth: 18, visibility: 14 }],
    sectorParams: [{ lifetime: 25, alertTime: 11.6, width: 18 }, { lifetime: 65 }] })
  assert.equal(row.声波射程, 12)
  assert.equal(row.声波速度, 600)
  assert.equal(row.高亮区持续时间, 25)
  assert.equal(row.高亮区双ping持续时间, 65)
  assert.equal(row.高亮区刷新时间, 11.6)
  assert.equal(pingerComparison({}).高亮区持续时间, null)
  const ability = abilitySummary({ data: { ShipAbilities: {
    AbilitySlot0: { slot: 0, abils: [['repair', 'default']] },
    AbilitySpecial: { slot: 5, abils: [['smoke', 'default']] }
  } }, references: {
    repair: { default: { consumableType: 'crashCrew', numConsumables: -1, reloadTime: 80 } },
    smoke: { default: { consumableType: 'smokeGenerator', numConsumables: 0, logic: { lifeTime: 130, radius: 15 } } }
  } }, {})
  assert.match(ability['1号槽'], /伤害控制小组/)
  assert.match(ability['6号槽'], /发烟机/)
  assert.equal(ability.伤害控制小组次数, '无限')
  assert.equal(ability.发烟机次数, 0)
  assert.equal(ability.发烟机消散时间, 130)
})

test('最大射程不叠加同槽升级品，点火期望使用关联舰体抗性', () => {
  const gun = { numBarrels: 2, shotDelay: 27, ammoList: ['HE'] }
  const component = { maxDist: 26630, HP_1: gun, HP_2: gun, HP_3: gun }
  const event = { key: 'SHIP', data: { name: 'SHIP', A_Hull: { burnNodes: [[0.5005, 0.3, 60]] },
    A_FireControl: { maxDistCoef: 1 }, ShipAbilities: { Slot0: { abils: [['scout', 'default']] } } },
  references: { HE: { ammoType: 'HE', burnProb: 0.4 }, scout: { default: { consumableType: 'scout', logic: { artilleryDistCoeff: 1.2 } } } },
  rangeUpgrades: [{ ships: ['SHIP'], slot: 5, modifiers: { GMMaxDist: 1.16 } }, { ships: ['SHIP'], slot: 5, modifiers: { GMMaxDist: 1.08 } }] }
  const row = artilleryExtras(event, 'A_Artillery', component)
  assert.equal(row.最大射程, 37.07)
  assert.equal(row.HE每分钟点火期望, 2.67)
  assert.equal(artilleryExtras({ ...event, references: {} }, 'A_Artillery', component).HE每分钟点火期望, null)
})

test('所有旧版映射列保留，无法校验的弹道值明确留空并说明', () => {
  for (const [key, category] of Object.entries(categoryNames)) {
    const row = alignLegacyRow(key, { 名字: '舰船' })
    for (const original of legacyColumns(category)) assert.ok((legacyAliases[category]?.[original] || original) in row)
  }
  const [item] = buildGameParamsRows({ kind: 'Ship', key: 'ship', data: { A_Artillery: { HP_1: { ammoList: ['AP'] } } },
    references: { AP: { ammoType: 'AP', bulletMass: 2620, bulletSpeed: 765 } } }, ['penetration'])
  assert.equal(item.row.弹重, 2620)
  assert.equal(item.row['10KM穿深'], null)
  const coverage = columnCoverage('弹道穿深', [item.row])
  assert.equal(coverage.find(column => column.original === '10KM穿深').status, '待核实')
  const output = join(mkdtempSync(join(tmpdir(), 'wows-coverage-')), 'index.html')
  assert.equal(generateHTML({ 弹道穿深: [item.row] }, output, 'test', { source: 'gameparams' }), true)
  const html = readFileSync(output, 'utf8')
  assert.match(html, /旧版列对齐/)
  assert.match(html, /10KM穿深（待核实）/)
  assert.ok(!html.includes('NaN'))
})
