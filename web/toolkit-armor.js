const encoder = new TextEncoder()
export const TOOLKIT_ARMOR_SCHEMA = 'wowsunpack-interactive-armor/v1'

const validVector = (value, length) => Array.isArray(value) && value.length === length && value.every(Number.isFinite)
const validInteger = (value, maximum) => Number.isInteger(value) && value >= 0 && value <= maximum

/** 将 Toolkit 的逐三角面数据转为自包含 GLB；同一网格内按材质、几何层和厚度分组。 */
export function convertToolkitArmor(payload, shipId, maxBytes = 100 * 1024 * 1024) {
  if (payload?.schema !== TOOLKIT_ARMOR_SCHEMA) throw new Error('不是支持的 Toolkit 装甲 JSON，请使用 --armor-json 导出的原始文件')
  if (payload.axis_forward !== '-Z' || payload.axis_up !== 'Y') throw new Error('Toolkit 装甲坐标系必须为 -Z 向前、Y 向上')
  if (!Array.isArray(payload.meshes) || !payload.meshes.length) throw new Error('Toolkit 文件没有装甲网格')
  if (!/^P[A-Z]S[A-Z]\d{3}$/.test(shipId)) throw new Error('转换 Toolkit 装甲需要有效舰船编号')
  const root = { asset: { version: '2.0', generator: 'iwarship-anylize Toolkit armor adapter' },
    scene: 0, scenes: [{ nodes: [] }], nodes: [], meshes: [], accessors: [], bufferViews: [], buffers: [{ byteLength: 0 }] }
  const armor = { schema: 'wows-armor-export/1', ship: { key: shipId },
    origin: { format: TOOLKIT_ARMOR_SCHEMA, identity: 'selected-ship', components: 'unavailable' }, plates: [], totals: { plates: 0, triangles: 0 } }
  const chunks = []
  let byteLength = 0
  const addAttribute = (values, bounds = {}) => {
    const bytes = new Uint8Array(values.length * 4)
    const view = new DataView(bytes.buffer)
    values.forEach((value, index) => view.setFloat32(index * 4, value, true))
    const bufferView = root.bufferViews.length
    root.bufferViews.push({ buffer: 0, byteOffset: byteLength, byteLength: bytes.length, target: 34962 })
    const accessor = root.accessors.length
    root.accessors.push({ bufferView, componentType: 5126, count: values.length / 3, type: 'VEC3', ...bounds })
    chunks.push(bytes)
    byteLength += bytes.length
    return accessor
  }
  for (const [meshIndex, mesh] of payload.meshes.entries()) {
    const label = `Toolkit 网格 ${meshIndex}`
    if (!Array.isArray(mesh.positions) || !mesh.positions.every(point => validVector(point, 3) && point.every(value => Math.abs(value) <= 3.402823466e38))) {
      throw new Error(`${label} 顶点坐标无效`)
    }
    if (!Array.isArray(mesh.indices) || mesh.indices.length % 3 || !Array.isArray(mesh.triangle_info) || mesh.triangle_info.length !== mesh.indices.length / 3) {
      throw new Error(`${label} 的三角面与厚度记录数量不一致`)
    }
    if (mesh.transform != null && (!validVector(mesh.transform, 16) || mesh.transform[3] !== 0 || mesh.transform[7] !== 0 || mesh.transform[11] !== 0 || mesh.transform[15] !== 1)) {
      throw new Error(`${label} 的变换矩阵无效`)
    }
    if (byteLength + mesh.indices.length * 24 > maxBytes) throw new Error('Toolkit 装甲转换后超过模型大小限制')
    const groups = new Map()
    for (const [triangle, info] of mesh.triangle_info.entries()) {
      if (!info || !validInteger(info.material_id, 255) || !validInteger(info.model_index, 65535) ||
          !Number.isFinite(info.thickness_mm) || info.thickness_mm < 0 || typeof info.hidden !== 'boolean' ||
          typeof info.material_name !== 'string' || typeof info.zone !== 'string') {
        throw new Error(`${label} 第 ${triangle} 个面的装甲属性无效`)
      }
      // thickness_mm 是此三角面的几何层厚度；layers 仅为相关层列表，不能求和代替当前厚度。
      const key = JSON.stringify([info.material_id, info.model_index, info.thickness_mm, info.material_name, info.zone, info.hidden])
      if (!groups.has(key)) groups.set(key, { info, positions: [], min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] })
      const group = groups.get(key)
      for (let vertex = 0; vertex < 3; vertex++) {
        const index = mesh.indices[triangle * 3 + vertex]
        if (!validInteger(index, mesh.positions.length - 1)) throw new Error(`${label} 第 ${triangle} 个面的顶点索引越界`)
        const point = mesh.positions[index].map(Math.fround)
        group.positions.push(...point)
        point.forEach((value, axis) => { group.min[axis] = Math.min(group.min[axis], value); group.max[axis] = Math.max(group.max[axis], value) })
      }
    }
    const primitives = []
    for (const { info, positions, min, max } of groups.values()) {
      // 每个面的法线独立计算，避免共享顶点平滑掉装甲折角，也保证标准材质可正确受光。
      const normals = new Float32Array(positions.length)
      for (let offset = 0; offset < positions.length; offset += 9) {
        const ab = [0, 1, 2].map(axis => positions[offset + 3 + axis] - positions[offset + axis])
        const ac = [0, 1, 2].map(axis => positions[offset + 6 + axis] - positions[offset + axis])
        const normal = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]]
        const length = Math.hypot(...normal) || 1
        for (let vertex = 0; vertex < 3; vertex++) normal.forEach((value, axis) => { normals[offset + vertex * 3 + axis] = value / length })
      }
      const accessor = addAttribute(positions, { min, max })
      const normalAccessor = addAttribute(normals)
      const mount = typeof mesh.name === 'string' ? mesh.name.match(/\[(HP_[^\]]+)\]$/)?.[1] : undefined
      const plate = { source: mesh.transform != null || mount ? 'mount' : 'hull', source_mesh: mesh.name || `Mesh ${meshIndex}`,
        material: info.material_id, material_name: info.material_name, layer: info.model_index, thickness_mm: info.thickness_mm,
        zone: info.zone === 'Default' ? 'Other' : info.zone, hidden_in_viewer: info.hidden, triangles: positions.length / 9 }
      if (mount) plate.mount = { hp: mount }
      primitives.push({ attributes: { POSITION: accessor, NORMAL: normalAccessor }, mode: 4, extras: { plate_index: armor.plates.length } })
      armor.plates.push(plate)
      armor.totals.triangles += plate.triangles
    }
    if (primitives.length) {
      const node = { mesh: root.meshes.length, name: mesh.name || `Mesh ${meshIndex}` }
      if (mesh.transform != null) node.matrix = [...mesh.transform]
      root.scenes[0].nodes.push(root.nodes.length)
      root.nodes.push(node)
      root.meshes.push({ primitives })
    }
  }
  if (!armor.plates.length) throw new Error('Toolkit 文件没有可显示的装甲三角面')
  armor.totals.plates = armor.plates.length
  root.extras = { wows_armor: armor }
  root.buffers[0].byteLength = byteLength
  const json = encoder.encode(JSON.stringify(root))
  const jsonLength = Math.ceil(json.length / 4) * 4
  const total = 12 + 8 + jsonLength + 8 + byteLength
  if (total > maxBytes) throw new Error('Toolkit 装甲转换后超过模型大小限制')
  const bytes = new Uint8Array(total)
  const view = new DataView(bytes.buffer)
  view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, total, true)
  view.setUint32(12, jsonLength, true); view.setUint32(16, 0x4e4f534a, true)
  bytes.fill(0x20, 20, 20 + jsonLength); bytes.set(json, 20)
  view.setUint32(20 + jsonLength, byteLength, true); view.setUint32(24 + jsonLength, 0x004e4942, true)
  let offset = 28 + jsonLength
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
  return bytes
}
