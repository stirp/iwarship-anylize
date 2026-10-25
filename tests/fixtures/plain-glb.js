/** 无装甲厚度元数据的最小三角形 GLB，用于验证官方导出路径。 */
export function plainGLB() {
  const json = { asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    buffers: [{ byteLength: 36 }], bufferViews: [{ buffer: 0, byteLength: 36 }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [-1, 0, 0], max: [1, 1, 0] }] }
  const encoded = Buffer.from(JSON.stringify(json))
  const length = Math.ceil(encoded.length / 4) * 4
  const bytes = Buffer.alloc(28 + length + 36)
  bytes.writeUInt32LE(0x46546c67, 0)
  bytes.writeUInt32LE(2, 4)
  bytes.writeUInt32LE(bytes.length, 8)
  bytes.writeUInt32LE(length, 12)
  bytes.writeUInt32LE(0x4e4f534a, 16)
  bytes.fill(0x20, 20, 20 + length)
  encoded.copy(bytes, 20)
  bytes.writeUInt32LE(36, 20 + length)
  bytes.writeUInt32LE(0x004e4942, 24 + length)
  Buffer.from(new Float32Array([-1, 0, 0, 1, 0, 0, 0, 1, 0]).buffer).copy(bytes, 28 + length)
  return bytes
}
