# XBAER View

Vue 3 + TypeScript + Vite + Pinia + OpenLayers 科研栅格浏览器。UI、中英文、Natural Earth 底图、字体及 COG 解码全部在本地运行，无在线地图或字体请求。

## 本地启动

要求 Node.js 22.12+ 或 24，以及 conda `py312` 环境。

```bash
npm ci
npm run data
# 另一个终端
npm run dev
```

访问终端输出的 `http://127.0.0.1:5173/`。数据服务默认读取项目相邻的 `../test data/publish`，监听 `127.0.0.1:8765`，仅允许 GET/HEAD，支持单段 Range、ETag，拒绝目录浏览与越界路径。可通过部署配置及 `DATA_PORT` 改变路径和端口。修改端口时同步修改 Vite 代理目标。

1. 启用一个图层，只请求该产品索引。
2. 选择日期与具体时刻，才请求对应 COG。
3. 鼠标悬停查询基础分辨率像元；支持排序、透明度、色标、定位、语言与主题切换。

初始不加载任何科研栅格。NO₂ 样例为 2023 年 1 月，气溶胶样例为 2023 年 4 月；两者没有同一时刻的数据，因此选定时间时另一图层显示“该时刻无数据”。时间固定为 UTC，不进行最近时间匹配。

## 发布真实数据

```bash
conda install -n py312 -c conda-forge gdal netcdf4 numpy scipy
conda run -n py312 python scripts/publish.py \
  --config config/products.json --input-root '../test data' \
  --output '../test data/publish'
conda run -n py312 python scripts/prepare_basemap.py \
  --input '../test data/basemap' --output '../test data/publish/basemap'
```

`publish/no2/*.tif` 和 `publish/aerosol/*.tif` **已经是最终 COG**，不是待二次转换的普通 TIFF。临时文件在系统临时目录，只有验证完成的 COG 才进入 publish。原始 NC、TIF 和 Shapefile 不改动。每个产品只有一层目录，索引自动按 UTC 时间排序，catalog 只含轻量信息。

发布器保存科学数值，连续 Float32、分类 Int32，DEFLATE、512×512 块、内部 overview。分类值只有 1/2/3，NoData 与类别值分离。默认基础有效值筛选，不自动屏蔽云或新增科研阈值。NC 的 scale/offset 和 declared valid range 由 netCDF4 解码处理；经纬度无效值单独过滤。

配置的 `min`/`max` 优先使用，必须成对提供；未提供则从已发布产品有效像元计算 2/98 百分位作为色标。显示范围不裁剪数值。NO₂ 样例固定 0–8e16 molecules/cm²。连续 overview 为 average，分类为 nearest；**点击查询固定读取 image 0，不使用 overview 值**。

二维经纬度通过 GDAL geolocation arrays 重采样，输出范围显式覆盖有效经纬度；未配置 resolution 时以两个相邻像元方向的有效间距中位数估算合理角分辨率并记录。0.05° 仅存在于样例产品配置。规则经纬度 NC 保持其合理间距，TIF 默认保留原 CRS，由 GDAL 在必要重采样时估算网格；可显式配置 CRS/分辨率。索引携带离线投影定义，浏览器不会联网查询 EPSG。

任意变量示例：

```bash
conda run -n py312 python scripts/publish.py \
 --input '/path/scene_20230101_0345.nc' --variable 'Data Fields/FinalAerosolOpticalDepth' \
 --lat 'Geolocation Fields/Latitude' --lon 'Geolocation Fields/Longitude' \
 --slice wavelength=2 --product aod550 --output '/path/publish'

conda run -n py312 python scripts/publish.py \
 --input '/path/scene.tif' --band 1 --datetime '2023-01-01T03:45:00Z' \
 --product temperature --output '/path/publish'
```

