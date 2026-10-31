/** 舰船装备与引用实体关联；保留不同弹药和不同配置，不跨配置累加。 */
import { number, round, scale, common, weaponMounts, splashCaliber } from './gameparams-comparison.js'
import { localizedName, speciesNames } from './gameparams-labels.js'

const text = value => value == null ? null : Array.isArray(value) ? value.map(text).join(' / ') : typeof value === 'object' ? JSON.stringify(value) : value
const product = (...values) => values.every(number) ? values.reduce((a, b) => a * b, 1) : null
const turnTime = value => {
  const speed = Array.isArray(value) ? value[0] : value
  return number(speed) && speed > 0 ? round(180 / speed) : null
}
export const abilityNames = { crashCrew: '伤害控制小组', repair: '伤害控制小组', regenCrew: '维修小组', regeneration: '维修小组',
  fighter: '战斗机', scout: '侦察机', speedBoosters: '引擎增压', speedBoost: '引擎增压', smokeGenerator: '发烟机',
  smoke: '发烟机', sonar: '水底搜索', rls: '监视雷达', radar: '监视雷达', artilleryBoosters: '主炮助推装填器',
  airDefenseDisp: '防御用对空火力', torpedoReloader: '鱼雷装填助推器', hydrophone: '水听器', submarineLocator: '潜艇监视设备',
  auxTorpBooster: '辅助鱼雷武器助推器', healForsage: '紧急引擎功率', planeTacticalFighters: '巡逻战斗机',
  activeManeuvering: '主动机动', fastRudders: '快速水平舵', smokePlane: '烟幕飞机', subsEnergyFreeze: '备用蓄电池' }

export function shipAbilities(event, slots = event.data.ShipAbilities) {
  return Object.entries(slots || {}).flatMap(([slot, value]) => (value?.abils || []).map(([key, variant]) => {
    const entity = event.references?.[key]
    const ability = entity?.[variant]
    return { slot, slotNumber: value.slot ?? Number(slot.match(/\d+$/)?.[0] ?? 0), key, variant, entity, ability, values: ability ? { ...ability, ...ability.logic } : {} }
  }))
}

export function abilitySummary(event, translations) {
  const row = Object.fromEntries(Array.from({ length: 5 }, (_, i) => [`${i + 1}号槽`, null]))
  const entries = shipAbilities(event)
  const slots = new Map(), groups = new Map()
  for (const entry of entries) {
    const label = abilityNames[entry.ability?.consumableType] || localizedName(entry.entity || {}, translations) || entry.key
    const slot = `${entry.slotNumber + 1}号槽`
    if (!slots.has(slot)) slots.set(slot, [])
    slots.get(slot).push(`${label} (${entry.variant})`)
    if (!groups.has(label)) groups.set(label, [])
    groups.get(label).push(entry.values)
  }
  for (const [slot, names] of slots) row[slot] = names.join(' / ')
  const properties = { numConsumables: '次数', reloadTime: 'CD时间', workTime: '持续时间', lifeTime: '消散时间', startDelayTime: '开始延迟', radius: '半径', speedLimit: '速度限制' }
  for (const [label, values] of groups) {
    for (const [key, suffix] of Object.entries(properties)) {
      if (values.some(value => value[key] != null)) row[`${label}${suffix}`] = common(values.map(value => key === 'numConsumables' && value[key] === -1 ? '无限' : value[key]))
    }
  }
  return row
}

export function torpedoDamage(ammo) {
  return number(ammo?.alphaDamage) && number(ammo?.damage) ? round(ammo.alphaDamage / 3 + ammo.damage, 0) : null
}

