/** GitHub API 请求；错误信息带上地址，便于判断是限流还是网络不通。 */
export async function requestJSON(url, { timeout = 60000 } = {}) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'iwarship-anylize', Accept: 'application/vnd.github+json' },
    signal: AbortSignal.timeout(timeout)
  })
  if (!response.ok) throw new Error(`下载失败 HTTP ${response.status}: ${url}`)
  return response.json()
}

/**
 * 下载仓库里的文件。直连原始地址失败时改用 GitHub blob 接口：
 * raw.githubusercontent.com 在部分网络下会被重置，api.github.com 通常仍可访问。
 */
export async function downloadRepositoryFile({ api, metadata, url, timeout = 20000 }) {
  try {
    if (!url) throw new Error('缺少下载地址')
    const response = await fetch(url, { signal: AbortSignal.timeout(timeout) })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return Buffer.from(await response.arrayBuffer())
  } catch {
    const blob = await requestJSON(`${api}/git/blobs/${metadata.sha}`, { timeout })
    return Buffer.from(blob.content, 'base64')
  }
}