`--slice` 使用文件的实际维度名称和从 0 开始的索引；`--band` 从 1 开始。额外维度未选择、缺地理参考、空有效数据会报错。时间可由文件名 YYYYMMDD_HHMM 提取，无法推断时要求 `--datetime` 带时区。配置文件的 `qa` 可指定 NC 变量及 `allowed_values` 或整数 `reject_bits`。配置支持 `slices` 对象、分类 `classes`、双语 `name`、`unit`、`owner`、`source`。

输入与配置及流水线版本相同则跳过；同一时间输入发生变化需显式 `--overwrite`。新文件采用内容指纹命名，先发布文件再原子更新索引，失败不会使已有索引指向半成品。旧版本 COG 不自动删除，确认不再被旧客户端引用后由维护者清理。V1 发布程序要求单写者串行运行；不同成员分别发布各自目录。

## 底图

保留 `../test data/basemap` 下的六套 Natural Earth 1:10m Shapefile 及原始说明。预处理仅生成六个精简 GeoJSON，不生成多级简化、不改变行政区形状；坐标保留 5 位小数，去除展示无关字段。

`src/gis/basemapStyles.ts` 集中定义 Light/Dark 颜色、rank 映射和显示规则：国家/海岸线始终显示，省界 zoom≥4、河流 zoom≥3；城市、湖泊等再由 min_zoom 或 scale rank 筛选。城市标签避让、河流使用原始 strokeweig。六个文件各加载一次，主题和语言变化不会重新请求底图。单套全球 GeoJSON 约 62 MB 未压缩，Nginx 配置开启 JSON gzip；若后续性能不足再扩展多级简化或其他策略。

## 代码边界

- `src/components/`：界面和事件；MapCanvas 仅挂载/销毁 controller、同步状态。
- `src/stores/`：图层、时间、设置、查询等 Pinia 状态。
- `src/services/`：配置、目录/索引校验、时间集合与 URL 解析。
- `src/gis/`：OpenLayers 生命周期、底图、样式、栅格、投影、基础像元读取。
- `scripts/`：发布、底图预处理、只读本地服务与验证。

索引请求和 raster fetch 支持 AbortController；切换/关闭后旧事件不再更新状态。每个栅格固定 tile cache 64、远程块缓存 16；像元 TIFF 缓存由 `rasterCacheSize` 控制，LRU 淘汰。关闭图层会从地图移除、dispose renderer/source、取消请求、释放对应查询缓存。Pinia 不保存 OpenLayers 对象。

## Linux 公共平台部署规划

当前仅生成本地配置，不连接或修改服务器。

- 平台代码、配置、构建产物：`/home/admin1/xbaer-view/`。
- 成员原始科研数据：`/data_hdd/<实际成员目录>/results/`。
- 成员最终 COG 与索引：`/data_ssd/<实际成员目录>/publish/<product>/`。
- 公共底图 GeoJSON：`/data_ssd/xbaer-view/publish/basemap/`，不放入 Vue public 或 dist。
- Natural Earth 源数据路径通过 `basemap.sourceRoot` 配置；示例暂设 `/data_hdd/xbaer-view/basemap-source/`，不复制进平台目录。

`config/deployment.linux.example.json` 是 Linux 模板，`config/deployment.local.json` 保持当前本地样例。相对文件系统路径相对于配置文件所在目录解析。`members` 的键是逻辑成员 ID；每位成员的 `resultsRoot`、`publishRoot`、`publishUrl` 必须显式填写，实际目录名与逻辑 ID 不必相同，也不要求 data 后缀。模板中的 `REPLACE_WITH_ACTUAL_MEMBER_DIRECTORY` 必须在部署前替换。

```bash
# 仅预览目标路径，不读取服务器数据、不创建服务器目录
conda run -n py312 python scripts/publish.py --deployment config/deployment.linux.example.json --member member_a --config config/products.json --dry-run
conda run -n py312 python scripts/prepare_basemap.py --deployment config/deployment.linux.example.json --dry-run
# 在本地生成供审阅的 URL 配置与 Nginx 配置
conda run -n py312 python scripts/configure_deployment.py --deployment config/deployment.linux.example.json --output-dir deploy
```

