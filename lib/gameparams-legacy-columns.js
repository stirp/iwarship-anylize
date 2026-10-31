/** 旧版列与当前比较列的对应关系；没有可靠算法的列显式保留为待核实。 */
import { mappings } from './mappings.js'
import { categoryNames } from './categories.js'

export const legacyAliases = {
  船体: { 水面隐蔽: '水面隐蔽(标准)(km)', '水面隐蔽(最小)': '水面隐蔽(最小)(km)',
    空中隐蔽: '空中隐蔽(标准)(km)', '空中隐蔽(最小)': '空中隐蔽(最小)(km)', 烟内开火隐蔽: '烟内开火隐蔽(km)',
    引擎溅射防护口径: '引擎溅射防护口径(mm)', 舵机溅射防护口径: '舵机溅射防护口径(mm)', 弹药库溅射防护口径: '弹药库溅射防护口径(mm)',
    最大航速: '最大航速(节)', 转舵时间: '换舵时间(s)', 转向半径: '转弯半径(m)', 引擎出力: '主机功率(hp)',
    推重比: '推重比(hp/t)', 质量: '排水量(t)', 长度: '长度(m)', 宽度: '宽度(m)', 高度: '高度(m)' },
  火炮: { 口径: '炮管口径(mm)', 装填时间: '装填时间(s)', 射程: '射程(km)', '180度转炮时间': '180度转炮时间(s)',
    HE穿深: 'HE穿深(mm)', IFHE穿深: 'IFHE穿深(mm)', HE点燃几率: 'HE点燃几率(%)', AP碾压厚度: 'AP碾压厚度(mm)',
    AP最小跳弹角: 'AP最小跳弹角(°)', AP最大跳弹角: 'AP最大跳弹角(°)', AP引信长度: 'AP引信长度(s)', AP引信触发阈值: 'AP引信触发阈值(mm)',
    半穿甲弹穿深: '半穿甲弹穿深(mm)', 半穿甲弹最小跳弹角: '半穿甲弹最小跳弹角(°)', 半穿甲弹最大跳弹角: '半穿甲弹最大跳弹角(°)', 溅射防护口径: '溅射防护口径(mm)' },
  副炮: { 射程: '射程(km)', 装填时间: '装填时间(s)', 溅射防护口径: '溅射防护口径(mm)' },
  声呐: { 名称: '名字', 国籍: '国家' }
}

export const unsupportedColumns = {
  船体: {
    '血量(最大血池)': '旧版最大配装、恢复上限与增益组合未确定；另提供标准维修血池。',
    鱼雷防护: '当前舰体参数未直接提供可验证的防雷减伤百分比。',
    '最大航速(最大)': '最大配装涉及互斥消耗品和条件增益；另提供信号旗航速。',
    核心高度: '需要几何模型中核心区位置，不能用舰体尺寸替代。',
    甲板高度: '参数 deckHeight 与旧版几何甲板高度口径不一致。',
    '特色-弹射起步': '未确认旧版判定阈值。', '特色-重型船壳': '未确认旧版判定规则。',
    '特色-轻型船壳': '未确认旧版判定规则。', '特色-特殊维修小组': '尚未确认旧版标签的判定规则。'
  },
  火炮: { 前齐射角: '需结合炮塔安装朝向和死区求共同射界，不能直接取单塔水平射界。',
    后齐射角: '需结合炮塔安装朝向和死区求共同射界，不能直接取单塔水平射界。' },
  鱼雷: { 可击中目标: 'ignoreClasses 是排除列表，不能反向冒充可击中目标；另提供不可击中舰种。' },
  防空: { 爆炸伤害: '旧表是累计爆炸伤害，参数为周期伤害；未确认所有光环的累计周期，另列原始每周期值。' },
  飞机: { '血量(生存期望)': '需要旧版防空场景与生存模型，不能用基础血量冒充。',
    '最大散布(标准)': '需要旧版投弹航迹和标准配装修正。', '最大散布(常规)': '需要旧版常规配装及航迹修正。',
    '最小散布(标准)': '需要旧版投弹航迹和标准配装修正。', '最小散布(常规)': '需要旧版常规配装及航迹修正。',
    投弹方式: '未确认动作状态机与旧版投弹类型的完整映射。', '特色-完全修复': '未确认旧版完全修复判定规则。' },
  弹道穿深: Object.fromEntries(['出膛穿深', ...[10, 14, 18, 22].flatMap(range => [`${range}KM穿深`, `${range}KM落弹时间`, `${range}KM落弹角`])]
    .map(column => [column, '缺少经当前版本验证的弹道、穿甲求解器；保留列与弹道输入参数，不生成猜测值。']))
}

export function legacyColumns(category) {
  return Object.keys(mappings[category] || {}).filter(key => key !== 'i18nkey')
}

export function alignLegacyRow(categoryKey, row) {
  const category = categoryNames[categoryKey]
  for (const original of legacyColumns(category)) {
    const target = legacyAliases[category]?.[original] || original
    if (!(target in row)) row[target] = null
  }
  return row
}

export function columnCoverage(category, rows) {
  return legacyColumns(category).map(original => {
    const target = legacyAliases[category]?.[original] || original
    const reason = unsupportedColumns[category]?.[original]
    const populated = rows.filter(row => row[target] !== undefined && row[target] !== null && row[target] !== '').length
    return { original, target, status: reason ? '待核实' : populated ? '已提供' : '当前范围无值', populated,
      reason: reason || (populated ? '当前版本参数或已注明条件的派生值。' : '当前范围无适用值或缺少参数；不按零处理。') }
  })
}
