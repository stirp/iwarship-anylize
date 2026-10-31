/** Toolkit GLB 对局部顶点翻转 Z，但挂载矩阵与装甲 sidecar 一致。 */
export function prepareToolkitAppearance(gltf) {
  const meshes = [], excluded = []
  const visit = object => {
    const association = gltf.parser.associations.get(object)
    const name = gltf.parser.json.nodes?.[association?.nodes]?.name || object.name
    if (name === 'Armor' || name.startsWith('Armor_')) {
      excluded.push(object)
      return
    }
    if (object.isMesh) {
      // 仅翻转网格局部坐标，不能翻转父组或炮塔挂载位置。
      object.scale.z *= -1
      object.updateMatrix()
      meshes.push(object)
    }
    for (const child of object.children) visit(child)
  }
  visit(gltf.scene)
  for (const object of excluded) object.visible = false
  if (!meshes.length) throw new Error('原始场景没有外观网格')
  return { meshes, excluded }
}