后续在服务器运行转换时去掉 `--dry-run`。发布器直接从配置的 resultsRoot 读取相对产品路径，将最终 COG、index.json 写入配置的 publishRoot/product；成员 catalog.json 位于 publishRoot。图层 ID 加逻辑成员前缀，避免不同成员产品重名。也支持 `--input` 相对成员 resultsRoot 的单文件输入；禁止与 `--output/--input-root` 混用覆盖部署路径。

前端 `config.json` 只包含 `members.<id>.catalogUrl`、`basemapRoot` 等 URL，不含 Linux 文件系统路径。启动读取各成员轻量 catalog，启用图层后请求 index，COG URL 相对于该 index 解析。共享底图仅通过 basemapRoot 读取。未来 RGB 地址仍通过 rgbBasemapUrl 配置。

部署时将生成的 `deploy/config.json` 放到平台 `dist/config.json`，按生成的 `deploy/nginx.conf` 配置静态映射；不把 Linux 配置覆盖本地 public/config.json。Nginx 仅暴露显式配置的 publish 根目录，不暴露 results。平台工程不包含离线 GeoJSON 数据。

本地数据服务同样读取部署配置，默认 `config/deployment.local.json`，可通过 `DEPLOYMENT_CONFIG` 更换；端口由 DATA_PORT 控制。本地 Vite 代理使用 `/data/` 前缀，成员与公共底图分别映射，底图 URL 优先于父级映射。

## 验证

```bash
npm test
npm run build
conda run -n py312 python -m unittest discover -s tests -p 'test_*.py'
# 先启动 npm run data
conda run -n py312 python scripts/validate_samples.py --report validation.json
```

自动验证包含 NC/TIF、二维定位、维度切片、固定范围/百分位、幂等发布、失败保护、精确时间匹配、底图层级、请求取消/过期事件、缓存淘汰及基础分辨率查询。真实样例验证检查 COG、块、overview、分类、空间邻域源值一致性及 206 Range。

## 来源与许可

Natural Earth：Public Domain，原始授权说明保留在源目录。字体来自 Google Fonts 官方仓库，SIL OFL 1.1，许可位于 `public/fonts/`。项目无需外网运行；首次 npm/conda 安装需要网络或预置依赖。

本次交付验证：7 个最终 COG 每个抽查 80 个有效输出像元，在对应源数据最近的 9 个地理邻域像元中均找到精确一致数值（此检查用于定位/值保真验证，不替代产品科学质量评估）。`validation.json` 保存文件级结果。真实浏览器确认首屏无 COG 请求、启用后仅索引、选时刻后 Range；中文浅色、英文暗色及 390×844 小屏已检查。

默认 CSP 限制页面数据和字体到同源地址；开发热更新仅额外允许本机 5173 WebSocket。迁移时优先用 Nginx 同源 alias 接入成员 publish，避免跨域和外网依赖。

## 面板与全球浏览

标题、主题和语言切换位于图层面板顶部。图层和时间面板均可独立收起，收起不会关闭图层或清空观测时间；时间浮动按钮保留当前 UTC 时刻。底图及 COG 开启 wrapX，视图启用 multiWorld，支持跨日期变更线连续横向平移；查询经纬度仍归一化到标准范围。最小 zoom 为 1。

悬停查询停留 180ms 后读取，移动、拖动或离开地图时取消旧查询并隐藏浮框；信息框自动避让屏幕边缘。比例尺跟随时间面板，展开时位于面板右上方，收起时位于时间按钮右上方。

## 图层徽标与来源标签

产品配置以及生成的 catalog/index 支持可选字符串字段 `badge` 和 `sourceLabel`，例如 LST 产品可配置：

```json
{"badge":"LST","sourceLabel":"MODIS"}
```

