import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildSync } from 'esbuild'
import { shipIdPattern, MAX_MODEL_BYTES } from '../web/armor-format.js'
import { createModelCache } from './model-cache.js'
import { createToolkitExporter, readToolkitArmor } from './toolkit-exporter.js'
import { packToolkitAppearance } from './toolkit-appearance.js'

const project = fileURLToPath(new URL('../', import.meta.url))
let bundle

/** 按舰船打包参数及模型，由普通脚本加载，直接双击 HTML 即可查看。 */
export async function generateArmorViewer(tables, directory, metadata, options) {
  if (!options.generateHTML || options['no-3d']) return null
  const ships = {}
  for (const [category, rows] of Object.entries(tables)) {
    if (['projectiles', 'crew', 'modernizations'].includes(category)) continue
    for (const row of rows) {
      const id = row['编号']
      if (shipIdPattern.test(id) && !ships[id]) ships[id] = { name: row['名字'] || row['名称'] || id }
    }
  }
  if (!Object.keys(ships).length) return null
  const target = join(directory, 'armor')
  mkdirSync(join(target, 'ships'), { recursive: true })
  const manual = options['model-mode'] === 'manual'
  const exportToolkit = options['game-dir'] ? await createToolkitExporter(options, options.toolkitRuntime) : null
  const getModel = createModelCache({ root: options.outputRoot || directory, fetchModel: options.fetchModel })
  const modelFailures = []
  let embeddedModels = 0
  const grouped = new Map()
  for (const row of tables.armor || []) {
    const id = row['编号']
    if (!grouped.has(id)) grouped.set(id, [])
    grouped.get(id).push({ component: row['配置'], part: row['部件'] || row['配置'], layer: row['层'],
      material: row['材质编号'], thickness: row['厚度(mm)'] })
  }
  const shipEntries = Object.entries(ships)
  for (const [position, [id, ship]] of shipEntries.entries()) {
    const payload = { id, parameters: grouped.get(id) || [], modelBase64: null, modelInfo: null }
    if (!manual) {
      try {
        let modelPath
        let modelBytes
        if (exportToolkit) {
          console.log(`本地模型进度：${position + 1}/${shipEntries.length}`)
          const exported = await exportToolkit(id, join(target, 'toolkit'))
          modelPath = exported.path
          payload.modelInfo = exported.info
        } else if (options['models-dir']) {
          const sourceDir = resolve(options['models-dir'])
          const extension = ['armor.json', 'glb', 'zst'].find(ext => existsSync(join(sourceDir, `${id}.${ext}`)))
          if (!extension) throw new Error(`本地模型缺失：${id}.armor.json / ${id}.glb / ${id}.zst`)
          modelPath = join(sourceDir, `${id}.${extension}`)
          payload.modelInfo = { source: `本地模型：${id}.${extension}` }
          if (extension === 'armor.json') modelBytes = readToolkitArmor(modelPath, id)
        } else {
          console.log(`准备离线模型：${id}`)
          const cached = await getModel(id)
          modelPath = cached.target
          payload.modelInfo = cached.info
        }
        if (statSync(modelPath).size > MAX_MODEL_BYTES) throw new Error('模型文件超过 100 MiB 限制')
        payload.modelBase64 = Buffer.from(modelBytes || readFileSync(modelPath)).toString('base64')
        try { packToolkitAppearance(payload, modelPath) }
        catch (error) { payload.appearanceError = error.message }
        embeddedModels++
      } catch (error) {
        payload.modelError = error.message
        modelFailures.push({ id, error: error.message, ...(error.toolkitLog ? { log: error.toolkitLog } : {}) })
        console.warn(`${id} 未打包模型：${error.message}；页面仍可手动打开本地模型`)
      }
    }
    ship.embedded = Boolean(payload.modelBase64)
    const packed = JSON.stringify(payload).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')
    writeFileSync(join(target, 'ships', `${id}.js`), `globalThis.__wowsArmorReceive(document.currentScript.dataset.request,${packed});\n`)
  }
  if (exportToolkit) console.log(`本地模型导出完成：成功 ${embeddedModels}，失败 ${modelFailures.length}`)
  writeArmorViewerAssets(target, { source: metadata.source, gameVersion: metadata.gameVersion, region: metadata.region, ships })
  return { path: 'armor/index.html', ships: Object.keys(ships).length, modelSource: manual ? 'manual' : exportToolkit ? 'embedded-game' : options['models-dir'] ? 'embedded-local' : 'embedded-public',
    embeddedModels, modelFailures,
    links: Object.fromEntries(Object.keys(ships).map(id => [id, `armor/index.html?ship=${id}`])) }
}

export function writeArmorViewerAssets(target, viewerConfig) {
  if (!bundle) {
    bundle = buildSync({ entryPoints: [join(project, 'web/armor-viewer.js')], bundle: true, minify: true,
      format: 'iife', target: ['chrome120', 'firefox122', 'safari17.4'], write: false, legalComments: 'inline', logLevel: 'silent' }).outputFiles[0].contents
  }
  const config = JSON.stringify(viewerConfig).replace(/</g, '\\u003c')
  const template = readFileSync(join(project, 'web/armor-viewer.html'), 'utf8')
  writeFileSync(join(target, 'index.html'), template.replace('__VIEWER_CONFIG__', () => config))
  writeFileSync(join(target, 'viewer.js'), bundle)
  copyFileSync(join(project, 'web/armor-viewer.css'), join(target, 'viewer.css'))
  writeFileSync(join(target, 'THIRD_PARTY_LICENSES.txt'), ['three', 'fzstd'].map(name =>
    `${name}\n${readFileSync(join(project, 'node_modules', name, 'LICENSE'), 'utf8')}`).join('\n\n'))
}
