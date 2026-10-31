/** 面向舰船横向比较的派生列；缺失参数保留空值，不以零代替。 */
export const number = value => typeof value === 'number' && Number.isFinite(value)
export const round = (value, digits = 2) => number(value) ? Number(value.toFixed(digits)) : null
export const scale = (value, factor) => number(value) ? round(value * factor) : null
export const common = values => {
  if (!values.length || values.some(value => value == null)) return null
  const unique = [...new Set(values)]
  return unique.length === 1 ? unique[0] : unique.join(' / ')
}

// 旧表的等效口径档位，不是模型装甲厚度；510 表示最高防护档。
export function splashCaliber(location) {
  const coefficient = location?.armorCoeff
  return ({ 0: 510, 0.2: 203, 0.4: 76.2, 0.6: 0, 0.8: 0, 1: 0 })[coefficient] ?? null
}

function concealmentFactor(event) {
  const ship = event.data, species = ship.typeinfo?.species
  const skill = { Battleship: 0.9, Cruiser: 0.9, Destroyer: 0.9, AirCarrier: 0.85, Submarine: 1 }[species]
  if (skill == null) return null
  const upgrade = event.concealmentUpgrade
  if (!upgrade?.modifiers) return null
  const included = upgrade.ships?.includes(ship.name || event.key)
  const applicable = included || (upgrade.shiplevel?.includes(ship.level) &&
    upgrade.shiptype?.includes(species) && upgrade.nation?.includes(ship.typeinfo?.nation) &&
    upgrade.group?.includes(ship.group))
  const excluded = upgrade.excludes?.includes(ship.name || event.key)
  const modifier = upgrade.modifiers.visibilityDistCoeff
  const coefficient = typeof modifier === 'object' ? modifier[species] : modifier
  return applicable && !excluded ? (number(coefficient) ? skill * coefficient : null) : skill
}

export function hullComparison(event, hull) {
  const factor = concealmentFactor(event)
  const engines = Object.entries(event.data).filter(([key]) => key.split('_')[1] === 'Engine').map(([, value]) => value)
  const ammo = Object.entries(hull).filter(([key]) => /^Ammo_\d+$/.test(key)).map(([, value]) => value)
  const row = {
    血量: hull.health ?? null,
    '引擎溅射防护口径(mm)': common(engines.map(engine => splashCaliber(engine.HitLocationEngine))),
    '舵机溅射防护口径(mm)': splashCaliber(hull.SG),
    '弹药库溅射防护口径(mm)': common(ammo.map(splashCaliber)),
    '水面隐蔽(标准)(km)': hull.visibilityFactor ?? null,
    '水面隐蔽(最小)(km)': factor == null ? null : scale(hull.visibilityFactor, factor),
    '空中隐蔽(标准)(km)': hull.visibilityFactorByPlane ?? null,
    '空中隐蔽(最小)(km)': factor == null ? null : scale(hull.visibilityFactorByPlane, factor),
    '烟内开火隐蔽(km)': hull.visibilityCoefGKInSmoke ?? null,
    '最大航速(节)': hull.maxSpeed ?? null,
    '换舵时间(s)': hull.rudderTime ?? null,
    '转弯半径(m)': hull.turningRadius ?? null,
    '主机功率(hp)': hull.enginePower ?? null,
    '推重比(hp/t)': number(hull.enginePower) && hull.tonnage > 0 ? round(hull.enginePower / hull.tonnage) : null,
    '排水量(t)': hull.tonnage ?? null,
    '长度(m)': hull.size?.[0] ?? null, '宽度(m)': hull.size?.[1] ?? null, '高度(m)': hull.size?.[2] ?? null,
    '吃水(m)': hull.draft ?? null
  }
  for (const [key, label] of Object.entries({ Bow: '船头血量', Cas: '炮塔装甲血量', Hull: '船身整体血量', SS: '上层建筑血量', SSC: '辅助舱间血量', St: '船尾血量' })) row[label] = hull[key]?.maxHP ?? null
  return row
}

export function weaponMounts(component) {
  return Object.entries(component).filter(([key, value]) => key.startsWith('HP_') && value && typeof value === 'object')
    .map(([key, value]) => ({ ...component, ...value, mount: key }))
}

function ammunition(mount, references, type) {
  const shells = (mount.ammoList || []).map(key => references[key]).filter(shell =>
    shell && (shell.ammoType === type || (type === 'CS' && shell.ammoType === 'SAP')))
  // 同弹种可替换弹药不能相加为一轮齐射。
  return shells.length === 1 ? shells[0] : null
}