`badge` 建议使用短文字，例如 `NO₂`、`LST`、`PM₂.₅`、`CO₂`；`sourceLabel` 是卡片顶部短来源名，`source` 保留完整来源。前端不推断卫星或变量身份。徽标仅显示与界面语言无关的变量简称：优先读取 badge，统一化学式下标与标点（NO₂ → NO2、PM₂.₅ → PM25）；四字符以内保留，更长则取前两个字母。旧 JSON 按英文产品名称及 ID 识别 Ae、NO2、PM25、CO2、LST、LCC、Cl；其他变量按英文首词应用同样长度规则，缺失信息时显示 Var。缺少 sourceLabel 时显示 source，连 source 都为空则隐藏来源行。

已有服务器数据无需重新转换 COG：直接在成员 catalog.json 的对应 layers 条目补充这两个字段即可，建议产品 index.json 与产品配置同步补充。若重新运行发布器时修改了产品配置，现有指纹机制会判定配置变化并要求 --overwrite，因此仅修改展示标签时优先更新 JSON。服务器发布新版 dist 时保留服务器自己的 config.json，不要用本地构建内的 config.json 覆盖。

## Linux production workflow

科研数据链路：`results → publish.py → publish/<product>/*.tif + index.json → catalog.json → Nginx`。
平台代码链路：`已提交的开发代码 → deploy-production.sh → dist → Nginx`。
恢复链路：`rollback-production.sh → previous known-good version`（源码 commit 与构建产物一同恢复）。

所有命令从项目根目录执行。平台路径由所在目录决定，脚本不绑定服务器路径、成员名或 Git remote；不执行 fetch/pull、sudo、Nginx 修改或重启。生产发布继续使用现有入口，例如：

```bash
conda run -n py312 python scripts/publish.py \
  --deployment config/deployment.linux.json --member MEMBER_KEY \
  --config config/products.json
```

将 `MEMBER_KEY` 和产品配置文件替换为实际配置。发布器从成员配置读取 resultsRoot/publishRoot，仅规范该 publishRoot、本次产品目录、索引引用的 COG、index.json 和成员 catalog.json：目录 0755，文件 0644。JSON 在 atomic replace 前后都设置 0644，重复运行跳过转换的 COG 也会修复权限。未触及产品和其他成员不递归修改，resultsRoot 不修改。缺失关键产物、符号链接、硬链接或 chmod 失败会报错并非零退出。权限失败不会回滚已生成的科学文件，修正目录所有权后可重复运行。publishRoot 不能等于或包含 resultsRoot。

这些权限不等于完整的 Nginx 访问测试：父目录、ACL、SELinux 及 Nginx 配置仍由服务器管理员管理；脚本对缺少公共遍历权限的祖先目录给出警告，绝不修改它们。历史产品的 0600 文件可按其原配置逐个重跑发布入口（输入及配置不变时复用 COG）；不需要重新转换。

### 首次接管与日常部署

一次性准备：提交本次脚本和 .gitignore 改动，保持工作树干净；确认服务器自己的 `deploy/config.json`、`config/deployment.linux.json` 保持未跟踪；备份现有 dist，并核实它对应的源码 commit。需要本地 Git、Bash、tar、满足 package.json 的 Node/npm，以及 npm 缓存或依赖下载网络。预留至少两份构建和一次 npm ci 的空间。Nginx 必须能读取 `.production/releases/` 并允许 dist 符号链接；祖先目录权限需人工确认。

```bash
bash scripts/deploy-production.sh --check
# 首次且仅首次：KNOWN_RUNNING_COMMIT 必须人工确认对应当前可工作的 dist
bash scripts/deploy-production.sh --adopt-current KNOWN_RUNNING_COMMIT
# 后续：代码已提交到本地仓库即可，不需要 remote
bash scripts/deploy-production.sh
bash scripts/rollback-production.sh --check
bash scripts/rollback-production.sh
```

