import { test } from 'node:test'
import assert from 'node:assert/strict'
import { downloadRepositoryFile, requestJSON } from '../lib/sources/github.js'

const originalFetch = globalThis.fetch

/** 临时替换全局 fetch，模拟直连与 blob 接口的不同响应。 */
async function withFetch(handler, action) {
  globalThis.fetch = handler
  try {
    return await action()
  } finally {
    globalThis.fetch = originalFetch
  }
}

test('requestJSON 成功时返回解析后的 JSON', async () => {
  const result = await withFetch(
    async () => ({ ok: true, json: async () => ({ sha: 'abc' }) }),
    () => requestJSON('https://api.github.com/x')
  )
  assert.equal(result.sha, 'abc')
})

test('requestJSON 在非 2xx 时抛出带地址的错误', async () => {
  await assert.rejects(
    withFetch(async () => ({ ok: false, status: 404 }), () => requestJSON('https://api.github.com/x')),
    /HTTP 404/
  )
})

test('直连原始地址可用时不走 blob 接口', async () => {
  const requested = []
  const bytes = await withFetch(
    async (url) => {
      requested.push(url)
      return { ok: true, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer }
    },
    () => downloadRepositoryFile({
      api: 'https://api.github.com/repos/x',
      metadata: { sha: 'sha1' },
      url: 'https://raw.githubusercontent.com/x/main/a.bin'
    })
  )
  assert.deepEqual([...bytes], [1, 2, 3])
  assert.deepEqual(requested, ['https://raw.githubusercontent.com/x/main/a.bin'])
})

test('直连原始地址失败时改用 blob 接口取回内容', async () => {
  const requested = []
  const bytes = await withFetch(
    async (url) => {
      requested.push(url)
      if (url.startsWith('https://raw.')) throw new TypeError('fetch failed')
      return { ok: true, json: async () => ({ content: Buffer.from('hi').toString('base64') }) }
    },
    () => downloadRepositoryFile({
      api: 'https://api.github.com/repos/x',
      metadata: { sha: 'sha1' },
      url: 'https://raw.githubusercontent.com/x/main/a.bin'
    })
  )
  assert.equal(bytes.toString(), 'hi')
  assert.deepEqual(requested, [
    'https://raw.githubusercontent.com/x/main/a.bin',
    'https://api.github.com/repos/x/git/blobs/sha1'
  ])
})
