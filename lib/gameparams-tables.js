/** GameParams 属性表：仅转换有明确含义的展示单位，不套用配装公式。 */
import { identity, displayFields } from './gameparams-labels.js'
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
  specials: ['buffsShiftMaxLevel', 'buffsStartPool', 'buffsShiftSpeed', 'modifiers']
}

const componentCategories = {
  Hull: 'hull', Artillery: 'artillery', Torpedoes: 'torpedoes', SubTorpedoes: 'torpedoes', ATBA: 'atba',
  AirDefense: 'airDefense', AirDefence: 'airDefense', AirDedense: 'airDefense', AirSupport: 'airSupport',
  DepthCharge: 'asw', DepthChargeGuns: 'asw', DepthCharges: 'asw', ASW: 'asw',
  Pinger: 'pingerGun', PingerGun: 'pingerGun'
}
const entityCategories = { Projectile: 'projectiles', Aircraft: 'aircraft', Ability: 'ability', Crew: 'crew', Modernization: 'modernizations' }

export function buildGameParamsRows(event, categories, translations = {}) {
  const result = []
  const data = event.data
  const base = identity(event, translations)
  const add = (category, config, values, extra = {}) => {
    if (!categories.includes(category)) return
    const row = { ...base, 配置: config, ...extra, ...displayFields(category, fields[category] || [], values, translations) }
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
      add('specials', config, component)
    }
    if ((config === 'ShipAbilities' || suffix === 'Abilities') && categories.includes('ability')) {
      for (const [slot, value] of Object.entries(component)) add('ability', slot, {}, {
        可用消耗品: (value?.abils || []).map(([name, variant]) => `${translations[`IDS_${name.toUpperCase()}`] || name} (${variant})`).join('、') })
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