若无法确认现有 dist 对应 commit，不要猜测 HEAD；先人工建立匹配且验证可用的源码/构建基线。`--check` 仅检查基本前置条件，不安装依赖、不构建、不更改生产文件，不能代替实际构建验证。

部署使用 `git archive HEAD` 在 `.production/stage-*` 中隔离执行 `npm ci --include=dev --no-audit --no-fund` 和 `npm run build`，不改当前 node_modules 或运行中的 dist。然后注入服务器 `deploy/config.json`，检查 index/config 和引用的 assets，规范 Web 权限并计算完整性摘要。构建或校验失败，原 dist 保持服务。首次将真实 dist 目录移入保留备份后切换为符号链接，这一步有极短的目录切换间隙；后续用 rename 原子切换 dist 链接。

`.production/state.json` 保存 current（production/last-good）及 previous，记录 commit、构建目录与摘要；只有切换和校验成功才登记新 current，旧 current 成为 previous。首次 `--adopt-current` 仅登记人工确认的已有基线。回滚使用 previous 的已保存构建，不重新安装/构建，验证摘要后先注入**当前**服务器 deploy/config.json，再恢复源码到对应 commit（detached HEAD）并切换 dist。服务器配置不被 Git 覆盖；含这些路径的目标 commit 会被拒绝。回滚成功后 previous 指向回滚前版本，允许再次切回。管理脚本同时保留在 `.production/`，并在本地 `.git/info/exclude` 保留服务器文件忽略规则，避免旧 commit 的 .gitignore 失效。若回滚到尚无新脚本的旧源码，可使用 `bash .production/deploy-production.sh` 或 `bash .production/rollback-production.sh` 继续管理；这不修改任何远程历史。下次开发/更新代码前应明确选择本地分支或目标 commit。

事务 journal 在修改源码或切换 dist 前写入。普通失败自动恢复部署前 dist、源码位置及 state；恢复失败会保留 journal 和备份并报错。进程被杀或机器重启后，先确认没有部署进程，再检查 `.production/journal.json`；仅当锁已失效时手动 `rmdir .production/lock`，然后运行 `bash scripts/deploy-production.sh --recover`。不要在运行中删锁或手工删除 journal。恢复只在有 journal 时执行，不会继续新部署。

release 和首次目录备份不会自动清理；管理员可在确认没有事务后清理未被 current/previous 引用的旧 release。不要删除 current/previous。这里的 known-good 表示人工接管基线或构建/结构校验通过的版本，不含线上业务验收；每次部署后仍应检查页面、图层和 Range 响应。已有浏览器可能需刷新以加载新版本的资源。

未来接入任意 Git 托管平台时，可在脚本之前独立增加 `fetch → 检查目标 commit → 更新本地工作树`，再调用本部署脚本；事务逻辑无需绑定 GitHub/GitLab。

本地回归（仅使用临时目录和临时 Git 仓库；部署测试用模拟 npm，不修改真实 dist）：

```bash
conda run -n py312 python -m unittest discover -s tests -p 'test_*.py'
node --test tests/test_production.mjs
bash -n scripts/deploy-production.sh scripts/rollback-production.sh
node --check scripts/production.mjs
```

## 卷帘对比

图层面板底部点击「对比」，在时间面板分别选择左右图层及观测时间。同一图层默认选择两个不同的可用时刻并共用色标；不同图层默认同步时间，仅使用严格交集，无共同时间时可关闭同步独立选择。对比期间普通图层设置暂不可操作，退出恢复原图层与时间。拖动分界线或聚焦手柄后使用左右方向键调整；支持交换左右、收起时间面板，悬停查询同时返回两侧基础分辨率像元值。

对比状态位于 `src/stores/compare.ts`，渲染裁切位于独立 GIS 模块 `src/gis/swipe.ts`；两侧使用独立 WebGL canvas、共用底图，退出时释放栅格及取消请求。前端直接消费现有产品索引，不需要修改发布格式。

## 色标编辑与 Min～P95