export function torpedoComparison(component, references = {}) {
  const groups = new Map()
  for (const mount of weaponMounts(component)) {
    for (const ammoKey of mount.ammoList || []) {
      const key = JSON.stringify([ammoKey, mount.shotDelay, mount.numBarrels])
      if (!groups.has(key)) groups.set(key, { ammoKey, mounts: [] })
      groups.get(key).mounts.push(mount)
    }
  }
  return [...groups.values()].map(({ ammoKey, mounts }) => {
    const ammo = references[ammoKey] || {}, mount = mounts[0]
    return {
      弹药编号: ammoKey, 型号: `${mounts.length} × ${mount.numBarrels ?? '?'}`, 装填手: text(component.loaders),
      装填时间: mount.shotDelay ?? null,
      模块血量: common(mounts.map(mount => mount.HitLocationTorpedo?.maxHP ?? mount.HitLocationTorpedoes?.maxHP)),
      溅射防护口径: common(mounts.map(mount => splashCaliber(mount.HitLocationTorpedo || mount.HitLocationTorpedoes))),
      标伤: torpedoDamage(ammo), 基本伤害: ammo.alphaDamage ?? null, 溅射伤害: ammo.damage ?? null,
      漏水系数: ammo.uwCritical ?? null, 射程: scale(ammo.maxDist, 0.03), 速度: ammo.speed ?? null,
      发现距离: ammo.visibilityFactor ?? null,
      反应时间: ammo.speed > 0 && number(ammo.visibilityFactor) ? round(ammo.visibilityFactor * 1000 / (ammo.speed * 2.6854), 1) : null,
      上浮距离: round(product(ammo.armingTime, ammo.speed, 2.6854), 0), '180度旋转时间': turnTime(mount.rotationSpeed),
      最小散布角度: common(mounts.map(mount => mount.torpedoAngles?.[0])), 最大散布角度: common(mounts.map(mount => mount.torpedoAngles?.[1])),
      可单发: component.useOneShot ?? null, 可替换: (mount.ammoList || []).length > 1,
      潜艇鱼雷类型: ammo.torpedoType ?? null,
      投放距离: ammo.SubmarineTorpedoParams?.dropTargetAtDistance ? Object.entries(ammo.SubmarineTorpedoParams.dropTargetAtDistance)
        .map(([species, distances]) => `${speciesNames[species] || species}: ${text(distances)}`).join('；') : text(ammo.dropTargetAtDistance),
      最大垂直速度: Array.isArray(ammo.SubmarineTorpedoParams?.maxVerticalSpeed) ? common(ammo.SubmarineTorpedoParams.maxVerticalSpeed) : ammo.maxVerticalSpeed ?? null,
      伤害深度: text(ammo.distanceOfDamage), 不可击中舰种: text(ammo.ignoreClasses), 溅射装甲系数: ammo.splashArmorCoeff ?? null,
      挂载点: mounts.map(mount => mount.mount).join('、')
    }
  })
}

function spread(plane, outer, maximum) {
  const factor = maximum ? plane.maxSpread : plane.minSpread
  if (number(factor)) return factor
  const size = outer ? plane.outerSalvoSize : plane.innerSalvoSize
  if (!Array.isArray(size) || !Array.isArray(factor) || ![...size, ...factor].every(number)) return null
  return size.map((value, i) => round(value * factor[i] * 30, 0)).join(' × ')
}

export function aircraftComparison(plane, references = {}, translations = {}) {
  const ammo = references[plane.bombName] || {}
  const torpedo = ammo.ammoType === 'torpedo'
  const abilities = shipAbilities({ data: {}, references }, plane.PlaneAbilities)
  const hasAbility = type => abilities.some(entry => entry.ability?.consumableType === type)
  const hangar = plane.hangarSettings || {}
  return {
    飞机编号: plane.name || plane.index, 飞机名称: localizedName(plane, translations) || plane.name,
    飞机类型: ({ Fighter: '攻击机', Bomber: '鱼雷轰炸机', Dive: '俯冲轰炸机', Skip: '跳弹轰炸机' })[plane.typeinfo?.species] || plane.typeinfo?.species || null,
    中队飞机: plane.numPlanesInSquadron ?? null, 波次飞机: plane.attackerSize ?? null,
    飞机载弹: product(plane.attackCount, plane.projectilesPerAttack), 机库: hangar.maxValue ?? null,
    整备时间: hangar.timeToRestore ?? plane.restoreTime ?? null, 基础血量: plane.maxHealth ?? null,
    巡航速度: plane.speedMoveWithBomb ?? null, 最大速度: round(product(plane.speedMoveWithBomb, plane.speedMax), 0),
    攻击冷却时间: plane.attackCooldown ?? null, 水面隐蔽: plane.visibilityFactor ?? null,
    引擎冷却: plane.maxForsageAmount ?? null,
    引擎填充时间: plane.forsageRegeneration > 0 && number(plane.maxForsageAmount) ? round(plane.maxForsageAmount / plane.forsageRegeneration) : null,
    最大散布: spread(plane, true, true), 最小散布: spread(plane, true, false),
    最大散布内圈: spread(plane, false, true), 最小散布内圈: spread(plane, false, false),
    中央投弹概率: plane.innerBombsPercentage ?? null, 口径: scale(ammo.bulletDiametr, 1000), 弹种: ammo.ammoType ?? null,
    标伤: torpedo ? torpedoDamage(ammo) : ammo.alphaDamage ?? null,
    点火率: scale(ammo.burnProb, 100), 穿深: ['CS', 'SAP'].includes(ammo.ammoType) ? ammo.alphaPiercingCS ?? null : ammo.alphaPiercingHE ?? null,
    跳弹角最小: ['AP', 'CS', 'SAP'].includes(ammo.ammoType) ? ammo.bulletRicochetAt ?? null : null,
    跳弹角最大: ['AP', 'CS', 'SAP'].includes(ammo.ammoType) ? ammo.bulletAlwaysRicochetAt ?? null : null,
    漏水系数: ammo.uwCritical ?? null, 射程: torpedo ? scale(ammo.maxDist, 0.03) : null,
    速度: torpedo ? ammo.speed ?? null : null, 发现距离: torpedo ? ammo.visibilityFactor ?? null : null,
    上浮时间: torpedo ? ammo.armingTime ?? null : null,
    战斗机: hasAbility('planeTacticalFighters') || hasAbility('callFighters'), 维修: hasAbility('healForsage'),
    '特色-火箭助推': number(plane.jatoDuration) ? plane.jatoDuration > 0 : null,
    '特色-并行修复': number(hangar.restoreAmount) ? hangar.restoreAmount > 1 : null,
    '特色-战术': Array.isArray(plane.planeSubtype) ? plane.planeSubtype.includes('tactical') : null,
    '特色-飞机烟幕': hasAbility('planeSmokeGenerator'), 弹药编号: plane.bombName ?? null
  }
}

