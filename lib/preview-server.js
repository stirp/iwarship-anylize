import { createServer } from 'node:http'
import { createReadStream } from 'node:fs'
import { mkdir, readFile, realpath, stat, readdir } from 'node:fs/promises'
import { resolve, join, extname, relative, sep, isAbsolute } from 'node:path'
import { shipIdPattern } from '../web/armor-format.js'
import { createModelCache, defaultModelBase } from './model-cache.js'

const contentTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.glb': 'model/gltf-binary', '.zst': 'application/octet-stream', '.txt': 'text/plain; charset=utf-8', '.png': 'image/png' }
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])
const within = (root, path) => { const child = relative(root, path); return child === '' || (!child.startsWith(`..${sep}`) && child !== '..' && !isAbsolute(child)) }

/** 本地静态预览与固定模型来源缓存，不接受客户端提供任意转发地址。 */
export async function createPreviewServer({ root, modelBase = defaultModelBase, fetchModel = fetch } = {}) {
  await mkdir(root, { recursive: true })
  root = await realpath(root)
  const cachedModel = createModelCache({ root, modelBase, fetchModel })

  async function gallery() {
    const entries = []
    async function visit(directory, depth = 0) {
      if (depth > 6 || entries.length >= 1000) return
      const children = await readdir(directory, { withFileTypes: true })
      if (children.some(child => child.name === 'manifest.json' && child.isFile())) {
        try {
          const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'))
          entries.push({ manifest, path: relative(root, directory).split(sep).map(encodeURIComponent).join('/') })
        } catch { /* 忽略损坏或未完成的清单。 */ }
        return
      }
      for (const child of children) if (child.isDirectory() && !child.name.startsWith('.')) await visit(join(directory, child.name), depth + 1)
    }
    await visit(root)
    entries.sort((a, b) => String(b.manifest.generatedAt).localeCompare(String(a.manifest.generatedAt)))
    return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>战舰世界 · 生成结果</title><style>body{font:15px system-ui;background:#101b26;color:#e5eef5;max-width:1000px;margin:50px auto;padding:0 20px}h1{font-size:26px}p{color:#9cb1bf}article{padding:20px 0;border-bottom:1px solid #2c424f}a{color:#6de0cf;margin-right:20px;line-height:2}small{color:#9cb1bf}</style><h1>战舰世界 · 生成结果</h1><p>选择一个批次查看表格或三维装甲。新版查看器已包含本地数据包，也可以直接双击 HTML 打开。</p>${entries.length ? entries.map(({ manifest: m, path }) => `<article><strong>${escape(m.source)} · ${escape(m.gameVersion)} · ${escape(m.region)}</strong><p><small>${escape(m.generatedAt)}</small></p>${m.formats?.html ? `<a href="/${path}/index.html">打开数据表</a>` : ''}${m.viewer ? `<a href="/${path}/armor/index.html">3D 装甲查看器 ↗</a>` : ''}<a href="/${path}/manifest.json">生成清单</a></article>`).join('') : '<p>尚无生成结果，请先运行 npm run fetch。</p>'}</html>`
  }

  async function sendFile(path, request, response) {
    const info = await stat(path)
    if (!info.isFile()) throw Object.assign(new Error('文件不存在'), { status: 404 })
    response.writeHead(200, { 'Content-Type': contentTypes[extname(path)] || 'application/octet-stream', 'Content-Length': info.size,
      'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' })
    if (request.method === 'HEAD') response.end()
    else createReadStream(path).on('error', () => response.destroy()).pipe(response)
  }

  return createServer(async (request, response) => {
    try {
      if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405, { Allow: 'GET, HEAD' }); response.end(); return }
      // 不向其他网站开放模型代理；同源页面和命令行请求均可使用。
      if (request.headers['sec-fetch-site'] === 'cross-site') throw Object.assign(new Error('仅接受本地预览页面请求'), { status: 403 })
      const host = request.headers.host?.split(':')[0]
      if (!['localhost', '127.0.0.1'].includes(host)) throw Object.assign(new Error('无效的本地访问地址'), { status: 403 })
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
      const model = pathname.match(/^\/__models\/([^/]+)\.(zst|json)$/)
      if (model) {
        if (!shipIdPattern.test(model[1])) throw Object.assign(new Error('无效舰船编号'), { status: 400 })
        const { target, info } = await cachedModel(model[1])
        if (model[2] === 'json') {
          response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' }); response.end(request.method === 'HEAD' ? '' : JSON.stringify(info))
        } else await sendFile(target, request, response)
        return
      }
      if (pathname === '/') {
        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        response.end(request.method === 'HEAD' ? '' : await gallery())
        return
      }
      if (pathname.split('/').some(segment => segment.startsWith('.'))) throw Object.assign(new Error('路径不可访问'), { status: 403 })
      const candidate = resolve(root, `.${pathname}`)
      const file = await realpath(candidate.endsWith(sep) || pathname.endsWith('/') ? join(candidate, 'index.html') : candidate)
      if (!within(root, file)) throw Object.assign(new Error('路径不可访问'), { status: 403 })
      await sendFile(file, request, response)
    } catch (error) {
      if (response.headersSent) { response.destroy(); return }
      const code = error.status || (error.code === 'ENOENT' || error.code === 'ENOTDIR' ? 404 : error instanceof URIError ? 400 : 502)
      response.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8' })
      response.end(error.message)
    }
  })
}