连续变量默认使用**当前观测文件的最小有效值～P95**，不再使用产品固定 min/max 作为默认显示范围。统计排除 NoData、NaN 和 Infinity，不裁剪原始科学数值；仍可手动调整范围或恢复自动范围。常量数据会为渲染扩展一个最小范围。同一变量双时间对比共用两侧范围的包络（两侧 min 的最小值、两侧 P95 的最大值），避免颜色失去可比性；这不是合并两时刻像元后的 P95。

现有 `publish.py → publish_product` 会在每个文件条目写入 `statistics: {min, p95}`。保留旧 min/max 字段供兼容客户端读取。重新运行未改变输入及配置的发布命令时，复用 COG，只为缺少统计信息的条目补算并更新索引。未补统计的旧 Float32 COG 在选时后由浏览器分块扫描基础像元，按线性插值精确计算 P95（两遍读取，固定大小直方图；不使用 overview 抽样）。首次会比直接读统计索引慢，生产环境建议先补齐统计；页面仅缓存最近 8 个统计结果，切换/关闭会取消旧计算。其他连续数据类型需先通过现有发布器生成 Float32 COG 或提供 statistics。

分类图例前的色块可点击编辑，包含系统颜色选择器与 `#RRGGBB` 文本框；合法输入即时同步地图，修改仅作用于当前浏览器会话。连续色标旁的 `r` 反转颜色顺序，数值上下限不变。

色标下拉框的「上传 YAML 色标」导入本地文件，支持下面的受限 YAML 格式（或仅使用颜色列表，省略 name/colors）；颜色必须加引号。支持 2–256 个六位十六进制颜色，文件不超过 64 KB，不支持 YAML 标签、锚点及任意嵌套结构。示例位于 `config/palettes/example.yaml`：

```yaml
name: Aurora
colors:
  - "#ffeff3"
  - "#c3b1ff"
  - "#6ffdca"
  - "#f4f226"
  - "#b10900"
```

上传色标只保存在当前浏览器的 localStorage，不上传服务器。选择上传色标后，下拉框出现「删除当前上传色标」；删除时使用它的图层回到 Thermal，内置色标保留。反转同步应用于地图和图例。

比例尺下方显示最后一次地图鼠标位置，无需启用科研图层。默认度分秒（E/W、N/S），点击坐标切换为十进制度；时间面板收起/展开保留本次选择。色标下拉文本右对齐，`r` 背景常驻。删除菜单始终可见：上传色标可删除，Viridis/自定义内置色标可隐藏并从菜单恢复，Thermal 为不可删除的默认回退项。

## Mac 一键推送到现有生产服务器

日常入口为 **`./deploy.sh`**。不能使用同名 `./deploy` 文件：项目已保留服务器专属 `deploy/` 目录（存放 deploy/config.json），文件与目录无法同名。原有隔离构建、release 切换和回滚脚本保持不变。

```bash
cd "/Users/fy/Documents/Website project vs/XBAERView"
# 首次本机准备依赖；以后 package-lock 更新时按需执行
npm ci
# 检查修改并提交需要发布的文件，工作树必须干净
# git add <明确的文件列表>
# git commit -m "Update XBAER View"
./deploy.sh --check   # 仅本机检查与测试，不连接服务器
./deploy.sh           # 测试 → bundle → scp → SSH → 构建部署 → HTTP 校验
```

默认目标 `admin1@10.103.2.100`，项目 `/home/admin1/xbaer-view`。首次 SSH 可能要求核对主机指纹或输入密码；日常免密可使用已有 SSH key/agent，本脚本不修改 SSH 配置、不存储密码。临时传输文件名为 `update`，内容是 Git bundle；服务器项目名称始终不变。临时目录使用随机名称并在结束时清理。

远程接收脚本在专用 Bash 进程内执行：

```bash
source /home/admin1/miniforge3/etc/profile.d/conda.sh
conda activate xbaer-web
```

