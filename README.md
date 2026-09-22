# iwarship-anylize

战舰世界数据工具：从 iwarship.net 获取 ASIA 版本数据，生成中文交互网页及适用于 Obsidian 的 Markdown 文件。

## 安装与运行

需要 Node.js 和 npm。

```bash
npm install
node fetch-data.js
```

当前抓取入口读取公开接口，无需配置 Cookie。中文名称和翻译从网站的独立接口加载；版本号或翻译数据无效时会报错停止。

## 抓取选项

| 选项 | 说明 |
|------|------|
| `-o, --output <dir>` | 输出目录，默认 `output`，相对于项目目录 |
| `--no-html` | 不生成网页，仍可生成 Markdown |
| `--no-markdown` | 不生成 Markdown |
| `-v, --verbose` | 保存原始数据至当前工作目录的 `temp_raw_data.json` |
| `-h, --help` | 显示帮助 |

```bash
node fetch-data.js --no-markdown
node fetch-data.js --no-html
node fetch-data.js -o exports
```

## 输出内容

- `output/index.html`：12 个类别的中文数据表，支持搜索、筛选及 CSV 导出。页面样式和交互库需要访问 CDN。
- `output/战舰世界数据<版本号>/<类别>/<英文船名>.md`：同舰同类别的多条配置记录合并在一个文件内，不互相覆盖。
- 船体、火炮、鱼雷、飞机等名称保留配置后缀；Markdown 与网页共用字段转换逻辑。
- Markdown 多记录文件的 frontmatter 仅保留名称信息，各配置属性在正文表格中展示；单记录文件保留属性 frontmatter。

类别包括船体、火炮、副炮、鱼雷、防空、飞机、空袭、消耗品、特色、弹道穿深、反潜武器及声呐。

## 从 CSV 导出

抓取入口不自动保存 CSV，可通过网页导出按钮下载。将中文列名 CSV 按类别命名（例如 `船体.csv`），放入项目的 `data/` 目录后运行：

```bash
node export.js
node export.js --excel
node export.js --html
```

输出到 `output/`：Excel 为 `wows-data.xlsx`，网页为 `index.html` 和各类别独立页面。导出使用 CSV 中已有的中文列与数值，不再次套用 API 字段映射。

## 数据与错误处理

HTTP 错误、无效版本号、数据解析失败、空数据或文件写入失败会中止流程并返回失败状态。重新运行会更新同名输出文件，不自动清理历史文件。

历史模块 `lib/fetcher.js` 依赖缺失的 Cookie 模块，不属于当前入口；请使用 `fetch-data.js`。

## 数据来源与许可证

数据来自 [iwarship.net](https://iwarship.net/wowsdb/)。许可证：MIT。
