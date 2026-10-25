import { parseArgs } from 'node:util'
import { createInterface } from 'node:readline/promises'
import { statSync } from 'node:fs'
import { categoryNames, sourceCategories, selectCategories } from './categories.js'

export const help = `战舰世界数据生成工具

用法：node fetch-data.js [选项]
无参数且在终端运行时进入交互选择；脚本环境默认 iwarship / ASIA。

  --source <来源>       iwarship、gameparams 或 all（支持逗号分隔）
  --regions <区域>      ASIA、EU 等，逗号分隔；all 为该来源全部区域
                       GameParams 的默认参数组用 DEFAULT 表示
  --categories <类别>   中文名或英文键，逗号分隔；默认 all
  --ships <关键字>      舰船编号、内部英文名、中文名（GameParams 需词条）
                       多个关键字用逗号分隔，不填则为全部舰船
  --gameparams <文件>   本地 GameParams.data 或单区域/全量原始 JSON
  --game-version <版本> 本地 GameParams 的版本标签（本地输入必填）
  --translations <文件> 本地 lang.json 或 zh_sg 词条字典；省略自动下载并缓存
  --ref <Git引用>       公开 wowsinfo/data 的提交、标签或分支，默认 master
                       未指定本地文件时自动下载并缓存 GameParams.data
  --python <程序>       Python 3.10+ 可执行文件；省略时自动检测
                       Windows 尝试 py -3、python、python3；其他系统尝试 python3、python
  --models-dir <目录>   打包本地 <舰船编号>.armor.json、.glb 或 .zst
  --game-dir <目录>     从本地游戏目录导出装甲（与 --models-dir 二选一）
  --wowsunpack <程序>   带 --armor-json 的兼容导出器，默认从 PATH 使用 wowsunpack_armor
  --model-hull <配置>   本地游戏导出的舰体配置，如 A / B；省略使用导出器默认配置
  --model-mode <模式>   embedded（默认）：生成时下载/打包模型，双击 HTML 查看
                       manual：只打包参数，查看时手动选择本地模型
  --no-3d              不生成独立 3D 查看器（--no-html 也会关闭）
  -o, --output <目录>   输出根目录，默认项目下 output
  --interactive        交互选择范围
  --no-html            不生成网页
  --no-markdown        不生成 Markdown
  -v, --verbose        同时保存所选范围的原始数据（JSONL）
  -h, --help           显示帮助

类别：${Object.entries(categoryNames).map(([key, name]) => `${key}=${name}`).join('，')}
GameParams 不生成派生的“弹道穿深”；iwarship 不提供装甲、弹药、舰长、升级品类别。
`

const list = value => [...new Set(value.split(/[,，]/).map(part => part.trim()).filter(Boolean))]

export function parseOptions(args = process.argv.slice(2)) {
  const { values } = parseArgs({ args, options: {
    source: { type: 'string', default: 'iwarship' }, regions: { type: 'string', default: 'ASIA' },
    categories: { type: 'string', default: 'all' }, ships: { type: 'string', default: '' },
    gameparams: { type: 'string' }, translations: { type: 'string' }, 'game-version': { type: 'string' }, ref: { type: 'string', default: 'master' },
    python: { type: 'string' }, output: { type: 'string', short: 'o', default: 'output' },
    'models-dir': { type: 'string' }, 'no-3d': { type: 'boolean' },
    'game-dir': { type: 'string' }, wowsunpack: { type: 'string' }, 'model-hull': { type: 'string' },
    'model-mode': { type: 'string', default: 'embedded' },
    interactive: { type: 'boolean' }, 'no-html': { type: 'boolean' }, 'no-markdown': { type: 'boolean' },
    verbose: { type: 'boolean', short: 'v' }, help: { type: 'boolean', short: 'h' }
  } })
  return { ...values, interactive: values.interactive || (!args.length && Boolean(process.stdin.isTTY)) }
}

