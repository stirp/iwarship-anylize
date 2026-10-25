import { MAX_MODEL_BYTES, shipIdPattern } from './armor-format.js'

/** 普通脚本可由 file:// 加载，使用请求令牌处理切船取消和迟到的数据包。 */
export function createShipDataLoader(document, host) {
  const pending = new Map()
  let sequence = 0
  host.__wowsArmorReceive = (token, data) => {
    const request = pending.get(token)
    if (request) request.complete(data?.id === request.id ? null : new Error('舰船数据包编号不匹配'), data)
  }
  return function loadShipData(id, signal) {
    if (!shipIdPattern.test(id)) return Promise.reject(new Error('无效舰船编号'))
    return new Promise((resolve, reject) => {
      if (signal?.aborted) { reject(signal.reason); return }
      const token = String(++sequence)
      const script = document.createElement('script')
      const complete = (error, data) => {
        pending.delete(token)
        signal?.removeEventListener('abort', abort)
        script.remove()
        script.onerror = script.onload = null
        error ? reject(error) : resolve(data)
      }
      const abort = () => complete(signal.reason)
      pending.set(token, { id, complete })
      script.dataset.request = token
      script.src = `ships/${id}.js`
      script.onerror = () => complete(new Error('无法读取舰船数据包，请保留完整输出目录后重新打开 HTML。'))
      script.onload = () => complete(new Error('舰船数据包未正确加载，请重新生成。'))
      signal?.addEventListener('abort', abort, { once: true })
      document.head.append(script)
    })
  }
}

export function unpackModel(base64) {
  if (typeof base64 !== 'string' || !base64.length) throw new Error('数据包没有内嵌模型，请打开本地 GLB / ZST 文件。')
  if (base64.length > Math.ceil(MAX_MODEL_BYTES / 3) * 4) throw new Error('模型文件超过 100 MiB 限制')
  const binary = atob(base64)
  if (binary.length > MAX_MODEL_BYTES) throw new Error('模型文件超过 100 MiB 限制')
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
  return bytes
}
