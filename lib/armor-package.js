import { readFileSync, writeFileSync, renameSync } from 'node:fs'

const prefix = 'globalThis.__wowsArmorReceive(document.currentScript.dataset.request,'

export function readArmorPackage(path, id) {
  const content = readFileSync(path, 'utf8').trimEnd()
  if (!content.startsWith(prefix) || !content.endsWith(');')) throw new Error(`${id} 数据包格式无效`)
  const payload = JSON.parse(content.slice(prefix.length, -2))
  if (payload.id !== id) throw new Error(`${id} 数据包编号不一致`)
  return payload
}

/** 先写完整临时文件，避免写入中断破坏原入口使用的数据包。 */
export function writeArmorPackage(path, payload) {
  const packed = JSON.stringify(payload).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')
  writeFileSync(`${path}.tmp`, `${prefix}${packed});\n`)
  renameSync(`${path}.tmp`, path)
}
