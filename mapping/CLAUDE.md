[根目录](../CLAUDE.md) > **mapping**

# mapping 模块

## 模块职责

存放《战舰世界》数据转换的 JSON 映射配置文件。每个映射文件定义从原始 API 响应到扁平化 CSV 输出的字段转换规则。

## 入口与启动

此目录为纯数据目录，无入口文件。映射文件由 `convertSingle.fish` 脚本在运行时读取。

## 对外接口

| 文件 | 用途 |
|------|------|
| `<类别>mapping.json` | 定义该类别的字段映射规则 |

### 映射文件列表

| 映射文件 | 数据类别 |
|----------|----------|
| `空袭mapping.json` | 航空打击数据 |
| `特色mapping.json` | 特殊舰船/加成数据 |
| `飞机mapping.json` | 舰载机属性 |
| `鱼雷mapping.json` | 鱼雷武器数据 |
| `反潜武器mapping.json` | 反潜装备数据 |
| `弹道穿深mapping.json` | 穿甲弹穿透计算 |
| `消耗品mapping.json` | 消耗品/技能数据 |
| `防空mapping.json` | 防空火力数据 |
| `副炮mapping.json` | 副炮武器数据 |
| `火炮mapping.json` | 主炮武器数据 |
| `船体mapping.json` | 舰船船体属性 |

## 关键依赖与配置

- **格式**: JSON
- **语法**: key 为输出 CSV 列名，value 为 jq 路径表达式
- **示例** (船体mapping.json):
  ```json
  {
    "名字": "(.index + .upgrade.hull)",
    "类型": ".group",
    "等级": ".level",
    "血量": ".health"
  }
  ```

## 数据模型

映射规则遵循 jq 路径表达式规范：

- `.field` - 提取字段值
- `.field.nested` - 嵌套字段
- `.field1, .field2` - 多字段组合
- `."special-chars"` - 特殊字符字段名

## 测试与质量

- 使用 `jq` 验证映射语法: `jq '.' mapping/船体mapping.json`
- 运行 `./convertSingle.fish <类别>` 测试完整转换流程

## 常见问题 (FAQ)

**Q: 如何添加新字段?**
A: 在对应 mapping.json 中添加新 key-value 对，value 使用 jq 路径表达式。

**Q: 映射表达式报错?**
A: 使用 `jq 'map(<表达式>)' temp/原数据.json` 单独测试表达式。

## 相关文件清单

- `convertSingle.fish` - 读取此目录映射的转换脚本
- `download.sh` - 下载原始数据的下载脚本

## 变更记录 (Changelog)

| 时间 | 操作 | 说明 |
|------|------|------|
| 2025-12-30 00:48:37 | 初始化 | 生成模块文档 |
