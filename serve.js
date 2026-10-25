#!/usr/bin/env node
import { parseArgs } from 'node:util'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createPreviewServer } from './lib/preview-server.js'

const { values } = parseArgs({ options: { root: { type: 'string', default: 'output' }, port: { type: 'string', default: '8080' },
  'model-base': { type: 'string' }, help: { type: 'boolean', short: 'h' } } })
if (values.help) console.log('用法：npm run serve -- [--root output] [--port 8080] [--model-base https://example.com/models/]\n仅监听 127.0.0.1；模型按需缓存在输出目录 .cache/models/。')
else {
  const port = Number(values.port)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('端口需在 1 至 65535 之间')
  const root = resolve(dirname(fileURLToPath(import.meta.url)), values.root)
  const server = await createPreviewServer({ root, modelBase: values['model-base'] })
  server.on('error', error => { console.error(`预览服务启动失败：${error.message}`); process.exitCode = 1 })
  server.listen(port, '127.0.0.1', () => console.log(`预览地址：http://127.0.0.1:${port}\n输出目录：${root}`))
}
