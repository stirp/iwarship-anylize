import test from 'node:test'
import assert from 'node:assert/strict'
import { buildGameParamsRows } from '../lib/gameparams-tables.js'
import { artilleryComparison, hullComparison, secondaryComparison, splashCaliber } from '../lib/gameparams-comparison.js'
import { spawnSync } from 'node:child_process'

const references = {
  HE: { ammoType: 'HE', alphaDamage: 8100, alphaPiercingHE: 85, burnProb: 0.4 },
  AP: { ammoType: 'AP', alphaDamage: 19400, bulletDiametr: 0.51 }
}
const gun = { numBarrels: 2, barrelDiameter: 0.51, shotDelay: 27, ammoList: ['HE', 'AP'], rotationSpeed: [3, 10] }
const battery = { maxDist: 26630, HP_1: gun, HP_2: gun, HP_3: gun }

test('敷岛三座双联装合并为一行，HE/AP 齐射与 DPM 复现旧页', () => {
  const rows = buildGameParamsRows({ kind: 'Ship', key: 'ship', data: { A_Artillery: battery }, references }, ['artillery'])
  assert.equal(rows.length, 1)
  const row = rows[0].row
  assert.equal(row.总炮管数, 6)
  assert.equal(row['HE单轮齐射最大伤害'], 48600)
  assert.equal(row['HE每分钟标伤'], 108000)
  assert.equal(row['AP单轮齐射最大伤害'], 116400)
  assert.equal(row['AP每分钟最大伤害'], 258667)
  assert.equal(row['180度转炮时间(s)'], 60)
  assert.equal(row['IFHE穿深(mm)'], 106)
  assert.equal(row['半穿甲弹每分钟最大伤害'], null)
})

test('混合口径与装填逐座计算，缺参数不产生部分合计或无穷大', () => {
  const mixed = { HP_1: gun, HP_2: { ...gun, numBarrels: 3, shotDelay: 10, barrelDiameter: 0.2, ammoList: ['small'] } }
  const ammo = { ...references, small: { ammoType: 'HE', alphaDamage: 1000 } }
  const row = artilleryComparison(mixed, ammo)
  assert.equal(row['HE单轮齐射最大伤害'], 19200)
  assert.equal(row['HE每分钟标伤'], 54000)
  assert.equal(secondaryComparison(mixed, ammo).length, 2)
  assert.equal(secondaryComparison(battery, references).length, 1)
  assert.equal(artilleryComparison(mixed, references)['HE每分钟标伤'], null)
  assert.equal(artilleryComparison({ HP_1: { ...gun, shotDelay: 0 } }, references)['HE每分钟标伤'], null)
  assert.equal(artilleryComparison({ HP_1: { ...gun, numBarrels: undefined } }, references)['HE单轮齐射最大伤害'], null)
  assert.equal(artilleryComparison({ HP_1: { ...gun, ammoList: ['HE', 'HE2'] } }, { ...references, HE2: references.HE })['HE单轮齐射最大伤害'], null)
})

const upgrade = { modifiers: { visibilityDistCoeff: { Battleship: 0.9, Cruiser: 0.9, AirCarrier: 0.9 } },
  ships: ['special'], excludes: ['excluded'], shiplevel: [8, 9, 10, 11], shiptype: ['Battleship', 'Cruiser', 'AirCarrier'], nation: ['Japan'], group: ['premium'] }
const event = { key: 'ship', data: { level: 10, group: 'premium', typeinfo: { species: 'Battleship', nation: 'Japan' }, A_Engine: { HitLocationEngine: { armorCoeff: 0 } } }, concealmentUpgrade: upgrade }
const hull = { health: 97200, visibilityFactor: 17.46, visibilityFactorByPlane: 10, SG: { armorCoeff: 0.2 }, Ammo_1: { armorCoeff: 0.4 }, Bow: { maxHP: 8500 } }

test('隐蔽考虑等级、例外船和排除名单，航母与潜艇不能套用水面舰技能', () => {
  assert.equal(hullComparison(event, hull)['水面隐蔽(最小)(km)'], 14.14)
  assert.equal(hullComparison(event, hull)['空中隐蔽(最小)(km)'], 8.1)
  const variant = (name, level, species) => ({ ...event, key: name, data: { ...event.data, level, typeinfo: { species, nation: 'Japan' } } })
  assert.equal(hullComparison(variant('ship', 7, 'Cruiser'), hull)['空中隐蔽(最小)(km)'], 9)
  assert.equal(hullComparison(variant('special', 7, 'Cruiser'), hull)['空中隐蔽(最小)(km)'], 8.1)
  assert.equal(hullComparison(variant('excluded', 10, 'Battleship'), hull)['空中隐蔽(最小)(km)'], 9)
  assert.equal(hullComparison(variant('ship', 4, 'AirCarrier'), hull)['空中隐蔽(最小)(km)'], 8.5)
  assert.equal(hullComparison(variant('ship', 10, 'Submarine'), hull)['空中隐蔽(最小)(km)'], 10)
  assert.equal(hullComparison({ ...event, concealmentUpgrade: {} }, hull)['空中隐蔽(最小)(km)'], null)
})

test('溅射等效口径保留 0 和空值区别，部位血量取实际部位', () => {
  const row = hullComparison(event, hull)
  assert.equal(row['引擎溅射防护口径(mm)'], 510)
  assert.equal(row['舵机溅射防护口径(mm)'], 203)
  assert.equal(row['弹药库溅射防护口径(mm)'], 76.2)
  assert.equal(row.船头血量, 8500)
  assert.equal(splashCaliber({ armorCoeff: 0.8 }), 0)
  assert.equal(splashCaliber({ armorCoeff: 0.123 }), null)
  assert.equal(splashCaliber(), null)
})

test('只导出火炮时仍携带所需弹药，但不额外输出弹药类别', () => {
  const result = spawnSync(process.env.TEST_PYTHON || 'python3', ['scripts/read-gameparams.py', 'tests/fixtures/gameparams.json',
    '--regions', '["ASIA"]', '--ships', '["PJSB510"]', '--categories', '["artillery"]'], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  const records = result.stdout.trim().split('\n').map(JSON.parse).filter(event => event.event === 'record')
  assert.equal(records.length, 1)
  assert.equal(records[0].references.SHELL_AP.alphaDamage, 19400)
  assert.equal(records[0].references.UNRELATED_SHELL, undefined)
})

test('防空关联同舰体两用炮光环，配置之间不混用远程火力', () => {
  const data = { A_AirDefense: { AuraNear: { areaDamage: 10, areaDamagePeriod: 0.5 } },
    A_ATBA: { AuraFar: { areaDamage: 67, areaDamagePeriod: 2 / 7, hitChance: 0.75 } },
    B_ATBA: { AuraFar: { areaDamage: 100, areaDamagePeriod: 0.5, hitChance: 0.8 } },
    ShipUpgradeInfo: {
      hullA: { components: { airDefense: ['A_AirDefense'], atba: ['A_ATBA'] } },
      hullB: { components: { airDefense: ['A_AirDefense'], atba: ['B_ATBA'] } }
    } }
  const rows = buildGameParamsRows({ kind: 'Ship', key: 'ship', data }, ['airDefense'])
  assert.equal(rows.length, 2)
  assert.equal(rows[0].row['远程防空·面板秒伤'], 234.5)
  assert.equal(rows[1].row['远程防空·面板秒伤'], 200)
  assert.equal(rows[0].row['远程防空·有效秒伤'], 175.88)
  assert.notEqual(rows[0].row.配置, rows[1].row.配置)
})
