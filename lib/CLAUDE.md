[根目录](../CLAUDE.md) > **lib**

# lib 模块

## 模块职责

提供 Node.js 版本数据抓取和处理的核心功能模块集合。

## 入口与启动

此目录为纯模块目录，无独立入口。模块通过 `import` 语句被主入口脚本引用。

## 对外接口

| 文件 | 用途 |
|------|------|
| `fetcher.js` | HTTP 请求封装 |
| `csv-writer.js` | CSV 文件生成 |
| `excel-writer.js` | Excel 文件生成 |
| `html-writer.js` | HTML 网页生成 |
| `preset.js` | 预设 JSON 数据加载 |
| `index-fetcher.js` | 索引数据抓取 |
| `assets-index.js` | 采集客户端资源清单，按资源目录汇总几何指纹，用于跨版本复用模型 |
| `model-directory.js` | 从导出日志取舰船实际使用的客户端资源目录名，用于把指纹对应到舰船 |
| `model-store.js` | 工作区模型库：把历史模型归集到 `.cache/local-models/` |
| `toolkit-cache.js` | 模型缓存：记录路径与资源指纹，跨构建查找并清理历史指纹 |
| `toolkit-exporter.js` | 本地游戏装甲导出与复用判定 |
| `wowsunpack-tools.js` | 导出器选择：探测 `tools/wowsunpack/` 集成变体与 PATH，优先逐面装甲 JSON |
| `cleanup.js` | 清理旧版本目录里的模型中间产物 |
| `sources/github.js` | GitHub API 封装：JSON 请求与仓库文件下载，直连原始地址失败时回退 blob 接口 |

## 关键依赖与配置

- **模块系统**: ESM (`"type": "module"` in package.json)
- **运行时**: Node.js
- **依赖库**:
  - `csv-stringify` - CSV 生成
  - `iconv-lite` - 字符编码转换
  - `xlsx` - Excel 文件生成

### html-writer.js 核心函数

```javascript
// 生成完整 HTML 页面
generateHTML(data, outputPath, gameVersion)

// 生成单类别 HTML
generateCategoryHTML(category, records, outputPath)
```

### csv-writer.js 核心函数

```javascript
// 写入 CSV 文件
writeCSV(data, filepath, category)
```

## 数据模型

lib 模块处理的数据流程:

```
iwarship.net API
    ↓ (fetcher.js)
原始 JSON 数据
    ↓ (mapping/*.json 映射)
扁平化数据对象
    ↓ (csv-writer.js / html-writer.js)
CSV / HTML 输出
```

## 测试与质量

运行主脚本测试完整流程:
```bash
node fetch-data.js
```

## 相关文件清单

- `fetch-data.js` - 主入口脚本，引用 lib 模块
- `export.js` - 导出脚本，引用输出模块

## 变更记录 (Changelog)

| 时间 | 操作 | 说明 |
|------|------|------|
| 2026-03-03 00:00:00 | 初始化 | 生成 lib 模块文档 |
| 2026-10-31 | 新增 | 加入资源指纹、模型库与旧结果清理模块，支持跨客户端版本复用模型 |
| 2026-10-31 | 新增 | 加入导出器选择模块，优先使用项目内集成的逐面装甲 JSON 导出器 |
| 2026-10-31 | 修复 | 资源指纹改以客户端资源目录为键，舰船编号与目录名不同时也能跨构建复用 |
| 2026-10-31 | 新增 | 抽出 `sources/github.js` 统一 GitHub 下载，词条与 GameParams 支持 blob 接口兜底 |
| 2026-10-31 | 修复 | 模型库归集历史模型时补齐 `toolkit-scene.glb` 等伴生文件，外观场景不再随缓存清理丢失 |
