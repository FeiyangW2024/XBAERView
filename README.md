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

`badge` 建议使用短文字，例如 `NO₂`、`LST`、`PM₂.₅`、`CO₂`；`sourceLabel` 是卡片顶部短来源名，`source` 保留完整来源。前端不推断卫星或变量身份。旧 JSON 缺少 badge 时显示通用连续/分类图标，缺少 sourceLabel 时显示 source，连 source 都为空则隐藏来源行。

已有服务器数据无需重新转换 COG：直接在成员 catalog.json 的对应 layers 条目补充这两个字段即可，建议产品 index.json 与产品配置同步补充。若重新运行发布器时修改了产品配置，现有指纹机制会判定配置变化并要求 --overwrite，因此仅修改展示标签时优先更新 JSON。服务器发布新版 dist 时保留服务器自己的 config.json，不要用本地构建内的 config.json 覆盖。
