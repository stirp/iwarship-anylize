# wowsunpack 导出器

本目录存放从本地游戏导出舰船装甲模型所需的 `wowsunpack` 可执行程序。两个变体都可独立使用，
导出器按「优先支持逐面装甲 JSON」的原则自动挑选，也可以用 `--wowsunpack` 显式指定。

二进制本体不入版本库（见 `.gitignore`），需要时按下文「获取方式」重新下载。

## 变体对照

| 目录 | 版本 | 来源 | 逐面装甲 JSON | GameParams pickle | 适用场景 |
|------|------|------|----------------|-------------------|----------|
| `armor-json/` | 0.23.0 + 本地补丁 | 上游 0.23.0 派生，新增 `--armor-json`、`decode-texture` 等 | ✅ `--armor-json <文件>` | ❌ 需兼容缓存副本 | **默认**：需要逐面厚度交互的装甲查看器 |
| `upstream/` | 0.46.0 | 上游官方发布物，未改动 | ❌ 改用 `--contents mesh\|armor\|both` | ✅ 原生支持 | 不依赖兼容脚本的备用导出器 |

两个变体都**无法**导出只有 `.model`、没有 `.geometry` 的舰船（客户端资源布局问题，报
`Could not open geometry`），与版本无关。

版本号登记在 `versions.json`，供日志展示，不参与二进制选择。

## 选用规则

1. `--wowsunpack <路径>` 显式指定时，只使用该程序。
2. 否则按 `armor-json/` → `upstream/` → `PATH 上的 wowsunpack` 顺序探测，
   取第一个既能执行 `export-ship`、又支持 `--armor-json` 或 `--contents` 的程序。
3. 选到 `upstream/` 时不启用 GameParams 兼容层；选到 `armor-json/` 时若客户端
   GameParams 无法直接解析，自动走 Toolbox 兼容缓存（见下）。

## GameParams 兼容层

`armor-json/` 变体基于旧版 wowsunpack，直接解析新版 `GameParams.data` 会报
`ValueNotHashable`。导出器会把 `WOWS_GAME_PARAMS_OVERRIDE` 指向 Toolbox 生成的兼容缓存副本，
转换脚本为 `compat_cache.py`（连同 `game_archive.py`、`cache_retention.py`、`runtime_i18n.py`），
已随本目录复制，来自 MIT 许可的 WoWS Toolbox v5，许可文本见 `armor-json/LICENSE`。

兼容脚本默认从导出器所在目录查找；若把 `wowsunpack.exe` 移出本目录，用环境变量
`WOWS_TOOLBOX_BACKEND` 指向实际的 `Backend` 目录即可。

## 获取方式

GitHub 下载需走本地代理 `http://127.0.0.1:10808`：

```bash
# 上游 0.46.0（含 wowsunpack.exe 的工具包，26.4 MB）
curl -L -o tools.zip \
  "https://github.com/landaire/wows-toolkit/releases/download/v1.0.2/wows_toolkit_tools_v1.0.2_win64.zip"
# 解压出 wowsunpack.exe 放到 upstream/
```

`armor-json/` 变体来自本地 WoWS Toolbox 的 `Backend/wowsunpack.exe`，把该文件复制过来即可。

## 许可

上游 wowsunpack / wows-toolkit 采用 MIT 许可证，版权归 Lander Brandt，详见 `LICENSE-MIT`
与 `NOTICE.md`。MIT 允许复制、修改、分发与再分发，唯一要求是保留版权与许可声明。
