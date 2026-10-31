/** 外观网格与挂载矩阵已经配套；仅隐藏与 sidecar 重复的装甲层。 */
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
      // 不能用原始场景内装甲层的方向推断外观方向；保留原生局部变换。
      meshes.push(object)
    }
    for (const child of object.children) visit(child)
  }
  visit(gltf.scene)
  for (const object of excluded) object.visible = false
  if (!meshes.length) throw new Error('原始场景没有外观网格')
  return { meshes, excluded }
}
