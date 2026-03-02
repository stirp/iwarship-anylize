/**
 * 字段映射配置
 * 定义原始数据字段到输出的转换规则
 */

// 船体映射
export const 船体 = {
    "名字": "(.index + .upgrade.hull)",
    "类型": ".group",
    "等级": ".level",
    "舰种": ".species",
    "国家": ".nation",
    "血量": ".health",
    "血量(技能:生存专家)": ".\"health-perk\"",
    "血量(最大血池)": ".\"health-max\"",
    "防雷系数": ".flood",
    "船头血量": ".modelMaxHP.Bow",
    "炮塔装甲血量": ".modelMaxHP.Cas",
    "船身整体血量": ".modelMaxHP.Hull",
    "上层建筑血量": ".modelMaxHP.SS",
    "辅助舱间血量": ".modelMaxHP.SSC",
    "船尾血量": ".modelMaxHP.St",
    "引擎防溅射口径": ".engineSplashArmor",
    "舵机防溅射口径": ".sgSplashArmor",
    "水面隐蔽": ".visibilityFactor",
    "水面隐蔽(最小)": ".\"visibilityFactor-min\"",
    "空中隐蔽": ".visibilityFactorByPlane",
    "空中隐蔽(最小)": ".\"visibilityFactorByPlane-min\"",
    "水下隐蔽": ".visibilityFactorBySubmarine",
    "水下隐蔽(最小)": ".\"visibilityFactorBySubmarine-min\"",
    "烟内开火隐蔽": ".visibilityCoefGKInSmoke",
    "最大航速": ".maxSpeed",
    "最大航速(引擎增加+信号旗)": ".\"maxSpeed-max\"",
    "转舵时间": ".rudderTime",
    "转舵半径": ".turningRadius",
    "引擎出力": ".enginePower",
    "推重比": ".thrustWeightRatio",
    "吨位": ".tonnage",
    "长度": ".length",
    "宽度": ".width",
    "高度": ".height",
    "核心高度": ".citHeight",
    "船头厚度": ".armor.bow"
}

// 火炮映射
export const 火炮 = {
    "名字": "(.index + .upgrade.hull + (if .upgrade.art == null then null else (.upgrade.art | tostring) end))",
    "类型": ".group",
    "等级": ".level",
    "舰种": ".species",
    "国家": ".nation",
    "规格": ".number",
    "口径": ".barrelDiameter",
    "装填时间": ".shotDelay",
    "射程": ".maxDist",
    "最大射程": ".\"maxDist-max\"",
    "180度转炮时间": ".rotationSpeed",
    "前齐射角": ".horizSector[0]",
    "后齐射角": ".horizSector[1]",
    "HE标伤": ".HEalphaDamage",
    "HE每分钟标伤": ".HEalphaDamagePM",
    "HE单轮齐射最大伤害": ".HEalphaDamagePH",
    "HE穿深": ".HEalphaPiercing",
    "IFHE穿深": ".\"HEalphaPiercing-ifhe\"",
    "HE点燃几率": ".HEburnProb",
    "HE每分钟点火期望": ".HEburnProbPM",
    "AP标伤": ".APalphaDamage",
    "AP每分钟最大伤害": ".APalphaDamagePM",
    "AP单轮齐射最大伤害": ".APalphaDamagePH",
    "AP碾压厚度": ".APbulletNeverRicochetArmor",
    "AP最小跳弹角": ".APbulletRicochetAt[0]",
    "AP最大跳弹角": ".APbulletRicochetAt[1]",
    "AP引信长度": ".APbulletDetonator",
    "AP引信触发阈值": ".APbulletDetonatorThreshold",
    "半穿甲弹标伤": ".CSalphaDamage",
    "半穿甲弹每分钟最大伤害": ".CSalphaDamagePM",
    "半穿甲弹单轮齐射最大伤害": ".CSalphaDamagePH",
    "半穿甲弹穿深": ".CSalphaPiercing",
    "半穿甲弹最小跳弹角": ".CSbulletRicochetAt[0]",
    "半穿甲弹最大跳弹角": ".CSbulletRicochetAt[1]",
    "模块血量": ".modelMaxHP",
    "溅射防护口径": ".splashArmor",
    "Sigma系数": ".sigmaCount",
    "水平散布公式": ".maxDispFormula",
    "垂直散布系数": ".verticalDispCoeff"
}

