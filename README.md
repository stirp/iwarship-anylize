# iwarship-anylize

战舰世界数据生成工具。运行时选择 iwarship 或 GameParams 数据源、区域、类别和舰船范围，分别生成 JSON、交互网页和 Markdown。

## 安装与运行

需要 Node.js 20+、npm。GameParams 来源另外需要 Python 3.10+，仅使用 Python 标准库。

```bash
npm install
npm run fetch
```

在终端中无参数运行会进入交互选择。脚本环境中无参数运行默认抓取 iwarship 的 ASIA 区域、全部类别和舰船。带参数时不会自动询问，可用 `--interactive` 显式进入交互模式。

```bash
# 明确选择现有网站来源
npm run fetch -- --source iwarship --regions ASIA --categories 船体,火炮 --ships 敷岛

# 自动下载公开 GameParams.data，提取敷岛装甲和船体
npm run fetch -- --source gameparams --regions ASIA --ships PJSB510 --categories armor,hull

# 从本地文件生成；版本由调用者提供，并在 manifest 中注明
npm run fetch -- --source gameparams --gameparams "/path/to/GameParams.data" \
  --game-version "15.9.0.0.13357625" --regions ASIA --ships PJSB510 \
  --categories hull,artillery,armor,projectiles

# 两种来源分别生成同一范围，互不覆盖
npm run fetch -- --source all --regions ASIA --ships PJSB510 --categories hull,artillery

# 选择多个区域；不生成 HTML 和 Markdown，仍输出 JSON
npm run fetch -- --source gameparams --regions ASIA,EU --categories armor \
  --ships PJSB510 --no-html --no-markdown
```

GameParams 仅支持编号、ID 或内部英文名称匹配，例如 `PJSB510`、`Shikishima`；iwarship 额外支持中文名。多个关键词为“或”关系，使用大小写不敏感的子串匹配。

## 运行选项

| 选项 | 说明 |
| --- | --- |
| `--source <来源>` | `iwarship`、`gameparams`、`all`，也可逗号分隔；默认 `iwarship` |
| `--regions <区域>` | `ASIA,EU` 等；默认 `ASIA`；`all` 遍历该来源所有区域 |
| `--categories <类别>` | 中文名称或英文键，逗号分隔；默认该来源支持的全部类别 |
| `--ships <关键词>` | 舰船编号或名称关键词，逗号分隔；默认全部舰船 |
| `--gameparams <路径>` | 本地 `.data` 或原始 GameParams JSON；不指定时下载公开文件 |
| `--game-version <版本>` | 本地 GameParams 必填；公开数据可手动指定版本标签 |
| `--ref <Git引用>` | 公开数据的提交、标签或分支，默认 `master`；下载前固定到实际提交 |
| `--python <程序>` | Python 程序路径，默认 `python3`；Windows 可指定 `python` |
| `--models-dir <目录>` | 将该目录下的 `<舰船编号>.glb` 或 `.zst` 打包到查看器；不指定时使用公开模型 |
| `--model-mode <模式>` | 默认 `embedded`，生成时下载或打包模型；`manual` 只打包参数，查看时手动选择模型 |
| `--no-3d` | 不生成独立 3D 查看器；`--no-html` 同时关闭查看器 |
| `-o, --output <目录>` | 输出根目录，默认项目下 `output`；支持绝对路径 |
| `--interactive` | 进入交互选择 |
| `--no-html` | 不生成网页 |
| `--no-markdown` | 不生成 Markdown |
| `-v, --verbose` | 保存所选范围的原始记录片段至 `raw.jsonl` |
| `-h, --help` | 显示帮助 |

未知选项、无效区域、不支持的类别、未命中舰船或空结果会报错。两来源同时运行时，共用选择范围；类别取各来源支持的部分，每个来源必须至少支持一个所选类别。一个来源失败仍继续处理另一个，最终退出码为非零。

## 数据来源及范围

### iwarship

从公开接口读取版本、中文名称和舰船数据，无需 Cookie。支持原有 12 类：

- `hull` 船体、`artillery` 火炮、`atba` 副炮、`torpedoes` 鱼雷。
- `airDefense` 防空、`aircraft` 飞机、`airSupport` 空袭。
- `ability` 消耗品、`specials` 特色、`penetration` 弹道穿深。
- `asw` 反潜武器、`pingerGun` 声呐。

区域取网站返回的 `serverVersion`，使用该区域对应的版本 ID；不会将未知区域回退为 ASIA。网站接口先返回全量数据，类别和舰船筛选在下载后执行。

### GameParams