export function airSupportComparison(component, references = {}) {
  return (component.ammoList || []).map(key => {
    const plane = references[key] || {}, ammo = references[plane.bombName] || {}
    const row = { 可用数量: component.chargesNum ?? null, 攻击飞机数: plane.attackerSize ?? null,
      巡航速度: plane.speedMoveWithBomb ?? null, 飞机载弹: product(plane.attackCount, plane.projectilesPerAttack),
      标伤: ammo.alphaDamage ?? null, 穿深: ammo.alphaPiercingHE ?? null, 点火率: scale(ammo.burnProb, 100),
      落弹时间: ammo.fallTime ?? null, 最小散布: null, 中央炸弹比例: plane.innerBombsPercentage ?? null,
      中央最小散布: null, 最大距离: scale(component.maxDist, 0.001), 装填时间: component.reloadTime ?? null,
      飞机编号: key, 弹药编号: plane.bombName ?? null }
    // 连续投弹沿航向拉长落弹区；空袭飞机移动使用 3.3 倍时间尺度。
    const trail = product(plane.speedMoveWithBomb, 0.514444, 3.3, number(plane.attackCount) ? plane.attackCount - 1 : null, plane.attackInterval)
    for (const [label, size] of [['最小散布', plane.outerSalvoSize], ['中央最小散布', plane.innerSalvoSize]]) {
      if (number(trail) && Array.isArray(size) && Array.isArray(plane.minSpread)) row[label] =
        `${round(size[0] * plane.minSpread[0] * 30, 0)} × ${round(size[1] * plane.minSpread[1] * 30 + trail, 0)}`
    }
    return row
  })
}

export function aswComparison(component, references = {}) {
  if (component.ammoList?.some(key => references[key]?.typeinfo?.type === 'Aircraft')) {
    return airSupportComparison(component, references).map(row => ({ 武器类型: '反潜空袭',
      空袭可用数量: row.可用数量, 空袭飞机数: row.攻击飞机数, 空袭载弹: row.飞机载弹,
      空袭标伤: row.标伤, 空袭最大距离: row.最大距离, 空袭装填时间: row.装填时间, 弹药编号: row.弹药编号 }))
  }
  const mounts = weaponMounts(component), keys = [...new Set(mounts.flatMap(mount => mount.ammoList || []))]
  return keys.map(key => {
    const applicable = mounts.filter(mount => mount.ammoList?.includes(key))
    return { 武器类型: '舰载深弹', 深弹可用数量: component.maxPacks ?? component.chargesNum ?? null,
      深弹炸弹数量: applicable.every(mount => number(mount.numBombs)) ? applicable.reduce((sum, mount) => sum + mount.numBombs, 0) : null,
      深弹标伤: references[key]?.alphaDamage ?? null, 深弹装填时间: component.reloadTime ?? null, 弹药编号: key }
  })
}

