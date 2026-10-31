#!/usr/bin/env node
/** 运行时选择来源和范围，按来源、版本、区域覆盖生成。 */
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve, join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { help, parseOptions, promptOptions, validateOptions } from './lib/options.js'
import { categoryNames, selectCategories, matchesShip } from './lib/categories.js'
import { fetchIndexData, fetchFullData } from './lib/index-fetcher.js'
import { setPresets, transformData, loadMapping, getChineseName } from './lib/csv-writer.js'
import { prepareGameParams, readGameParams } from './lib/sources/gameparams.js'
import { buildGameParamsRows } from './lib/gameparams-tables.js'
import { prepareTranslations } from './lib/sources/translations.js'
import { createOutputDirectory, writeOutput } from './lib/output.js'
import { resolvePython } from './lib/python.js'

const projectDir = dirname(fileURLToPath(import.meta.url))

async function generateIwarship(options, root, categories) {
  const firstRegion = options.regions[0] === 'ALL' ? 'ASIA' : options.regions[0]
  const index = await fetchIndexData(firstRegion)
  const regions = options.regions[0] === 'ALL' ? Object.keys(index.serverVersion) : options.regions
  // 在开始生成前校验全部区域，不把未知区域静默替换为 ASIA。
  for (const region of regions) {
    if (!Number.isInteger(index.serverVersion[region]?.versionId)) throw new Error(`iwarship 不支持区域 ${region}`)
  }
  setPresets(index.shipName, index.i18n)
  for (const region of regions) {
    const version = index.serverVersion[region]
    const gameVersion = version.gameVersion || `version-${version.versionId}`
    const fullData = await fetchFullData(version.versionId)
    const tables = {}
    const directory = createOutputDirectory(root, 'iwarship', gameVersion, region)
    if (options.verbose) writeFileSync(join(directory, 'raw.jsonl'), '')
    for (const category of categories) {
      const records = (fullData[category] || []).filter(record => matchesShip(record, options.ships, index.shipName))
      tables[category] = transformData(records, loadMapping(categoryNames[category])).map((row, position) => ({
        ...row, 编号: records[position].index || records[position].name,
        英文名字: records[position].name || records[position].index,
        中文名字: getChineseName(records[position].index)
      }))
      if (options.verbose) {
        for (const record of records) appendFileSync(join(directory, 'raw.jsonl'), `${JSON.stringify({ category, record })}\n`)
      }
    }
    await writeOutput(tables, directory, { source: 'iwarship', gameVersion, region,
      provenance: { url: `https://iwarship.net/wowsdb/data/get-ship-detail/${version.versionId}`, versionId: version.versionId } }, options)
  }
}

async function generateGameParams(options, root, categories) {
  // 下载前确认解释器可用，使用实际程序路径绕过启动器和系统别名。
  options = { ...options, python: await resolvePython(options.python) }
  const input = await prepareGameParams(options, root)
  const translations = await prepareTranslations(options, input, root)
  options = { ...options, translationsPath: translations.path }
  let currentRegion
  let directory
  let tables
  // 一个区域结束即写盘，下一组不保留上一组数据。
  await readGameParams(input, options, categories, async event => {
    if (event.event === 'regions') {
      console.log(`GameParams 区域：${event.regions.join(', ')}`)
      return
    }
    if (event.region !== currentRegion) {
      currentRegion = event.region
      directory = createOutputDirectory(root, 'gameparams', input.gameVersion, currentRegion)
      if (options.verbose) writeFileSync(join(directory, 'raw.jsonl'), '')
      tables = Object.fromEntries(categories.map(category => [category, []]))
    }
    if (event.event === 'record') {
      for (const { category, row } of buildGameParamsRows(event, categories, translations.dictionary)) tables[category].push(row)
      if (options.verbose) appendFileSync(join(directory, 'raw.jsonl'), `${JSON.stringify(event)}\n`)
    } else if (event.event === 'end') {
      await writeOutput(tables, directory, { source: 'gameparams', gameVersion: input.gameVersion, region: currentRegion,
        provenance: { ...input.provenance, translations: translations.provenance },
        note: '各比较页按舰船配置组织，独立实体见参数页。旧版列对齐状态和计算条件见各表说明；待核实列保留为空，不以旧版本数值填充。装甲各配置和各层厚度不相加。'
      }, options)
      tables = null
    }
  })
}

async function main() {
  let values = parseOptions()
  if (values.help) { console.log(help); return }
  if (values.interactive) values = await promptOptions(values)
  const options = validateOptions(values)
  const root = resolve(projectDir, options.output)
  options.outputRoot = root
  mkdirSync(root, { recursive: true })
  console.log(`来源：${options.sources.join(', ')}；区域：${options.regions.join(', ')}；舰船：${options.ships.join(', ') || '全部'}`)
  const failures = []
  for (const source of options.sources) {
    const categories = selectCategories(options.categories, source)
    console.log(`${source} 类别：${categories.map(key => categoryNames[key]).join('、')}`)
    try {
      if (source === 'iwarship') await generateIwarship(options, root, categories)
      else await generateGameParams(options, root, categories)
    } catch (error) {
      console.error(`${source} 失败：${error.message}`)
      failures.push(source)
    }
  }
  if (failures.length) throw new Error(`${failures.join(', ')} 未完成；已成功来源的输出保留`)
  console.log('生成完成。同一来源、版本和区域使用固定目录，manifest.json 记录本次范围及记录数。')
}

main().catch(error => {
  console.error(`生成失败：${error.message}`)
  process.exitCode = 1
})