// 副炮映射
export const 副炮 = {
    "名字": "(.index + .upgrade.hull)",
    "类型": ".group",
    "等级": ".level",
    "舰种": ".species",
    "国家": ".nation",
    "射程": ".maxDist",
    "总计每分钟最大伤害": ".sumAlphaDamagePM",
    "规格1": ".number[0]",
    "装填时间1": ".shotDelay[0]",
    "模块血量1": ".modelMaxHP[0]",
    "溅射防护口径1": ".splashArmor[0]",
    "水平散布公式1": ".maxDispFormula[0]",
    "标伤1": ".alphaDamage[0]",
    "穿深1": ".alphaPiercingHE[0]",
    "点火率1": ".burnProb[0]",
    "每分钟最大伤害1": ".alphaDamagePM[0]",
    "规格2": ".number[1]",
    "装填时间2": ".shotDelay[1]",
    "模块血量2": ".modelMaxHP[1]",
    "溅射防护口径2": ".splashArmor[1]",
    "水平散布公式2": ".maxDispFormula[1]",
    "标伤2": ".alphaDamage[1]",
    "穿深2": ".alphaPiercingHE[1]",
    "点火率2": ".burnProb[1]",
    "每分钟最大伤害2": ".alphaDamagePM[1]",
    "规格3": ".number[2]",
    "装填时间3": ".shotDelay[2]",
    "模块血量3": ".modelMaxHP[2]",
    "溅射防护口径3": ".splashArmor[2]",
    "水平散布公式3": ".maxDispFormula[2]",
    "标伤3": ".alphaDamage[2]",
    "穿深3": ".alphaPiercingHE[2]",
    "点火率3": ".burnProb[2]",
    "每分钟最大伤害3": ".alphaDamagePM[2]"
}

// 鱼雷映射
export const 鱼雷 = {
    "名字": "(.index + .upgrade.hull + .upgrade.torp)",
    "类型": ".group",
    "等级": ".level",
    "舰种": ".species",
    "国家": ".nation",
    "型号": ".number",
    "装填手": ".loaders",
    "装填时间": ".shotDelay",
    "模块血量": ".modelMaxHP",
    "溅射防护口径": ".splashArmor",
    "标伤": ".portDamage",
    "基本伤害": ".alphaDamage",
    "溅射伤害": ".damage",
    "漏水系数": ".uwCritical",
    "射程": ".maxDist",
    "速度": ".speed",
    "发现距离": ".visibilityFactor",
    "反应时间": ".reactionTime",
    "上浮距离": ".armingDist",
    "180度旋转时间": ".rotationSpeed",
    "最小散布角度": ".torpedoAngles[0]",
    "最大散布角度": ".torpedoAngles[1]",
    "i18nkey": "(.upgrade.torp | [.])",
    "可单发": ".special.useOneShot",
    "可替换": ".special.alternative"
}

// 防空映射
export const 防空 = {
    "名字": "(.index + .upgrade.hull)",
    "类型": ".group",
    "等级": ".level",
    "舰种": ".species",
    "国家": ".nation",
    "近程面板秒伤": ".nearPortDamage",
    "近程伤害": ".nearAreaDamage",
    "近程命中率": ".nearHitChance",
    "近程射程": ".nearMaxDistance",
    "中程面板秒伤": ".mediumPortDamage",
    "中程伤害": ".mediumAreaDamage",
    "中程命中率": ".mediumHitChance",
    "中程射程": ".mediumMaxDistance",
    "远程面板秒伤": ".farPortDamage",
    "远程伤害": ".farAreaDamage",
    "远程命中率": ".farHitChance",
    "远程射程": ".farMaxDistance",
    "黑云生成距离": ".bubbleMaxDistance",
    "黑云伤害": ".bubbleDamage",
    "黑云半径": ".bubbleRadius",
    "手动防空冷却时间": ".prioritySectorCooldown",
    "手动防空瞬时伤害": ".prioritySectorInstantaneousDamage",
    "手动防空启动时间": ".prioritySectorStartupTime",
    "手动防空持续时间": ".prioritySectorDuration"
}

