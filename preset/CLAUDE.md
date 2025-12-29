[根目录](../CLAUDE.md) > **preset**

# preset 模块

## 模块职责

存放预下载的静态参考数据，包括游戏内国际化翻译和舰船名称映射。这些数据在转换过程中被引用，用于将英文/代码键值转换为中文显示。

## 入口与启动

此目录为纯数据目录，无入口文件。数据在 `convertSingle.fish` 脚本中被读取引用：

```fish
set nameFile "preset/name.json"
set i18nFile "preset/i18n.json"
```

## 对外接口

| 文件 | 用途 | 更新命令 |
|------|------|----------|
| `i18n.json` | 国际化翻译键值对 | `./downloadI18n.sh` |
| `name.json` | 舰船名称映射 | `./downloadShipName.sh` |

### 数据结构

**i18n.json**:
```json
{
  "dock_consume_title_001": "消耗品名称",
  "skill_001": "技能名称"
}
```

**name.json**:
```json
{
  "ussr_kiev": "基辅",
  "usa_iowa": "艾奥瓦"
}
```

## 关键依赖与配置

- **更新方式**: 通过 `downloadI18n.sh` 和 `downloadShipName.sh` 脚本从 iwarship.net 抓取
- **格式**: JSON，小写 key（经 `ascii_downcase` 处理）
- **特殊处理**: `downloadI18n.sh` 会移除前缀 `DOCK_CONSUME_TITLE_`

## 数据模型

- **i18n.json**: 存储 UI 文本翻译，key 为翻译键，value 为中文文本
- **name.json**: 存储舰船名称，key 为舰船代码（小写），value 为中文舰名

## 测试与质量

- 验证 JSON 语法: `jq '.' preset/i18n.json`
- 检查特定键值: `jq '."shipname_001"' preset/name.json`

## 常见问题 (FAQ)

**Q: 翻译缺失怎么办?**
A: 重新运行 `./downloadI18n.sh` 更新 preset/i18n.json

**Q: 舰名显示为 null?**
A: 检查 name.json 中对应键是否正确，运行 `./downloadShipName.sh` 更新

## 相关文件清单

- `downloadI18n.sh` - 下载国际化数据
- `downloadShipName.sh` - 下载舰船名称
- `convertSingle.fish` - 引用此目录数据进行翻译替换

## 变更记录 (Changelog)

| 时间 | 操作 | 说明 |
|------|------|------|
| 2025-12-30 00:48:37 | 初始化 | 生成模块文档 |