export function pingerComparison(component) {
  const wave = component.waveParams?.[0] || {}, sectors = component.sectorParams || []
  return { 声波射程: scale(component.waveDistance, 0.001), 声波装填: component.waveReloadTime ?? null,
    声波速度: Array.isArray(wave.waveSpeed) ? common(wave.waveSpeed) : component.waveSpeed ?? null,
    声波宽度: wave.startWaveWidth ?? component.waveWidth ?? null, 声波隐蔽: wave.visibility ?? component.waveVisibility ?? null,
    高亮区持续时间: sectors[0]?.lifetime ?? component.sectorLifeTime ?? null,
    高亮区双ping持续时间: sectors[1]?.lifetime ?? component.sectorLifeTime2 ?? null,
    高亮区宽度: sectors[0]?.width ?? null, 高亮区刷新时间: sectors[0]?.alertTime ?? null }
}

export function penetrationComparison(component, references = {}) {
  return [...new Set(weaponMounts(component).flatMap(mount => mount.ammoList || []))].map(key => {
    const ammo = references[key] || {}
    return { 弹药编号: key, 弹药类型: ammo.ammoType ?? null, 弹重: ammo.bulletMass ?? null,
      口径: scale(ammo.bulletDiametr, 1000), 风阻: ammo.bulletAirDrag ?? null, 初速: ammo.bulletSpeed ?? null,
      硬度: ammo.bulletKrupp ?? null, 转正: ammo.bulletCapNormalizeMaxAngle ?? null,
      计算状态: '距离穿深、飞行时间与落角尚无经校验的弹道求解器' }
  })
}

function applicableUpgrade(upgrade, ship, key) {
  const name = ship.name || key
  return !upgrade.excludes?.includes(name) && (upgrade.ships?.includes(name) ||
    (upgrade.group?.includes(ship.group) && upgrade.nation?.includes(ship.typeinfo?.nation) &&
      upgrade.shiptype?.includes(ship.typeinfo?.species) && upgrade.shiplevel?.includes(ship.level)))
}

function linkedHulls(event, config) {
  const names = new Set()
  for (const upgrade of Object.values(event.data.ShipUpgradeInfo || {})) {
    if (upgrade?.components?.artillery?.includes(config)) for (const name of upgrade.components.hull || []) names.add(name)
  }
  if (!names.size) for (const name of Object.keys(event.data).filter(name => name.split('_')[1] === 'Hull')) names.add(name)
  return [...names].map(name => event.data[name]).filter(Boolean)
}

export function artilleryExtras(event, config, component) {
  const mounts = weaponMounts(component), abilities = shipAbilities(event)
  const row = {}
  const fireResistance = common(linkedHulls(event, config).map(hull => hull.burnNodes?.[0]?.[0]))
  const fireContributions = mounts.map(mount => {
    if (!mount.ammoList?.length || mount.ammoList.some(key => !event.references?.[key])) return null
    const shells = (mount.ammoList || []).map(key => event.references?.[key]).filter(ammo => ammo?.ammoType === 'HE')
    if (!shells.length) return 0
    return shells.length === 1 && number(shells[0].burnProb) && number(mount.numBarrels) && mount.shotDelay > 0
      ? shells[0].burnProb * mount.numBarrels * 60 / mount.shotDelay : null
  })
  row['HE每分钟点火期望'] = mounts.length && number(fireResistance) && fireContributions.every(number)
    ? round(fireContributions.reduce((a, b) => a + b, 0) * fireResistance) : null
  // 只取同槽位中最优的常规射程升级品，不叠加互斥选项或传奇升级品。
  const slots = new Map()
  for (const upgrade of event.rangeUpgrades || []) {
    if (upgrade.tags?.includes('unique') || !applicableUpgrade(upgrade, event.data, event.key)) continue
    const modifier = upgrade.modifiers?.GMMaxDist
    if (number(modifier)) slots.set(upgrade.slot, Math.max(slots.get(upgrade.slot) || 1, modifier))
  }
  const controls = Object.entries(event.data).filter(([key]) => key.split('_')[1] === 'FireControl').map(([, control]) => control.maxDistCoef).filter(number)
  const scout = Math.max(1, ...abilities.map(entry => entry.values.artilleryDistCoeff).filter(number))
  const skill = event.data.typeinfo?.species === 'Destroyer' ? 1.2 : 1
  row['最大射程'] = Array.isArray(event.rangeUpgrades) && number(component.maxDist)
    ? round(component.maxDist / 1000 * Math.max(1, ...controls) * [...slots.values()].reduce((a, b) => a * b, 1) * scout * skill) : null
  return row
}

