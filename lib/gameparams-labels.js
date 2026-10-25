/** 展示层保留数值类型；未知单位不猜测，复合属性展开而非输出整块 JSON。 */
export const speciesNames = { Battleship: '战列舰', Cruiser: '巡洋舰', Destroyer: '驱逐舰', AirCarrier: '航空母舰', Submarine: '潜艇' }
const nations = { Japan: '日本', USA: '美国', Russia: '苏联', Germany: '德国', UK: '英国', United_Kingdom: '英国', France: '法国', Italy: '意大利', Pan_Asia: '泛亚', Pan_Europe: '欧洲', Europe: '欧洲', Commonwealth: '英联邦', Netherlands: '荷兰', Spain: '西班牙', Pan_America: '泛美', Events: '活动' }
const groups = { upgradeable: '研发舰船', premium: '加值舰船', special: '特殊舰船', ultimate: '特殊舰船', superShip: '超级战舰', demo: '测试舰船', demoWithoutStats: '测试舰船', demoWithoutStatsPrem: '测试加值舰船', event: '活动舰船', disabled: '停用舰船', clan: '军团舰船', coopOnly: '仅人机模式', earlyAccess: '抢先体验', experimental: '实验舰船', preserved: '保留舰船', specialUnsellable: '不可出售特殊舰船', start: '初始舰船', unavailable: '不可用舰船' }
const entities = { Ship: '舰船', Aircraft: '飞机', Projectile: '弹药', Ability: '消耗品', Crew: '舰长', Modernization: '升级品' }
export function localizedName(data, translations = {}) {
  for (const key of [data.index, data.name]) {
    const value = translations[`IDS_${String(key || '').toUpperCase()}`]
    if (typeof value === 'string' && value.trim()) return value
  }
  return ''
}
export function identity(event, translations) {
  const data = event.data, info = data.typeinfo || {}
  const name = localizedName(data, translations)
  const base = { 名字: name || data.name || event.key, 编号: data.index || event.key }
  if (event.kind === 'Ship') Object.assign(base, { 等级: data.level ?? null,
    舰种: speciesNames[info.species] || '', 国家: nations[info.nation] || info.nation || '',
    类型: groups[data.group] || '其他舰船' })
  else Object.assign(base, { 实体类别: entities[event.kind] || event.kind, 实体子类: info.species || '' })
  return { ...base, 中文名字: name, 英文名字: data.name || event.key }
}

