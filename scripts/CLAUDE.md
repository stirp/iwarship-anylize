[根目录](../CLAUDE.md) > **scripts**

# scripts 模块 (根目录脚本)

## 模块职责

存放用于数据抓取和转换的 Shell/Fish 脚本，是项目的核心执行层。

## 入口与启动

### 主入口

| 脚本 | 用途 |
|------|------|
| `convert.fish` | 完整转换流程主入口 |
| `convertSingle.fish` | 单类别转换入口 |

### 数据下载

| 脚本 | 用途 |
|------|------|
| `download.sh` | 下载原始游戏数据 (11类) |
| `downloadI18n.sh` | 下载国际化翻译数据 |
| `downloadShipName.sh` | 下载舰船名称数据 |

## 对外接口

### convert.fish 工作流程

```
1. 创建 temp/ 目录
2. 执行 downloadI18n.sh
3. 执行 downloadShipName.sh
4. 执行 download.sh
5. 对每个类别执行 convertSingle.fish:
   - 空袭、特色、飞机、鱼雷、反潜武器、
   - 弹道穿深、消耗品、防空、副炮、火炮、船体
6. 清理 temp/ 目录
```

### convertSingle.fish 流程

```fish
./convertSingle.fish <类别名>
```

处理步骤：
1. 读取 `temp/<类别>.json` (原始数据)
2. 读取 `mapping/<类别>mapping.json` (映射规则)
3. 应用 jq 映射转换
4. 替换舰船名称 (name.json)
5. 替换 i18n 翻译 (i18n.json)
6. 输出 `<类别>Flat.csv`

## 关键依赖与配置

- **运行时依赖**:
  - `curl` - HTTP 请求
  - `jq` - JSON 处理
  - `sed` - 文本替换
  - `perl` - 进度条显示
  - `fish` - 转换脚本解释器
  - `bash` - Shell 脚本解释器

- **临时目录**: `temp/` - 存放中间 JSON 文件

## 数据模型

### 脚本参数

`convertSingle.fish` 接收单个参数 `<类别名>`，对应：
- 输入 JSON: `temp/<类别名>.json`
- 映射文件: `mapping/<类别名>mapping.json`
- 输出 CSV: `<类别名>Flat.csv`

## 测试与质量

### 手动测试

```bash
# 测试单个类别转换
./convertSingle.fish 船体

# 验证输出
cat 船体Flat.csv | head -5

# 检查中间文件
jq '.' temp/船体Flat.json
```

### 进度监控

`convertSingle.fish` 在运行时显示进度条 (0-100%)。

## 常见问题 (FAQ)

**Q: 脚本执行失败?**
A: 检查 `temp/` 目录是否存在，确保 `download.sh` 已成功下载数据。

**Q: CSV 输出为空?**
A: 检查映射文件语法 `jq '.' mapping/船体mapping.json`

**Q: 中文显示乱码?**
A: CSV 已添加 UTF-8 BOM，使用支持 BOM 的编辑器打开。

## 相关文件清单

- `mapping/` - 映射配置文件
- `preset/` - 预设数据
- `temp/` - 临时文件目录 (运行时生成)

## 变更记录 (Changelog)

| 时间 | 操作 | 说明 |
|------|------|------|
| 2025-12-30 00:48:37 | 初始化 | 生成模块文档 |