export function validateOptions(values) {
  const sources = values.source === 'all' ? Object.keys(sourceCategories) : list(values.source.toLowerCase())
  if (!sources.length || sources.some(source => !sourceCategories[source])) throw new Error('无效数据源')
  const regions = list(values.regions.toUpperCase())
  if (!regions.length || regions.some(region => !/^[A-Z0-9_]+$/.test(region))) throw new Error('无效区域')
  if (regions.includes('ALL') && regions.length !== 1) throw new Error('all 不能与具体区域同时指定')
  const categories = list(values.categories).map(value => Object.keys(categoryNames).find(key => categoryNames[key] === value) || value)
  if (!categories.length || categories.some(key => key !== 'all' && !categoryNames[key])) throw new Error('无效数据类别，请运行 --help')
  if (categories.includes('all') && categories.length !== 1) throw new Error('all 不能与具体类别同时指定')
  for (const source of sources) {
    if (!selectCategories(categories, source).length) throw new Error(`${source} 不支持所选类别`)
  }
  for (const key of categories) {
    if (key !== 'all' && !sources.some(source => sourceCategories[source].includes(key))) throw new Error(`所选来源不支持 ${categoryNames[key]}`)
  }
  if (sources.includes('gameparams') && values.gameparams && !values['game-version']?.trim()) {
    throw new Error('本地 GameParams 文件需提供 --game-version，避免错误标记数据版本')
  }
  if (values['models-dir'] && !statSync(values['models-dir']).isDirectory()) throw new Error('--models-dir 必须是目录')
  if (values['game-dir']) {
    if (!statSync(values['game-dir']).isDirectory()) throw new Error('--game-dir 必须是目录')
    if (values['models-dir']) throw new Error('--game-dir 与 --models-dir 不能同时使用')
    if (values['no-html'] || values['no-3d']) throw new Error('本地游戏模型导出需要生成 3D 查看器')
  } else if (values.wowsunpack || values['model-hull']) throw new Error('--wowsunpack 和 --model-hull 需要 --game-dir')
  if (!['embedded', 'manual'].includes(values['model-mode'])) throw new Error('--model-mode 仅支持 embedded 或 manual')
  if (values['model-mode'] === 'manual' && (values['models-dir'] || values['game-dir'])) throw new Error('manual 模式无需本地模型目录或游戏目录，请选择 embedded 打包模型')
  return { ...values, sources, regions, categories, ships: list(values.ships),
    generateHTML: !values['no-html'], generateMarkdown: !values['no-markdown'] }
}

export async function promptOptions(values) {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const ask = async (label, current = '') => (await rl.question(`${label} [${current || '不限'}]: `)).trim() || current
  try {
    values.source = await ask('数据源 iwarship / gameparams / all', values.source)
    if (values.source.includes('gameparams') || values.source === 'all') {
      values.gameparams = await ask('本地 GameParams 路径（留空下载公开数据）', values.gameparams)
      if (values.gameparams) values['game-version'] = await ask('本地文件的游戏版本', values['game-version'])
      else values.ref = await ask('公开数据 Git 提交、标签或分支', values.ref)
      values.translations = await ask('本地简体中文词条路径（留空自动下载 zh_sg）', values.translations)
    }
    values.regions = await ask('区域，逗号分隔；all 全部 / DEFAULT 默认参数组', values.regions)
    console.log(Object.values(categoryNames).join('、'))
    values.categories = await ask('类别，逗号分隔', values.categories)
    values.ships = await ask('舰船编号或名称关键字，逗号分隔', values.ships)
    if (!values['no-html'] && !values['no-3d']) {
      values['model-mode'] = await ask('3D 模型：embedded 生成时打包 / manual 查看时手动打开', values['model-mode'])
      if (values['model-mode'] !== 'manual') {
        const source = await ask('模型来源 public 公开下载 / files 已导出文件 / game 本地游戏', values['game-dir'] ? 'game' : values['models-dir'] ? 'files' : 'public')
        if (!['public', 'files', 'game'].includes(source)) throw new Error('无效模型来源')
        if (source === 'files') {
          values['models-dir'] = await ask('已导出模型目录', values['models-dir'])
          if (!values['models-dir']) throw new Error('本地文件来源需要已导出模型目录')
        } else delete values['models-dir']
        if (source === 'game') {
          values['game-dir'] = await ask('游戏安装目录', values['game-dir'])
          values.wowsunpack = await ask('wowsunpack_armor.exe 完整路径', values.wowsunpack)
          values['model-hull'] = await ask('舰体配置（留空使用导出器默认）', values['model-hull'])
          if (!values['game-dir']) throw new Error('本地游戏导出需要游戏安装目录')
        } else {
          delete values['game-dir']; delete values.wowsunpack; delete values['model-hull']
        }
      }
    }
    values.output = await ask('输出根目录', values.output)
    return values
  } finally { rl.close() }
}