export function hullExtras(event, hull) {
  const species = event.data.typeinfo?.species, level = event.data.level
  const perLevel = { Battleship: 0, Cruiser: 450, Destroyer: 350, AirCarrier: 0, Submarine: 0 }[species]
  const repairs = shipAbilities(event).filter(entry => ['regenCrew', 'regeneration'].includes(entry.ability?.consumableType))
  const amounts = repairs.map(entry => {
    const value = entry.values
    return value.numConsumables >= 0 && [hull.health, value.workTime, value.regenerationHPSpeed].every(number)
      ? hull.health * value.workTime * value.regenerationHPSpeed * value.numConsumables : null
  })
  const submerged = Object.entries(hull.buoyancyStates || {}).filter(([key]) => key !== 'SURFACE').map(([, value]) => value?.[1]).filter(number)
  return {
    '血量(技能)': [hull.health, perLevel, level].every(number) ? hull.health + perLevel * level : null,
    '血量(标准维修血池)': repairs.length && amounts.every(number) && number(hull.health) ? round(hull.health + Math.max(...amounts), 0) : null,
    '最大航速(信号旗)': scale(hull.maxSpeed, 1.05),
    '水下最大航速': species === 'Submarine' && submerged.length ? round(product(hull.maxSpeed, Math.max(...submerged))) : null,
    水平舵转舵时间: species === 'Submarine' ? hull.buoyancyRudderTime ?? null : null,
    上浮下潜速度: species === 'Submarine' ? hull.maxBuoyancySpeed ?? null : null,
    电池容量: hull.SubmarineBattery?.capacity ?? null, 电力恢复: hull.SubmarineBattery?.regenRate ?? null,
    稀有度: ({ Common: '普通', Rare: '罕见', Epic: '史诗', Legendary: '传奇' })[event.data.RarityCategory?.name] || event.data.RarityCategory?.name || null,
    '特色-起始血量': number(hull.startHealthCoeff) && number(hull.health) ? round(hull.health * hull.startHealthCoeff, 0) : null
  }
}

export function airDefenseExtras(component) {
  const row = {}
  for (const [key, prefix] of [['AuraNear', '近程'], ['AuraMedium', '中程'], ['AuraFar', '远程']]) {
    const aura = component[key] || {}
    row[`${prefix}面板秒伤`] = number(aura.areaDamage) && aura.areaDamagePeriod > 0 ? round(aura.areaDamage / aura.areaDamagePeriod, 0) : null
    row[`${prefix}伤害`] = aura.areaDamage ?? null
    row[`${prefix}命中率`] = aura.hitChance ?? null
    row[`${prefix}射程`] = scale(aura.maxDistance, 0.001)
    row[`${prefix}伤害间隔`] = round(aura.areaDamagePeriod)
  }
  const bubbles = component.AuraFar_Bubbles || component.AuraFar || {}
  Object.assign(row, { 爆炸生成距离: bubbles.maxDistance ?? null, '爆炸伤害(原始每周期)': bubbles.bubbleDamage ?? null,
    爆炸半径: bubbles.bubbleRadius ?? null, 爆炸产生激活延迟: bubbles.maxBubbleActivationDelay ?? null,
    爆炸持续时间: bubbles.bubbleDuration ?? null,
    爆炸总数: [bubbles.innerBubbleCount, bubbles.outerBubbleCount].every(number) ? bubbles.innerBubbleCount + bubbles.outerBubbleCount : null,
    路径内爆炸数量: bubbles.innerBubbleCount ?? null, 路径内爆炸产生间隔: text(bubbles.innerBubbleSpawnTimeRange),
    路径内判定角度: bubbles.innerBubbleZone ?? null, 路径外爆炸数量: bubbles.outerBubbleCount ?? null,
    路径外爆炸产生间隔: text(bubbles.outerBubbleSpawnTimeRange), 路径外单侧判定角度: bubbles.halfOuterBubbleZone ?? null,
    手动防空冷却时间: component.prioritySectorCooldown ?? null })
  return row
}
