/** GameParams 原始属性表：不套用 iwarship 配装公式，不改变原始单位。 */
const fields = {
  hull: ['health', 'maxSpeed', 'rudderTime', 'turningRadius', 'tonnage', 'enginePower', 'visibilityFactor', 'visibilityFactorByPlane', 'visibilityCoefGKInSmoke', 'draft', 'size'],
  artillery: ['maxDist', 'sigmaCount', 'barrelDiameter', 'numBarrels', 'shotDelay', 'rotationSpeed', 'horizSector', 'ammoList'],
  torpedoes: ['maxDist', 'numBarrels', 'shotDelay', 'rotationSpeed', 'horizSector', 'ammoList'],
  atba: ['maxDist', 'sigmaCount', 'barrelDiameter', 'numBarrels', 'shotDelay', 'rotationSpeed', 'ammoList'],
  airDefense: ['prioritySectorCooldown', 'AuraNear', 'AuraMedium', 'AuraFar', 'AuraFar_Bubbles'],
  airSupport: ['maxDist', 'minDist', 'reloadTime', 'chargesNum', 'ammoList'],
  asw: ['maxDist', 'reloadTime', 'chargesNum', 'ammoList', 'shotDelay'],
  pingerGun: ['waveDistance', 'waveReloadTime', 'waveSpeed', 'waveWidth', 'waveVisibility', 'sectorLifeTime', 'sectorLifeTime2'],
  aircraft: ['maxHealth', 'maxSpeed', 'cruiseSpeed', 'speedMoveWithBomb', 'attackCooldown', 'restoreTime', 'bombName', 'ammoList', 'planeType'],
  projectiles: ['ammoType', 'alphaDamage', 'damage', 'bulletMass', 'bulletDiametr', 'bulletSpeed', 'bulletAirDrag', 'bulletKrupp', 'bulletDetonator', 'bulletDetonatorThreshold', 'bulletRicochetAt', 'bulletAlwaysRicochetAt', 'alphaPiercingHE', 'burnProb', 'speed', 'maxDist', 'visibilityFactor'],
  modernizations: ['slot', 'modifiers', 'ships', 'nation', 'shiplevel', 'shiptype'],
  crew: ['CrewPersonality', 'Skills', 'UniqueSkills'],
  ability: ['consumableType', 'numConsumables', 'reloadTime', 'workTime', 'distShip', 'distTorpedo', 'radius', 'regenerationHPSpeed'],
  specials: []
}

const componentCategories = {
  Hull: 'hull', Artillery: 'artillery', Torpedoes: 'torpedoes', SubTorpedoes: 'torpedoes', ATBA: 'atba',
  AirDefense: 'airDefense', AirDefence: 'airDefense', AirDedense: 'airDefense', AirSupport: 'airSupport',
  DepthCharge: 'asw', DepthChargeGuns: 'asw', DepthCharges: 'asw', ASW: 'asw',
  Pinger: 'pingerGun', PingerGun: 'pingerGun'
}
const entityCategories = { Projectile: 'projectiles', Aircraft: 'aircraft', Ability: 'ability', Crew: 'crew', Modernization: 'modernizations' }
const speciesNames = { Battleship: '战列舰', Cruiser: '巡洋舰', Destroyer: '驱逐舰', AirCarrier: '航空母舰', Submarine: '潜艇' }
const scalar = value => value && typeof value === 'object' ? JSON.stringify(value) : value ?? null

export function buildGameParamsRows(event, categories) {
  const result = []
  const data = event.data
  const base = { 名字: data.name || event.key, 编号: data.index || event.key, 等级: data.level ?? null,
    舰种: speciesNames[data.typeinfo?.species] || data.typeinfo?.species || '', 国家: data.typeinfo?.nation || '', 类型: data.group || event.kind }
  const add = (category, config, values, extra = {}) => {
    if (!categories.includes(category)) return
    const row = { ...base, 配置: config, ...extra }
    for (const key of fields[category] || []) row[key] = scalar(values[key])
    result.push({ category, row })
  }
  if (event.kind !== 'Ship') {
    const category = entityCategories[event.kind]
    if (category === 'ability') {
      for (const [name, value] of Object.entries(data)) {
        if (value && typeof value === 'object' && 'consumableType' in value) add(category, name, value)
      }
    } else if (category) add(category, '', data)
    return result
  }
  for (const [config, component] of Object.entries(data)) {
    if (!component || typeof component !== 'object') continue
    const suffix = config.split('_')[1]
    const category = event.componentKinds?.[config] || componentCategories[suffix]
    if (['artillery', 'atba', 'torpedoes', 'asw'].includes(category)) {
      const mounts = Object.entries(component).filter(([key, value]) => key.startsWith('HP_') && value && typeof value === 'object')
      if (!mounts.length) add(category, config, component)
      for (const [mount, values] of mounts) add(category, config, { ...component, ...values }, { 挂载点: mount })
    } else if (category) add(category, config, component)
    if ((config === 'Specials' || /^Specials\d*$/.test(suffix) || suffix === 'Innate') && categories.includes('specials')) {
      for (const [name, value] of Object.entries(component)) add('specials', name, {}, { 参数: scalar(value) })
    }
    if ((config === 'ShipAbilities' || suffix === 'Abilities') && categories.includes('ability')) {
      for (const [slot, value] of Object.entries(component)) add('ability', slot, {}, { 可用消耗品: scalar(value) })
    }
    if (categories.includes('armor') && config.includes('_')) {
      const visit = (value, path) => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return
        for (const [key, child] of Object.entries(value)) {
          if (key === 'armor' && child && typeof child === 'object') {
            for (const [encoded, thickness] of Object.entries(child)) {
              const id = Number(encoded)
              if (!Number.isSafeInteger(id) || typeof thickness !== 'number') continue
              result.push({ category: 'armor', row: { ...base, 配置: config, 部件: path || config,
                参数键: id, 层: Math.floor(id / 65536), 材质编号: id % 65536, '厚度(mm)': thickness } })
            }
          } else visit(child, path ? `${path}/${key}` : key)
        }
      }
      visit(component, '')
    }
  }
  return result
}