默认下载 [wowsinfo/data](https://github.com/wowsinfo/data) 中的 `live/GameParams.data`。缓存位于 `output/.cache/gameparams/<提交>/`，复用前校验文件大小和 Git blob 哈希。版本优先使用显式标签，否则尝试从提交信息提取；无法识别时使用提交 ID，不猜测游戏版本。

也可读取从游戏目录解包的文件，或 [wows-toolkit](https://github.com/landaire/wows-toolkit) 导出的原始参数 JSON。此入口用受限的 Python 读取器直接解析 `.data`，不要求安装 Rust 或先生成几 GB 的完整 JSON；仅允许还原 `GameParams.GPData` 和 `GameParams.TypeInfo` 数据对象，遇到其他类会拒绝。

支持以上类别中的基础参数（不含派生的 `penetration`），另外提供：

- `armor`：舰体及挂载组件的装甲参数键、层、材质编号和毫米厚度；保留零值，各层不相加。区域语义及空间位置仍需模型网格。
- `projectiles`：弹药基础参数，如弹重、初速、风阻、伤害和引信。
- `crew`：舰长及技能参数。
- `modernizations`：升级品参数。

网页和 `data/*.json` 输出已选取的基础字段。英文字段保留游戏原始名称和单位，例如火炮 `maxDist` 为原始距离、`barrelDiameter` 为原始口径，不能直接当成 iwarship 的同名展示值。不会填造配装后的最大值、最小值或穿深结果。`--verbose` 额外保存筛选后的组件和实体原始片段，便于查阅未进入基础表的字段。

选择舰船后，飞机、弹药、消耗品、舰长和升级品实体限于这些舰船的参数引用链；消耗品按实体名与配置名共同筛选，仅追踪所选配置引用的飞机和弹药。多舰共享的配置合并输出。这不等同于计算所有适用的舰长或可安装升级品。需要全量实体目录时不设置 `--ships`。未装备的武器类别或没有引用的实体会生成空数组，不伪造记录。

命名区域与默认参数组分别输出：`ASIA` 等对应原始区域，空名称组使用 `DEFAULT`。单区域 JSON 和旧式单区域参数只能选择 `DEFAULT`，不会假定它来自 ASIA。所有舰体、武器组件配置分别保留，不自动挑选“完全体”。

原始文件仍需解压并反序列化到内存，筛选不是随机读取：目前样本约 17 MB，解压二进制约 89 MB。筛选后才序列化输出，避免展开全区域 JSON。输入及解压数据设有 512 MiB 上限；更大的完整 JSON 请改用 `.data` 或先导出单区域 JSON。

GameParams 本身没有网格及纹理；独立 3D 查看器使用另外提供的模型文件，不从参数值推造舰体形状。当前未集成本地游戏目录的自动模型解包，可将外部工具导出的模型交给查看器。

## 独立 3D 装甲查看器

默认随 HTML 一起生成。直接双击批次目录的 `index.html`，通过顶部入口或舰船记录的“3D 装甲”列打开独立页面；也可直接双击 `armor/index.html`，在查看器内切换本批次舰船。无需启动服务或修改浏览器安全设置。

```bash
# 生成参数、装甲表和独立查看器，同时下载并打包所选舰船模型
npm run fetch -- --source gameparams --ships PJSB510 --categories hull,artillery,armor

# 不预先下载模型，查看时点击“打开本地模型”选择 GLB / ZST
npm run fetch -- --source gameparams --ships PJSB510 --categories armor --model-mode manual
```

功能包括旋转、缩放、平移，默认/侧面/俯视/正面视角，厚度或区域着色，部位开关、厚度范围、线框、透明外观，以及装甲板选中、隐藏和恢复。支持桌面及手机布局。3D 查看器的脚本、样式、参数及已打包模型全部在本地，可以断网使用；原有数据表的样式及交互库仍依赖 CDN。

移动或分享时请保留整个批次目录，不能只复制 HTML。每艘船的参数和模型分别保存为 `armor/ships/<编号>.js`，打开该舰时才加载；模型以 Base64 保存，体积约增加三分之一。此前依赖服务的旧输出需要重新生成。

点击装甲板显示模型中的毫米厚度、材质、几何层、舰体组件或炮塔挂载点。若生成时包含 `armor` 类别，还会按**组件、挂载点、材质和层**与该批次参数对照，分别提示一致、差异或无法匹配；不会把表格值覆盖到模型上，也不把各层相加。模型配置会单独显示，不能用 A 舰体模型代表 B 舰体。

### 公开模型与缓存

默认在生成时读取 `https://model-ships.wows.shinoaki.com/model-ships/<舰船编号>.zst`，缓存后打包进输出文件。浏览器只加载本地数据包，不请求模型站。生成范围内的舰船都会准备模型；大批量生成时可用 `--ships` 限定范围，或用 `--model-mode manual` 跳过模型下载。

缓存保存在 `output/.cache/models/<来源哈希>/`，附带来源 URL、下载时间和文件哈希。后续生成校验大小和 SHA256 后复用缓存，不自动追踪上游更新。第三方未提供可核实的游戏版本号时，页面不会假定其与参数版本一致。404 或下载失败不影响数据表生成，失败舰船记录在 `manifest.json` 的 `viewer.modelFailures` 中，查看器保留手动打开模型入口。

`npm run serve` 仍保留为可选预览入口，兼容旧输出；新版查看器可直接从本地打开，也可部署到普通静态服务器。

### 本地模型

```bash
# /path/to/models/PJSB510.glb 或 PJSB510.zst
npm run fetch -- --source gameparams --ships PJSB510 --categories armor \
  --models-dir "/path/to/models"
```

只打包本批次涉及的舰船模型。同编号优先使用 `.glb`，缺失时提示并保留手动打开入口。也可在查看器中点击“打开本地模型”，文件在浏览器内读取，不上传。`--models-dir` 与 `--model-mode manual` 不能同时使用。

支持自包含的 GLB 2.0 及其 Zstandard 压缩文件。完整厚度交互要求 `extras.wows_armor.schema = wows-armor-export/1`，且网格原语带有对应 `plate_index`。普通 GLB 可以显示外观，但不会凭颜色猜测装甲厚度。`wows-toolkit` 或 Toolbox 输出不一定包含这个 schema，需要保留或适配元数据，不能只按扩展名判断兼容。

单个模型文件上限 100 MiB，解压后上限 256 MiB；浏览器需支持 WebGL 2。首次使用可先用敷岛 `PJSB510` 验证链路。

## 输出结构

```text
output/
  .cache/gameparams/<提交>/GameParams.data
  .cache/models/<来源哈希>/PJSB510.zst
  iwarship/<游戏版本>/<区域>/<批次>/
  gameparams/<游戏版本或提交>/<区域>/<批次>/
    manifest.json
    index.html
    armor/
      index.html              # 独立 3D 页面
      viewer.js
      viewer.css
      ships/PJSB510.js        # 单舰装甲参数及内嵌模型；manual 模式仅参数
    data/
      hull.json
      armor.json
    markdown/
      船体/PJSB510.md
      装甲/PJSB510.md
    raw.jsonl                  # 仅 --verbose
```

每次生成独立批次，避免改变选择范围后混入旧文件。终端打印实际目录。`manifest.json` 最后写入，记录成功批次的来源、版本、区域、筛选条件、各类别条数和输入校验信息；失败中途留下的目录没有完成标记。不会自动删除历史输出。

HTML、Markdown 和 JSON 使用同一份表格数据。Markdown 按舰船或实体编号分组，保留多配置记录；frontmatter 记录来源、版本、区域和编号，单配置记录还包含表格统计属性，供 Obsidian Dataview 查询。iwarship 同时保留中英文名称；多配置记录不会把某一配置的统计值当成整舰属性。页面支持搜索、筛选和 CSV 导出，各类别共用筛选选项，所选条件在某类别无匹配时显示空结果。样式及交互库仍依赖 CDN。

`output/`（包含缓存与生成文件）已加入 `.gitignore`。自定义目录位于 `output/` 之外时，需自行配置相应忽略规则。

## 从 CSV 导出

已有中文列名 CSV 可按类别命名（如 `船体.csv`），放入项目 `data/` 后运行：

```bash
node export.js
node export.js --excel
node export.js --html
```

这个独立入口继续输出到 `output/`，使用 CSV 中已有的列与数值，不再次套用 API 字段映射。

## 验证

```bash
npm test
```

测试使用小型离线数据及接口响应，覆盖双来源生成、区域/舰船筛选、独立批次、装甲分层、压缩 Pickle 数据对象、非法 Pickle 拒绝、错误状态、HTML 文本转义、GLB 元数据关联、模型与参数对照、模型打包、舰船数据脚本加载与取消、缓存校验，以及预览服务的并发缓存和访问边界。无需联网下载游戏数据。

## 数据与许可证

数据来源：[iwarship.net](https://iwarship.net/wowsdb/)、[wowsinfo/data](https://github.com/wowsinfo/data) 或用户提供的游戏参数。项目许可证：MIT；工具代码许可不等同于游戏资产再分发许可。