function damageTotals(mounts, references, type) {
  const relevant = mounts.filter(mount => ammunition(mount, references, type))
  if (!relevant.length || mounts.some(mount => !mount.ammoList?.length || mount.ammoList.some(key => !references[key]) ||
    mount.ammoList.filter(key => references[key]?.ammoType === type || (type === 'CS' && references[key]?.ammoType === 'SAP')).length > 1)) return { salvo: null, dpm: null }
  if (relevant.some(mount => !number(mount.numBarrels) || !number(ammunition(mount, references, type).alphaDamage))) return { salvo: null, dpm: null }
  const damage = mount => mount.numBarrels * ammunition(mount, references, type).alphaDamage
  return {
    salvo: round(relevant.reduce((sum, mount) => sum + damage(mount), 0), 0),
    dpm: relevant.every(mount => number(mount.shotDelay) && mount.shotDelay > 0)
      ? round(relevant.reduce((sum, mount) => sum + damage(mount) * 60 / mount.shotDelay, 0), 0) : null
  }
}

/** 主炮每个配置一行；混合口径逐座累加伤害，不用首座炮塔冒充全舰。 */
export function artilleryComparison(component, references = {}, selectedMounts = weaponMounts(component)) {
  const mounts = selectedMounts.length ? selectedMounts : [component]
  const specifications = new Map()
  for (const mount of mounts) {
    const key = `${mount.numBarrels ?? '?'} × ${scale(mount.barrelDiameter, 1000) ?? '?'} mm`
    specifications.set(key, (specifications.get(key) || 0) + 1)
  }
  const row = {
    规格: [...specifications].map(([spec, count]) => `${count} × ${specifications.size === 1 ? spec.split(' × ')[0] : spec}`).join(' + '),
    '炮管口径(mm)': common(mounts.map(mount => scale(mount.barrelDiameter, 1000))),
    总炮管数: mounts.every(mount => number(mount.numBarrels)) ? mounts.reduce((sum, mount) => sum + mount.numBarrels, 0) : null,
    '装填时间(s)': common(mounts.map(mount => mount.shotDelay)),
    '射程(km)': scale(component.maxDist, 0.001),
    '180度转炮时间(s)': common(mounts.map(mount => {
      const speed = Array.isArray(mount.rotationSpeed) ? mount.rotationSpeed[0] : mount.rotationSpeed
      return speed > 0 ? round(180 / speed) : null
    }))
  }
  for (const [type, label] of [['HE', 'HE'], ['AP', 'AP'], ['CS', '半穿甲弹']]) {
    const shells = mounts.map(mount => ammunition(mount, references, type)).filter(Boolean)
    const totals = damageTotals(mounts, references, type)
    row[`${label}标伤`] = common(shells.map(shell => shell.alphaDamage))
    row[`${label}单轮齐射最大伤害`] = totals.salvo
    row[type === 'HE' ? 'HE每分钟标伤' : `${label}每分钟最大伤害`] = totals.dpm
    if (type === 'HE') {
      row['HE穿深(mm)'] = common(shells.map(shell => shell.alphaPiercingHE))
      row['IFHE穿深(mm)'] = common(shells.map(shell => number(shell.alphaPiercingHE) ? Math.floor(shell.alphaPiercingHE * 1.25) : null))
      row['HE点燃几率(%)'] = common(shells.map(shell => scale(shell.burnProb, 100)))
    } else {
      if (type === 'AP') row['AP碾压厚度(mm)'] = common(shells.map(shell => number(shell.bulletDiametr) ? Math.floor(shell.bulletDiametr * 1000 / 14.3) : null))
      else row['半穿甲弹穿深(mm)'] = common(shells.map(shell => shell.alphaPiercingCS))
      row[`${label}最小跳弹角(°)`] = common(shells.map(shell => shell.bulletRicochetAt))
      row[`${label}最大跳弹角(°)`] = common(shells.map(shell => shell.bulletAlwaysRicochetAt))
      row[`${label}引信长度(s)`] = common(shells.map(shell => shell.bulletDetonator))
      row[`${label}引信触发阈值(mm)`] = common(shells.map(shell => shell.bulletDetonatorThreshold))
    }
  }
  row['Sigma系数'] = component.sigmaCount ?? null
  row['水平散布公式'] = common(mounts.map(mount => mount.idealDistance > 0 && number(mount.idealRadius) && number(mount.minRadius)
    ? `${round((mount.idealRadius - mount.minRadius) * 1000 / mount.idealDistance)} × R + ${round(mount.minRadius * 30)}` : null))
  row['垂直散布系数'] = common(mounts.map(mount => [mount.radiusOnZero, mount.radiusOnDelim, mount.radiusOnMax, mount.delim].every(number)
    ? `${mount.radiusOnZero} ~ ${mount.radiusOnDelim} (R=${round(mount.delim * 100)}%) ~ ${mount.radiusOnMax}` : null))
  row['模块血量'] = common(mounts.map(mount => (mount.HitLocationArtillery || mount.HitLocationATBA)?.maxHP))
  row['溅射防护口径(mm)'] = common(mounts.map(mount => splashCaliber(mount.HitLocationArtillery || mount.HitLocationATBA)))
  row['挂载点'] = mounts.map(mount => mount.mount).filter(Boolean).join('、')
  row['弹药编号'] = [...new Set(mounts.flatMap(mount => mount.ammoList || []))].join('、')
  return row
}