// 飞机映射
export const 飞机 = {
    "名字": "(.index + (.upgrade.air // \"\"))",
    "类型": ".group",
    "等级": ".level",
    "舰种": ".species",
    "国家": ".nation",
    "飞机类型": ".planeType",
    "中队飞机": ".numInSquadron",
    "波次飞机": ".numInAttack",
    "飞机载弹": ".numInPlane",
    "机库": ".maxHangar",
    "整备时间": ".restoreTime",
    "基础血量": ".maxHealth",
    "巡航速度": ".cruiseSpeed",
    "基础速度": ".maxSpeed",
    "攻击冷却时间": ".attackCooldown",
    "水面隐蔽": ".visibility",
    "增压时间": ".boostTime",
    "增压填充时间": ".boostReloadTime",
    "投弹散步": ".salvoSize",
    "中央投弹概率": ".innerPercentage",
    "口径": ".diametr",
    "弹种": ".ammoType",
    "标伤": ".alphaDamage",
    "点火率": ".burnProb",
    "穿深": ".piercing",
    "跳弹角最小": ".ricochetAt[0]",
    "跳弹角最大": ".ricochetAt[1]",
    "漏水系数": ".uwCritical",
    "射程": ".maxDist",
    "速度": ".speed",
    "发现距离": ".visibilityFactor",
    "上浮时间": ".armingTime",
    "i18nkey": ".upgrade.air | [.]"
}

// 空袭映射
export const 空袭 = {
    "名字": ".index",
    "类型": ".group",
    "等级": ".level",
    "舰种": ".species",
    "国家": ".nation",
    "可用数量": ".chargesNum",
    "攻击飞机数": ".numInAttack",
    "巡航速度": ".cruiseSpeed",
    "飞机载弹": ".numInPlane",
    "标伤": ".alphaDamage",
    "穿深": ".piercing",
    "点火率": ".burnProb",
    "落弹时间": ".fallTime",
    "最小散布": ".minSpread",
    "中央炸弹比例": ".innerBombsPercentage",
    "中央最小散布": ".innerMinSpread",
    "最大距离": ".maxDist",
    "装填时间": ".reloadTime"
}

// 消耗品映射
export const 消耗品 = {
    "名字": ".index",
    "类型": ".group",
    "等级": ".level",
    "舰种": ".species",
    "国家": ".nation",
    "1号槽": "(.AbilitySlot0|map(values|ascii_upcase)|sort|join(\",\"))",
    "2号槽": "(.AbilitySlot1|map(values|ascii_upcase)|sort|join(\",\"))",
    "3号槽": "(.AbilitySlot2|map(values|ascii_upcase)|sort|join(\",\"))",
    "4号槽": "(.AbilitySlot3|map(values|ascii_upcase)|sort|join(\",\"))",
    "5号槽": "(.AbilitySlot4|map(values|ascii_upcase)|sort|join(\",\"))",
    "i18nkey": "((.AbilitySlot0+.AbilitySlot1+.AbilitySlot2+.AbilitySlot3+.AbilitySlot4) | map(values|ascii_upcase))",
    "主炮助推装填器CD时间": ".\"Uab-reloadTime\"",
    "防御用对空火力CD时间": ".\"Uadd-reloadTime\"",
    "伤害控制小组次数": ".\"Ucc-numConsumables\"",
    "伤害控制小组CD时间": ".\"Ucc-reloadTime\"",
    "伤害控制小组持续时间": ".\"Ucc-workTime\"",
    "战斗机次数": ".\"Uf-numConsumables\"",
    "战斗机CD时间": ".\"Uf-reloadTime\"",
    "侦察机次数": ".\"Us-numConsumables\"",
    "侦察机CD时间": ".\"Us-reloadTime\"",
    "引擎增压次数": ".\"Usb-numConsumables\"",
    "引擎增压CD时间": ".\"Usb-reloadTime\"",
    "发烟机次数": ".\"Usg-numConsumables\"",
    "发烟机CD时间": ".\"Usg-reloadTime\"",
    "发烟机半径": ".\"Usg-radius\"",
    "维修小组次数": ".\"Urc-numConsumables\"",
    "维修小组CD时间": ".\"Urc-reloadTime\"",
    "维修小组持续时间": ".\"Urc-workTime\""
}

