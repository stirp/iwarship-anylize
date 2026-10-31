# 第三方组件与许可声明

本目录下的 `wowsunpack.exe` 来自第三方开源项目，本项目仅作调用与再分发，未改动其源码结构。

## wowsunpack

- 上游项目：<https://github.com/landaire/wows-toolkit>
- 子包路径：`crates/wowsunpack`
- 发布平台：<https://crates.io/crates/wowsunpack>
- 许可证：MIT（`Cargo.toml` 中 `license = "MIT"`，仓库根 `LICENSE` 声明版权人 Lander Brandt）
- 许可全文：见本目录 `LICENSE-MIT`

本目录中的两个可执行程序：

| 文件 | 版本 | 说明 |
|------|------|------|
| `upstream/wowsunpack.exe` | 0.46.0 | 上游官方发布物，未做任何修改，取自 `wows_toolkit_tools_v1.0.2_win64.zip` |
| `armor-json/wowsunpack.exe` | 0.23.0 + 补丁 | 基于上游 0.23.0（同样声明 MIT）修改，增加了 `--armor-json` 逐面装甲 JSON 侧车、`decode-texture` 等命令 |

`armor-json/` 变体属于 MIT 许可作品的修改版本：MIT 允许修改与再分发，条件是保留原版权与
许可声明，本目录的 `LICENSE-MIT` 即为该声明。其修改部分随本项目一同提供，无附加限制。

## WoWS Toolbox v5 的兼容转换脚本

`armor-json/` 变体基于旧版 wowsunpack，直接解析新版 `GameParams.data` 会报
`ValueNotHashable`，需要先把 GameParams 转成兼容的 pickle 副本。该转换由 WoWS Toolbox v5
的 `Backend` 脚本完成，本项目复制了其中的最小依赖闭包到 `armor-json/`：

| 文件 | 用途 |
|------|------|
| `compat_cache.py` | 生成兼容的 `GameParams_compat.data` 并复用缓存 |
| `game_archive.py` | 读取客户端 idx/pkg 归档并解码 GameParams |
| `cache_retention.py` | 清理过期构建的缓存目录 |
| `runtime_i18n.py` | 脚本自身的文案翻译表 |

- 上游项目：WoWS Toolbox v5（<https://wows-toolkit.readthedocs.io/>）
- 许可证：MIT（Copyright (c) 2026 WoWS Toolbox contributors），全文见 `armor-json/LICENSE`

这些脚本为原样复制，未作修改。

## 游戏资产的使用边界

WoWS Toolbox 的法律声明（`LEGAL_NOTICE.txt`）明确：MIT 只适用于工具自身的代码，
**不授予游戏资产的使用、分发或销售权利**。本项目导出的舰船模型、贴图等均来自本地游戏
客户端，属 Wargaming/Lesta 的资产，默认只在本地使用。若要把导出的 HTML 或模型对外
发布，需自行确认游戏 EULA 与平台条款。

## 本项目自有代码

`lib/` 下的导出与缓存逻辑为本项目自有代码，与上述第三方组件独立。
