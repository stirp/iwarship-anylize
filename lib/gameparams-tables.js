/** GameParams 属性表：舰船比较列与原始实体参数分开组织。 */
import { identity, displayFields } from './gameparams-labels.js'
import { hullComparison, artilleryComparison, secondaryComparison, airDefenseConfigurations } from './gameparams-comparison.js'
import { abilitySummary, aircraftComparison, airSupportComparison, aswComparison, torpedoComparison,
  pingerComparison, penetrationComparison, artilleryExtras, hullExtras, airDefenseExtras } from './gameparams-equipment.js'
import { alignLegacyRow } from './gameparams-legacy-columns.js'
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
const entityCategories = { Projectile: 'projectiles', Aircraft: 'aircraftDetails', Ability: 'abilityDetails', Crew: 'crew', Modernization: 'modernizations' }

export function buildGameParamsRows(event, categories, translations = {}) {
  const result = []
  const data = event.data
  const base = identity(event, translations)
  const add = (category, config, values, extra = {}) => {
    if (!categories.includes(category)) return
    const fieldCategory = ({ aircraftDetails: 'aircraft', abilityDetails: 'ability' })[category] || category
    const row = { ...base, 配置: config, ...displayFields(fieldCategory, fields[fieldCategory] || [], values, translations), ...extra }
    if (event.kind === 'Ship') alignLegacyRow(category, row)
    result.push({ category, row })
  }
  const comparison = (category, config, row) => {
    if (categories.includes(category)) result.push({ category, row: alignLegacyRow(category, { ...base, 配置: config, ...row }) })
  }
  if (event.kind !== 'Ship') {
    const category = entityCategories[event.kind]
    if (category === 'abilityDetails') {
      for (const [name, value] of Object.entries(data)) {
        if (value && typeof value === 'object' && 'consumableType' in value) add(category, name, { ...value, ...value.logic })
      }
    } else if (category === 'aircraftDetails') add(category, '', data, aircraftComparison(data, event.references, translations))
    else if (category) add(category, '', data)
    return result
  }
  if (data.ShipAbilities) comparison('ability', '全部槽位', abilitySummary(event, translations))
  if (categories.includes('specials')) {
    const components = Object.values(data).filter(value => value && typeof value === 'object')
    const mode = components.map(value => value.SwitchableModeArtilleryModule).find(Boolean)
    const rage = components.map(value => value.RageMode).find(Boolean)
    const adrenaline = components.map(value => value.AdrenalineRush).find(Boolean)
    comparison('specials', '舰船特色', { 副炮手动模式: components.some(value => Object.keys(value.manualModeModifiers || {}).length > 0),
      爆发模式: Boolean(mode), 狂暴模式: Boolean(rage), 肾上腺素: Boolean(adrenaline),
      爆发模式参数: mode ? JSON.stringify(mode) : null, 狂暴持续时间: rage?.boostDuration ?? null,
      狂暴修正: rage ? JSON.stringify(rage.modifiers || {}) : null,
      肾上腺素修正: adrenaline ? JSON.stringify(adrenaline.healthModifiers || []) : null })
  }
  for (const [config, component] of Object.entries(data)) {
    if (!component || typeof component !== 'object') continue
    const suffix = config.split('_')[1]
    const category = event.componentKinds?.[config] || componentCategories[suffix]
    if (category === 'hull') comparison(category, config, { ...hullComparison(event, component), ...hullExtras(event, component) })
    else if (category === 'artillery') {
      comparison(category, config, { ...artilleryComparison(component, event.references), ...artilleryExtras(event, config, component) })
      if (categories.includes('penetration')) for (const row of penetrationComparison(component, event.references)) comparison('penetration', config, row)
    }
    else if (category === 'atba') {
      const rows = secondaryComparison(component, event.references)
      const damage = row => [row.HE每分钟标伤, row.AP每分钟最大伤害, row.半穿甲弹每分钟最大伤害].filter(value => typeof value === 'number')
      const total = rows.length && rows.every(row => damage(row).length) ? rows.reduce((sum, row) => sum + Math.max(...damage(row)), 0) : null
      for (const row of rows) comparison(category, config, { ...row,
        总计每分钟最大伤害: total, 每分钟最大伤害: damage(row).length ? Math.max(...damage(row)) : null,
        标伤: row.HE标伤 ?? row.AP标伤 ?? row.半穿甲弹标伤,
        穿深: row['HE穿深(mm)'] ?? row['半穿甲弹穿深(mm)'], 点火率: row['HE点燃几率(%)'] })
      if (!rows.length) comparison(category, config, artilleryComparison(component, event.references))
    } else if (category === 'airDefense') {
      for (const variant of airDefenseConfigurations(data, config, component)) add(category, variant.config, variant.values, airDefenseExtras(variant.values))
    } else if (['torpedoes', 'asw', 'airSupport'].includes(category)) {
      const rows = ({ torpedoes: torpedoComparison, asw: aswComparison, airSupport: airSupportComparison })[category](component, event.references)
      for (const row of rows) comparison(category, config, row)
      if (!rows.length) add(category, config, component)
    } else if (category === 'pingerGun') comparison(category, config, pingerComparison(component))
    else if (Array.isArray(component.planes)) {
      for (const key of component.planes) comparison('aircraft', config,
        aircraftComparison(event.references?.[key] || { name: key }, event.references, translations))
    } else if (category) add(category, config, component)
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