使用现有 xbaer-web 的 Node/npm（服务器目前 Node v24.19.0、npm 11.17.0），不通过 apt 安装 Node，不修改 `.bashrc`、`.profile`、`.zshrc`、Conda 初始化或共享账号的任何登录设置。该环境只传给部署进程及其子进程，SSH 命令结束即结束，不影响其他会话。无需执行 conda init 或配置自动激活。

可通过一次命令的环境变量覆盖目标，不修改源码，例如：

```bash
XBAER_SSH_TARGET=admin1@10.103.2.100 \
XBAER_REMOTE_ROOT=/home/admin1/xbaer-view \
XBAER_CONDA_SH=/home/admin1/miniforge3/etc/profile.d/conda.sh \
XBAER_CONDA_ENV=xbaer-web \
XBAER_HEALTH_URL=http://127.0.0.1:8080 \
XBAER_PUBLIC_URL=http://10.103.2.100:8080/ \
./deploy.sh
```

脚本验证本机工作树、受保护路径、npm test、vue-tsc；远程验证工作树、已接管的生产状态、bundle 与完整 SHA；为原 HEAD 创建本地备份 ref，然后 detached checkout。依次调用现有 deploy-production.sh --check 和 deploy-production.sh，最后验证 current SHA、previous、dist/index.html、服务器配置一致性，以及 8080 首页与 config.json 的 HTTP 200 和响应内容一致性。成功输出请求/current/previous commit 和访问地址。

失败立即停止并返回非零；本地检查失败不会上传。构建与切换阶段的恢复仍由现有 production.mjs 负责；外层脚本不会 reset --hard，也不会自动改写配置、发布科研数据或再次 adopt。切换源码后构建失败，源码可能停留在新 commit 而旧 dist 仍服务；HTTP 验证发生在现有部署事务之后，因此 HTTP 失败可能已经切换到新 release，不能把失败输出理解为已自动回滚。检查 state.json，再决定是否回滚。不要并行运行手工部署与一键推送；一键推送之间使用 .production/push-lock 互斥，原部署仍使用自己的 lock/journal。进程被杀后，确认没有发布进程再移除遗留 push-lock。

### 首次服务器接管与回滚

现服务器已经完成首次 `--adopt-current`，以后只运行 `./deploy.sh`。若未来迁移到全新服务器，先准备服务器配置、正确的 Nginx 根目录与可读取的目录权限、xbaer-web 环境，并人工确认已有 dist 对应 commit；首次接管在独立子进程中执行（不更改登录环境）：

```bash
ssh admin1@10.103.2.100 'bash --noprofile --norc -s' <<'REMOTE'
set -euo pipefail
source /home/admin1/miniforge3/etc/profile.d/conda.sh
conda activate xbaer-web
cd /home/admin1/xbaer-view
bash scripts/deploy-production.sh --adopt-current 已确认旧DIST对应的完整COMMIT
REMOTE
```

仅首次接管时将占位文字替换为真实 commit。常规回滚复用已有脚本，同样只临时启用环境：

```bash
ssh admin1@10.103.2.100 'bash --noprofile --norc -s' <<'REMOTE'
set -euo pipefail
source /home/admin1/miniforge3/etc/profile.d/conda.sh
conda activate xbaer-web
cd /home/admin1/xbaer-view
bash .production/rollback-production.sh --check
bash .production/rollback-production.sh
curl --fail --show-error --silent -o /dev/null http://127.0.0.1:8080/
curl --fail --show-error --silent -o /dev/null http://127.0.0.1:8080/config.json
REMOTE
```

`.production/rollback-production.sh` 是已有管理脚本保留副本，适用于源码已回退到尚无 scripts 工具的旧版本。回滚不修改远程历史，保留当前服务器 deploy/config.json。新入口的本地测试使用临时 Git 仓库、模拟 Conda/npm/curl，不连接真实服务器：`node --test tests/test_push_production.mjs`。
