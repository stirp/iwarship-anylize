/** 材质编号依据客户端碰撞材质表，核对 wows-toolkit v1.0.2 armor_materials.rs。
 * 仅汇总部位明确的材质；跨区域 Dual 材质留在明细，避免误当外板。
 */
const sections = {
  舰艏外板: [48, 49, 71, 123, 124, 202, 203],
  舰艉外板: [72, 93, 94, 127, 128, 204, 205],
  中段甲板: [57, 87, 103, 116, 120, 158, 199, 201, 235, 236],
  上层建筑: [89, 90, 131, 132, 206, 207],
  侧舷装甲: [4, 16, 31, 56, 61, 67, 69, 70, 77, 85, 86, 104, 111, 115, 119, 197, 198, 200, 212, 213],
  核心区侧壁: [61, 67, 111, 197],
  核心区甲板: [64, 112, 194],
  核心区横隔壁: [59, 65, 113, 196],
  核心区倾斜装甲: [66, 114, 195],
  主炮塔正面: [34, 100],
  主炮塔顶部: [33, ...Array.from({ length: 20 }, (_, i) => 214 + i)],
  主炮座: [97, 98, ...Array.from({ length: 20 }, (_, i) => 134 + i)],
  防雷凸舱: [101]
}
export const armorSections = Object.keys(sections)
const byMaterial = new Map()
for (const [name, ids] of Object.entries(sections)) {
  for (const id of ids) byMaterial.set(id, [...(byMaterial.get(id) || []), name])
}

/** 同一舰船所有配置一行。厚度为参数范围，不能推断网格面积、外露程度或实际等效防护。 */
export function summarizeArmor(details) {
  const ships = new Map()
  for (const detail of details) {
    const id = detail['编号']
    if (!ships.has(id)) {
      const row = Object.fromEntries(['名字', '编号', '等级', '舰种', '国家', '类型', '英文名字', '中文名字']
        .filter(key => key in detail).map(key => [key, detail[key]]))
      for (const section of armorSections) {
        row[`${section}最薄(mm)`] = null
        row[`${section}最厚(mm)`] = null
      }
      ships.set(id, { row, configs: new Set(), unclassified: 0 })
    }
    const ship = ships.get(id)
    if (detail['配置']) ship.configs.add(detail['配置'])
    const value = detail['厚度(mm)']
    if (!Number.isFinite(value) || value <= 0) continue
    const matches = byMaterial.get(detail['材质编号']) || []
    // 主炮座及部分主炮顶部参数位于舰体中；副炮部件不能混入主炮统计。
    const mainGun = /_Artillery(?:_|$)/.test(detail['配置'] || '')
    const hull = /_Hull(?:_|$)/.test(detail['配置'] || '')
    const applicable = matches.filter(section => section.startsWith('主炮') ? mainGun || hull : hull)
    if (!applicable.length) {
      ship.unclassified++
      continue
    }
    for (const section of applicable) {
      const min = `${section}最薄(mm)`, max = `${section}最厚(mm)`
      ship.row[min] = Math.min(ship.row[min] ?? value, value)
      ship.row[max] = Math.max(ship.row[max] ?? value, value)
    }
  }
  return [...ships.values()].map(({ row, configs, unclassified }) => ({ ...row,
    配置范围: [...configs].sort().join('、'), 未归类有效参数数: unclassified }))
}
