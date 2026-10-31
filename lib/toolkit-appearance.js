import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { decodeModel, MAX_MODEL_BYTES } from '../web/armor-format.js'

/** 只复用同次导出的场景；旧缓存可通过保留的日志找到原始输出。 */
export function packToolkitAppearance(payload, modelPath) {
  if (!payload.modelBase64) return false
  const armorBytes = Buffer.from(payload.modelBase64, 'base64')
  if (decodeModel(armorBytes, payload.id).armor?.origin?.format !== 'wowsunpack-interactive-armor/v1') return false
  const candidates = []
  if (modelPath) candidates.push(join(dirname(modelPath), 'toolkit-scene.glb'))
  const log = payload.modelInfo?.log
  if (log && existsSync(log)) {
    candidates.push(join(dirname(log), 'toolkit-scene.glb'))
    const source = readFileSync(log, 'utf8').match(/^Exported to (.+toolkit-scene\.glb) \(\d+ bytes\)\r?$/m)?.[1]
    if (source) candidates.push(source)
  }
  for (const path of new Set(candidates)) {
    if (!existsSync(path)) continue
    // 同编号也可能有不同舰体或版本，必须与同目录的装甲文件逐字节一致。
    const armorPath = join(dirname(path), `${payload.id}.glb`)
    if (!existsSync(armorPath) || statSync(armorPath).size !== armorBytes.length || !readFileSync(armorPath).equals(armorBytes)) continue
    if (statSync(path).size > MAX_MODEL_BYTES) throw new Error('外观模型超过 100 MiB 限制')
    const bytes = readFileSync(path)
    decodeModel(bytes, payload.id)
    payload.appearanceBase64 = bytes.toString('base64')
    payload.appearanceFormat = 'toolkit-scene/v1'
    return true
  }
  return false
}
