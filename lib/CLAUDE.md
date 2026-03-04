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