// 特色映射
export const 特色 = {
    "名字": ".index",
    "类型": ".group",
    "等级": ".level",
    "舰种": ".species",
    "国家": ".nation",
    "特色-狂暴模式": ".specials.rageMode",
    "特色-爆发模式": ".specials.burstMode"
}

// 弹道穿深映射
export const 弹道穿深 = {
    "名字": "(.index + .upgrade.hull + (if .upgrade.art == null then null else (.upgrade.art | tostring) end))",
    "类型": ".group",
    "等级": ".level",
    "舰种": ".species",
    "国家": ".nation",
    "弹药类型": ".ammoType",
    "弹重": ".Pms",
    "口径": ".Pdia",
    "风阻": ".Pad",
    "初速": ".Psp",
    "硬度": ".Pk",
    "转正": ".Pcnma",
    "出膛穿深": ".penVertAt0",
    "10KM穿深": ".penVertAt10",
    "14KM穿深": ".penVertAt14",
    "18KM穿深": ".penVertAt18",
    "22KM穿深": ".penVertAt22",
    "10KM落弹时间": ".flyTimeAt10",
    "14KM落弹时间": ".flyTimeAt14",
    "18KM落弹时间": ".flyTimeAt18",
    "22KM落弹时间": ".flyTimeAt22",
    "10KM落弹角": ".impactAngleAt10",
    "14KM落弹角": ".impactAngleAt14",
    "18KM落弹角": ".impactAngleAt18",
    "22KM落弹角": ".impactAngleAt22"
}

// 反潜武器映射
export const 反潜武器 = {
    "名字": ".index",
    "类型": ".group",
    "等级": ".level",
    "舰种": ".species",
    "国家": ".nation",
    "可用数量": ".chargesNum",
    "波次飞机": ".numInAttack",
    "巡航速度": ".cruiseSpeed",
    "飞机载弹": ".numInPlane",
    "标伤": ".alphaDamage",
    "穿深": ".piercing",
    "点火概率": ".burnProb",
    "落弹时间": ".fallTime",
    "投弹散布": ".salvoSize",
    "中央投弹概率": ".innerPercentage",
    "最大时间": ".maxDist",
    "装填时间": ".reloadTime"
}

// 声呐映射
export const 声呐 = {
    "类型": ".group",
    "等级": ".level",
    "舰种": ".species",
    "国籍": ".nation",
    "名称": ".index",
    "声波射程": ".waveDistance",
    "声波装填": ".waveReloadTime",
    "声波速度": ".waveSpeed",
    "声波宽度": ".waveWidth",
    "声波隐蔽": ".waveVisibility",
    "高亮区持续时间": ".sectorLifeTime",
    "高亮区双ping持续时间": ".sectorLifeTime2",
    "高亮区宽度": ".sectorWidth",
    "高亮区刷新时间": ".sectorAlertTime"
}

// 映射表导出
export const mappings = {
    "船体": 船体,
    "火炮": 火炮,
    "副炮": 副炮,
    "鱼雷": 鱼雷,
    "防空": 防空,
    "飞机": 飞机,
    "空袭": 空袭,
    "消耗品": 消耗品,
    "特色": 特色,
    "弹道穿深": 弹道穿深,
    "反潜武器": 反潜武器,
    "声呐": 声呐
}

/**
 * 获取映射配置
 * @param {string} category - 类别名称
 * @returns {Object|null} - 映射配置
 */
export function getMapping(category) {
    return mappings[category] || null
}
