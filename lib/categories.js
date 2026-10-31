/** 各来源支持的类别；原始参数不冒充网站的派生计算结果。 */
export const categoryNames = {
  hull: '船体', artillery: '火炮', torpedoes: '鱼雷', aircraft: '飞机',
  atba: '副炮', airSupport: '空袭', airDefense: '防空', pingerGun: '声呐',
  asw: '反潜武器', ability: '消耗品', penetration: '弹道穿深', specials: '特色',
  armor: '装甲', projectiles: '弹药', crew: '舰长', modernizations: '升级品',
  aircraftDetails: '飞机参数', abilityDetails: '消耗品参数'
}

export const sourceCategories = {
  iwarship: Object.keys(categoryNames).slice(0, 12),
  gameparams: Object.keys(categoryNames)
}

export function selectCategories(selection, source) {
  const available = sourceCategories[source]
  if (selection.length === 1 && selection[0] === 'all') return available
  return selection.filter(key => available.includes(key))
}

export function matchesShip(record, queries, names = {}) {
  if (!queries.length) return true
  const translated = names[record.index]
  const values = [record.index, record.name, record.id, typeof translated === 'string' ? translated : translated?.zh]
  return queries.some(query => values.some(value => String(value ?? '').toLowerCase().includes(query.toLowerCase())))
}
