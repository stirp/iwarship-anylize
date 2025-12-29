# iwarship-anylize

战舰世界数据分析工具 - 从 iwarship.net 抓取舰船数据并转换为 CSV 格式。

## 两种使用方式

### 方式一：Node.js (推荐)

使用 Node.js + HTTPS 模块，无需安装额外依赖。

#### 1. 安装依赖

```bash
npm install
```

#### 2. 配置 Cookie

```bash
# 复制模板
cp cookie.txt.example cookie.txt

# 编辑 cookie.txt，填入您的 Cookie
# 获取方法：浏览器登录 iwarship.net → F12 → Network → 复制 Cookie
```

#### 3. 运行抓取

```bash
# 默认配置
node fetch-data.js

# 自定义选项
node fetch-data.js -c my-cookie.txt -o ./exports
```

#### 命令行选项

| 选项 | 说明 | 默认值 |
|------|------|--------|
| `-c, --cookie <file>` | Cookie 文件路径 | cookie.txt |
| `-o, --output <dir>` | 输出目录 | data |
| `-h, --help` | 显示帮助 | - |
| `-v, --verbose` | 详细输出 | - |

---

### 方式二：Shell/Fish 脚本

使用传统的 Shell/Fish + curl + jq 组合。

#### 运行环境

- Linux/macOS/WSL
- 需要安装: `curl`, `jq`, `fish`, `perl`

#### 运行方式

```bash
# 使用 Fish shell
./convert.fish

# 或逐个处理
./convertSingle.fish 空袭
./convertSingle.fish 火炮
# ...
```

#### 注意

此方式需要:
1. 有效的 Cookie (通过浏览器获取)
2. 已下载 `preset/name.json` 和 `preset/i18n.json`
3. 映射文件位于 `mapping/` 目录

---

## 输出格式

### CSV 文件

- **编码**: UTF-8 with BOM (可直接用 Excel 打开)
- **位置**: `data/` 目录 (Node.js) 或当前目录 (*Flat.csv)
- **内容**: 11 个数据类别的 CSV 文件

| 文件 | 说明 |
|------|------|
| 空袭.csv | 航空打击数据 |
| 特色.csv | 特殊舰船/加成数据 |
| 飞机.csv | 舰载机属性 |
| 鱼雷.csv | 鱼雷武器数据 |
| 反潜武器.csv | 反潜装备数据 |
| 弹道穿深.csv | 穿甲弹穿透计算 |
| 消耗品.csv | 消耗品/技能数据 |
| 防空.csv | 防空火力数据 |
| 副炮.csv | 副炮武器数据 |
| 火炮.csv | 主炮武器数据 |
| 船体.csv | 舰船船体属性 |

---

## 目录结构

```
iwarship-anylize/
├── package.json           # Node.js 项目配置
├── fetch-data.js          # Node.js 主入口 (推荐)
├── convert.fish           # Fish 脚本入口
├── convertSingle.fish     # Fish 单类别处理
├── cookie.txt             # Cookie 文件 (手动创建)
├── cookie.txt.example     # Cookie 模板
├── data/                  # CSV 输出目录 (Node.js)
├── lib/                   # Node.js 模块
│   ├── cookie.js          # Cookie 读取/解析
│   ├── fetcher.js         # HTTP 请求
│   └── csv-writer.js      # CSV 生成
├── mapping/               # 字段映射配置
│   ├── 空袭mapping.json
│   ├── 火炮mapping.json
│   └── ...
├── preset/                # 预设数据
│   ├── name.json          # 舰船名称
│   └── i18n.json          # i18n 翻译
└── scripts/               # 工具脚本
```

---

## 数据来源

数据来自 [iwarship.net](https://iwarship.net/wowsdb/) 的 WoWS Database。

---

## 许可证

MIT