/** 副炮按同口径、装填和弹药分组，避免逐个挂载点重复。 */
export function secondaryComparison(component, references) {
  const groups = new Map()
  for (const mount of weaponMounts(component)) {
    const key = JSON.stringify([mount.barrelDiameter, mount.shotDelay, mount.ammoList])
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(mount)
  }
  return [...groups.values()].map(mounts => artilleryComparison(component, references, mounts))
}

/** 两用炮的防空光环可能位于主炮或副炮组件；仅合并同一舰体配置的组件。 */
export function airDefenseConfigurations(data, config, component) {
  const variants = new Map()
  for (const upgrade of Object.values(data.ShipUpgradeInfo || {})) {
    const components = upgrade?.components
    if (!components?.airDefense?.includes(config)) continue
    for (const artillery of components.artillery?.length ? components.artillery : ['']) {
      for (const secondary of components.atba?.length ? components.atba : ['']) {
        const names = [artillery, secondary].filter(name => data[name])
        variants.set(names.join(' / '), names)
      }
    }
  }
  if (!variants.size) variants.set('', [])
  return [...variants].map(([variant, names]) => {
    const values = { ...component }
    for (const name of names) {
      for (const key of ['AuraNear', 'AuraMedium', 'AuraFar', 'AuraFar_Bubbles']) {
        if (data[name][key] && !values[key]) values[key] = data[name][key]
      }
    }
    return { config: variants.size > 1 ? `${config} / ${variant}` : config, values }
  })
}

export const comparisonNotes = {
  船体: '标准隐蔽为裸船值。最小隐蔽按常规隐蔽技能（水面舰艇 −10%、航母 −15%、潜艇无此技能）及可安装的隐蔽系统修改型 1 计算，不含传奇升级品和条件增益。技能血量按普通舰长计算：驱逐每级 +350，巡洋每级 +450。标准维修血池只计基础维修次数与基础恢复量，不保证实战伤害均可恢复。溅射防护为旧表等效口径档位，510 mm 表示最高档，不代表实际装甲厚度。',
  火炮: '每个主炮配置一行。单轮标伤＝各炮塔炮管数 × 单发标伤之和；每分钟标伤＝各炮塔单轮标伤 × 60 ÷ 装填时间之和。均为理论全炮管输出，不计射界、命中率、伤害饱和、技能或升级品；IFHE 穿深按 ×1.25 向下取整。空值表示不适用或参数不足。',
  副炮: '按口径、装填和弹药分组，伤害合计为该组全舰炮管理论输出，包含两舷，不代表单侧实战输出。',
  防空: '面板秒伤＝每周期伤害 ÷ 伤害周期；另列计入命中率后的有效秒伤。旧版面板列取整数。爆炸云原始周期伤害不可直接当作旧版累计伤害。',
  鱼雷: '按发射器配置、装填和弹药分组；不同可选弹药分别展示。标伤＝基本伤害÷3＋溅射伤害；射程按参数单位×30 m 换算；反应时间和上浮距离采用游戏内 2.6854 m/s 每节的鱼雷移动尺度。距离为 km，旋转/装填/反应时间为秒，口径和防护档位为 mm。',
  飞机: '按舰船航空组件与机型展示，机库和整备时间取对应飞机配置；载弹量＝每次投弹数×投弹次数。最大速度为携弹速度×最大速度系数。基础散布为静态落弹区（m，鱼雷机保留原参数），不混入旧版标准/常规配装的航迹拉伸。独立飞机实体见“飞机参数”。',
  空袭: '关联空袭飞机和所带弹药。距离为 km，装填和落弹时间为秒，速度为节，点火率为百分比。散布含连续投弹沿航向形成的长度，单位为 m。',
  反潜武器: '区分反潜空袭与舰载深弹。深弹数量为同配置所有投放器的 numBombs 之和；不同弹药分行，缺失参数不按零处理。距离为 km，装填为秒。',
  声呐: '从 waveParams 和 sectorParams 读取波速、宽度、隐蔽和单/双重标记参数。射程为 km；速度为 m/s；宽度及隐蔽为 m；持续与刷新时间为秒。',
  消耗品: '每舰一行，按槽位列出可选消耗品；同名消耗品的不同配置用斜线分隔，不叠加次数。次数 −1 显示为无限。详细独立配置见“消耗品参数”；冷却和持续时间为秒，半径等未统一转换的值保留游戏原始单位。',
  特色: '依据舰船组件是否包含非空手动副炮、可切换主炮、RageMode、AdrenalineRush 配置判断；不把所有舰船都可学习的舰长技能当作固有特色。',
  弹道穿深: '恢复按舰船、主炮配置、弹药比较的页面。提供弹重(kg)、口径(mm)、风阻、初速(m/s)、克虏伯系数和转正角(°)。距离穿深、飞行时间与落角尚无经校验的求解器，相关列保留为空并标为待核实。'
}
comparisonNotes.火炮 += ' 最大射程按最高火控、适用的常规射程升级品（同槽互斥）、驱逐射程技能和侦察机计算，不含传奇升级品及条件增益；HE 点火期望按全命中并以关联舰体自身火灾抗性作比较基准。水平散布公式中的 R 为 km。'