const labels = {
  health: '血量', maxHealth: '最大血量', maxSpeed: '最大航速', rudderTime: '换舵时间(s)', turningRadius: '转弯半径(m)', tonnage: '排水量(t)', enginePower: '主机功率(hp)',
  visibilityFactor: '被发现距离', visibilityFactorByPlane: '空中被发现距离(km)', visibilityCoefGKInSmoke: '烟幕内开火被发现距离(km)', draft: '吃水', size: '尺寸',
  maxDist: '最大射程(m)', minDist: '最小射程(m)', sigmaCount: '西格玛', barrelDiameter: '炮管口径(mm)', numBarrels: '每座炮管数', shotDelay: '装填时间(s)', rotationSpeed: '旋转速度', horizSector: '水平射界(°)', ammoList: '可用弹药',
  prioritySectorCooldown: '优先防空扇区冷却(s)', reloadTime: '冷却时间(s)', chargesNum: '充能次数',
  waveDistance: '声呐射程', waveReloadTime: '声呐装填时间(s)', waveSpeed: '声呐波速度', waveWidth: '声呐波宽度', waveVisibility: '声呐波可见距离', sectorLifeTime: '单次标记持续时间(s)', sectorLifeTime2: '双重标记持续时间(s)',
  cruiseSpeed: '巡航速度', speedMoveWithBomb: '携弹速度', attackCooldown: '攻击冷却(s)', restoreTime: '整备时间(s)', bombName: '携带弹药', planeType: '飞机类型',
  ammoType: '弹药类型', alphaDamage: '标称伤害', damage: '伤害', bulletMass: '弹丸质量(kg)', bulletDiametr: '弹丸口径(mm)', bulletSpeed: '初速(m/s)', bulletAirDrag: '空气阻力系数', bulletKrupp: '克虏伯系数', bulletDetonator: '引信延时(s)', bulletDetonatorThreshold: '引信触发厚度(mm)', bulletRicochetAt: '开始跳弹角(°)', bulletAlwaysRicochetAt: '必定跳弹角(°)', alphaPiercingHE: '高爆穿深(mm)', burnProb: '起火概率(%)', speed: '速度',
  slot: '安装槽位', modifiers: '属性修正', ships: '适用舰船', nation: '适用国家', shiplevel: '适用等级', shiptype: '适用舰种', CrewPersonality: '舰长特性', Skills: '技能', UniqueSkills: '专属技能',
  consumableType: '消耗品类型', numConsumables: '使用次数', workTime: '作用时间(s)', distShip: '舰船探测距离', distTorpedo: '鱼雷探测距离', radius: '作用半径', regenerationHPSpeed: '每秒恢复生命比例',
  areaDamage: '每周期伤害', areaDamagePeriod: '伤害周期(s)', hitChance: '命中率(%)', minDistance: '内圈距离(m)', maxDistance: '外圈距离(m)', bubbleDamage: '爆炸云伤害', innerBubbleCount: '内圈爆炸云数', outerBubbleCount: '外圈爆炸云数', explosionCount: '爆炸数量',
  enabled: '启用', abils: '可选消耗品', name: '名称', isUnique: '是否独特', hasCustomSkills: '是否有专属技能',
  buffsShiftMaxLevel: '增益最高层数', buffsStartPool: '初始增益池', buffsShiftSpeed: '增益变化速度'
}
// 修正量保持原始系数/加数；不把未知语义的倍率统一换算成百分比。
const modifierLabels = {
  AAAuraDamage: '防空持续伤害系数', AABubbleDamage: '防空爆炸云伤害系数', AAExtraBubbles: '额外爆炸云数', AAMaxHP: '防空炮血量系数',
  ConsumableReloadTime: '消耗品冷却系数', ConsumablesWorkTime: '消耗品作用时间系数', additionalConsumables: '额外消耗品次数',
  GMAPDamageCoeff: '主炮穿甲伤害系数', GMCritProb: '主炮受损概率系数', GMDamageCoeff: '主炮伤害系数', GMIdealRadius: '主炮散布系数', GMMaxDist: '主炮射程系数', GMMaxHP: '主炮血量系数', GMRepairTime: '主炮修复时间系数', GMRotationSpeed: '主炮旋转速度系数', GMShotDelay: '主炮装填时间系数',
  GSIdealRadius: '副炮散布系数', GSMaxDist: '副炮射程系数', GSMaxHP: '副炮血量系数', GSShotDelay: '副炮装填时间系数',
  GTCritProb: '鱼雷发射管受损概率系数', GTMaxHP: '鱼雷发射管血量系数', GTRepairTime: '鱼雷管修复时间系数', GTRotationSpeed: '鱼雷管旋转速度系数', GTShotDelay: '鱼雷装填时间系数',
  SGCritProb: '舵机受损概率系数', SGRepairTime: '舵机修复时间系数', SGRudderTime: '换舵时间系数', SGRudderPower: '舵效系数',
  visibilityDistCoeff: '舰船隐蔽系数', visibilityFactor: '被发现距离系数', visibilityForSubmarineCoeff: '潜艇探测距离系数', visionXRayTorpedoDist: '鱼雷强制发现距离', speedCoef: '航速系数',
  healthHullCoeff: '舰体血量系数', healthRegenPercent: '生命恢复比例', regeneratedHPPartCoef: '可恢复伤害比例系数', burnProb: '起火概率修正', burnTime: '火灾持续时间系数', floodProb: '进水概率修正', floodTime: '进水持续时间系数',
  engineCritProb: '引擎受损概率系数', engineRepairTime: '引擎修复时间系数', engineForwardUpTime: '前进加速时间系数', engineBackwardUpTime: '后退加速时间系数',
  asAdditionalChargesCombined: '额外空袭充能', asMaxDistCoeff: '空袭射程系数', asMaxHealthCoeff: '空袭飞机血量系数', asReloadTimeCoeff: '空袭装填时间系数',
  bombAlphaDamageMultiplier: '炸弹伤害系数', bombHEAlphaDamageMultiplier: '高爆炸弹伤害系数', dcAlphaDamageMultiplier: '深水炸弹伤害系数', dcNumPacksBonus: '额外深弹组数',
  batteryCapacityCoeff: '潜航能力容量系数', batteryRegenCoeff: '潜航能力恢复系数', pingerCritProb: '声呐受损概率系数', pingerRepairTime: '声呐修复时间系数', pingerWaveSpeedCoeff: '声呐波速系数',
  planeHealthCoeff: '飞机血量系数', planeExtraHangarSize: '额外机库容量', planeSpawnTime: '飞机整备时间系数', planeSpeed: '飞机速度修正', planeMaxSpeedMultiplier: '飞机最大速度系数', planeVisibilityFactor: '飞机被发现距离系数', planeAdditionalConsumables: '飞机额外消耗品次数', planeForsageTimeCoeff: '飞机引擎增压时间系数',
  fighterHealth: '攻击机血量系数', diveBomberHealth: '轰炸机血量系数', torpedoBomberHealth: '鱼雷机血量系数', skipBomberHealth: '跳弹轰炸机血量系数',
  torpedoDamageCoeff: '鱼雷伤害系数', torpedoRangeCoefficient: '鱼雷射程系数', torpedoSpeedMultiplier: '鱼雷速度系数', planeTorpedoArmingTimeCoeff: '空投鱼雷引信时间系数', planeTorpedoSpeedMultiplier: '空投鱼雷速度系数',
  prioritySectorCooldownMultiplier: '优先防空扇区冷却系数', rlsWorkTimeCoeff: '雷达持续时间系数', sonarWorkTimeCoeff: '水搜持续时间系数', crashCrewWorkTimeCoeff: '损管持续时间系数', regenCrewWorkTimeCoeff: '维修小组持续时间系数',
  smokeGeneratorLifeTime: '烟幕存续时间系数', smokeGeneratorWorkTimeCoeff: '发烟时间系数', smokeGeneratorReloadCoeff: '烟幕冷却系数', smokeGeneratorAdditionalConsumables: '额外烟幕次数', scoutWorkTimeCoeff: '侦察机持续时间系数', speedBoostersWorkTimeCoeff: '引擎增压持续时间系数'
}
const auraNames = { AuraNear: '近程防空', AuraMedium: '中程防空', AuraFar: '远程防空', AuraFar_Bubbles: '远程防空爆炸云' }
const auraFields = ['minDistance', 'maxDistance', 'areaDamage', 'areaDamagePeriod', 'hitChance', 'bubbleDamage', 'innerBubbleCount', 'outerBubbleCount']
const values = { AP: '穿甲弹', HE: '高爆弹', CS: '半穿甲弹', SAP: '半穿甲弹', repair: '伤害控制小组', regeneration: '维修小组', smoke: '烟幕发生器', fighter: '战斗机', scout: '侦察机', speedBoost: '引擎增压', sonar: '水底搜索', radar: '监视雷达', depthcharge: '深水炸弹', torpedo: '鱼雷', ...speciesNames, ...nations }
export function displayFields(category, keys, source, translations = {}) {
  const row = {}
  const text = value => typeof value === 'string' ? (translations[`IDS_${value.toUpperCase()}`] || values[value] || value) : value
  if (category === 'crew') {
    const personality = source.CrewPersonality || {}
    return { 独特舰长: personality.isUnique ?? null, 可重新训练: personality.isRetrainable ?? null,
      免费重置技能: personality.canResetSkillsForFree ?? null,
      技能数: Object.keys(source.Skills || {}).length, 专属技能数: Object.keys(source.UniqueSkills || {}).length,
      专属技能: Object.keys(source.UniqueSkills || {}).map(text).join('、') }
  }
  const add = (key, value, prefix = '') => {
    let label = labels[key] || `未释义参数 ${key}`
    if (category === 'hull' && key === 'maxSpeed') label = '最大航速(节)'
    if (category === 'hull' && key === 'visibilityFactor') label = '水面被发现距离(km)'
    if (Array.isArray(value)) {
      row[prefix + label] = value.map(item => item && typeof item === 'object' ?
        Object.entries(item).map(([k, v]) => `${labels[k] || k}: ${text(v)}`).join(' / ') : text(item)).join('、')
    } else if (value && typeof value === 'object') {
      for (const [child, childValue] of Object.entries(value)) add(child, childValue, `${prefix}${label}·`)
    } else {
      if (typeof value === 'number' && ['barrelDiameter', 'bulletDiametr'].includes(key)) value = Number((value * 1000).toFixed(6))
      if (typeof value === 'number' && ['burnProb', 'hitChance'].includes(key)) value = Number((value * 100).toFixed(6))
      row[prefix + label] = text(value) ?? null
    }
  }
  for (const key of keys) {
    if (key === 'modifiers') {
      const other = []
      for (const [modifier, value] of Object.entries(source.modifiers || {})) {
        const label = modifierLabels[modifier]
        if (!label) { other.push(modifier); continue }
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          const entries = Object.entries(value)
          for (const [species, amount] of entries) row[`${label}·${speciesNames[species] || (species === 'Auxiliary' ? '辅助单位' : species)}`] = amount
        } else row[label] = value
      }
      row['未释义修正项'] = other.join('、')
    } else if (auraNames[key]) {
      for (const field of auraFields) add(field, source[key]?.[field], `${auraNames[key]}·`)
    } else add(key, source[key])
  }
  return row
}
