import { Decompress } from 'fzstd'

export const MAX_MODEL_BYTES = 100 * 1024 * 1024
const MAX_DECODED_BYTES = 256 * 1024 * 1024
export const shipIdPattern = /^P[A-Z]S[A-Z]\d{3}$/
export const zoneNames = {
  Bow: '舰艏', Stern: '舰艉', Casemate: '上部装甲区', Citadel: '核心区', Hull: '舰体',
  Superstructure: '上层建筑', Turret: '炮塔', Barbette: '炮座',
  TorpedoProtection: '鱼雷防护', SteeringGear: '舵机', Other: '其他'
}
export const zoneColors = {
  Bow: '#66c5cc', Stern: '#b3a4f0', Casemate: '#f3b66f', Citadel: '#e36c78', Hull: '#7b9fae',
  Superstructure: '#a5cf85', Turret: '#eed078', Barbette: '#d394cb', TorpedoProtection: '#6e9ed4', SteeringGear: '#a6bbac'
}
export const defaultBands = [
  [14, '#6ed1b0'], [16, '#95d27f'], [24, '#aac966'], [26, '#c0c150'], [28, '#e2c33e'],
  [33, '#e1ab36'], [75, '#e39031'], [160, '#e67331'], [399, '#dc4e30'], [Infinity, '#b92f30']
]

export function plateZone(plate) {
  return /barbette|gkbar/i.test(plate.material_name || '') ? 'Barbette' : plate.zone || 'Other'
}

export function thicknessColor(thickness) {
  if (!Number.isFinite(thickness) || thickness <= 0) return '#89939b'
  return defaultBands.find(([limit]) => thickness <= limit)[1]
}

/** 验证并解压自包含 GLB；不猜测普通外观模型的装甲厚度。 */
export function decodeModel(input, expectedShip) {
  let bytes = input instanceof Uint8Array ? input : new Uint8Array(input)
  if (bytes.length > MAX_MODEL_BYTES) throw new Error('模型文件超过 100 MiB 限制')
  if (bytes.length < 12) throw new Error('模型文件不完整')
  if (new DataView(bytes.buffer, bytes.byteOffset).getUint32(0, true) === 0xfd2fb528) {
    const chunks = []
    let size = 0
    const decoder = new Decompress(chunk => {
      size += chunk.length
      if (size > MAX_DECODED_BYTES) throw new Error('模型解压后超过 256 MiB 限制')
      chunks.push(chunk)
    })
    try { decoder.push(bytes, true) } catch (error) { throw new Error(`Zstandard 解压失败：${error.message}`) }
    bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
  }
  if (bytes.length < 20) throw new Error('模型不是完整的 GLB 文件')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== bytes.length) {
    throw new Error('仅支持 GLB 2.0 或压缩后的 .zst 模型')
  }
  const length = view.getUint32(12, true)
  if (view.getUint32(16, true) !== 0x4e4f534a || 20 + length > bytes.length) throw new Error('GLB 元数据损坏')
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + length)))
  if ([...(json.images || []), ...(json.buffers || [])].some(resource => resource.uri && !resource.uri.startsWith('data:'))) {
    throw new Error('请使用纹理和网格已内嵌的 GLB，当前文件引用了外部资源')
  }
  const armor = json.extras?.wows_armor
  if (armor && armor.schema !== 'wows-armor-export/1') throw new Error(`暂不支持装甲格式 ${armor.schema}`)
  if (armor && (!Array.isArray(armor.plates) || !armor.ship)) throw new Error('模型的装甲元数据不完整')
  if (armor?.ship.key && expectedShip && !armor.ship.key.startsWith(`${expectedShip}_`) && armor.ship.key !== expectedShip) {
    throw new Error(`模型属于 ${armor.ship.key}，与所选舰船 ${expectedShip} 不一致`)
  }
  const plateMap = new Map()
  if (armor) {
    json.meshes?.forEach((mesh, meshIndex) => mesh.primitives?.forEach((primitive, primitiveIndex) => {
      const index = primitive.extras?.plate_index
      if (Number.isInteger(index) && armor.plates[index]) plateMap.set(`${meshIndex}:${primitiveIndex}`, armor.plates[index])
    }))
    if (!plateMap.size) throw new Error('模型的装甲元数据没有对应到网格，无法可靠显示厚度')
  }
  return { buffer: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), armor, plateMap }
}

/** 仅对相同舰体组件、挂载点、材质和层进行对照，绝不以参数值覆盖模型值。 */
export function comparePlate(plate, armor, parameters) {
  if (!parameters?.length) return { status: 'missing', text: '本批次未包含可对照的装甲参数' }
  const component = plate.source === 'mount' ? plate.mount?.component : armor.ship.hull_component
  const mount = plate.mount?.hp
  if (!component || (plate.source === 'mount' && !mount)) return { status: 'missing', text: '模型未标注完整组件，无法对照' }
  const matches = parameters.filter(row => row.component === component && row.layer === plate.layer && row.material === plate.material &&
    (mount ? row.part.split('/').includes(mount) : row.part === component))
  if (!matches.length) return { status: 'missing', text: `参数中未找到 ${component} 的对应装甲板` }
  const thicknesses = [...new Set(matches.map(row => row.thickness))]
  if (thicknesses.length !== 1) return { status: 'ambiguous', text: '对应参数存在多个厚度，无法唯一对照' }
  const thickness = thicknesses[0]
  return Math.abs(thickness - plate.thickness_mm) < 0.001
    ? { status: 'match', thickness, text: `与本批次参数一致：${thickness} mm` }
    : { status: 'mismatch', thickness, text: `与本批次参数不同：参数为 ${thickness} mm；模型为 ${plate.thickness_mm} mm` }
}

export function plateVisible(plate, filters) {
  return filters.zones.has(plateZone(plate)) && (filters.includeHidden || !plate.hidden_in_viewer) &&
    !filters.hidden.has(plate) && (!Number.isFinite(plate.thickness_mm) ||
      (plate.thickness_mm >= filters.minimum && plate.thickness_mm <= filters.maximum))
}
