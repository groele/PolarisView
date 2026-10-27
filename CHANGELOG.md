# Changelog

## v3.1.6 - 2026-10-27

### Fixed
- **4K 叠加图像导出缩放矩阵修复 (`PolarOverlayManager.exportOverlayImage`)**:
  - 修复了高分辨率导出时 `render()` 内部 `ctx.setTransform(1, 0, 0, 1, 0, 0)` 抹除 `3×` 导出倍率导致导出图像仅左上角 1/9 区域绘制的缺陷。
- **真正矢量 SVG 导出 (`PolarChartManager.exportImage` / `exportDualStitchedImage`)**:
  - 新增 `renderChartToSvgDataUrl` 离屏 `{ renderer: 'svg' }` 矢量渲染与双联视图 SVG 拼接，修复此前在 Canvas 渲染器下导出 `.svg` 实为 PNG 位图的问题。
- **全链路质量门控 (`claimLevel === 'blocked'`) 与可见组 (`activeGroups`) 一致性**:
  - 在样品叠加视图 (`PolarOverlayManager`)、综合单图 (`renderUnifiedComboChart`)、学术实验报告 (`ReportEngine`) 以及界面统计明细表 (`updateDataTable`) 中统一拦截 `blocked` 状态下的不可报告衍生指标与拟合曲线。
  - 在叠加视图散点绘制与极值计算中同步响应图例组显隐筛选 (`activeGroups`)，并在直角坐标与综合单图中补齐 `#groupFilter` 筛选支持。
- **信号处理与拟合精度加固**:
  - 补齐 `FilterEngine.savitzkyGolay` 的 11 点窗口二次/三次多项式卷积系数 (`win = 11`)。
  - 在 `MalusFitter.fitMalusLaw` 中同时提供 `0.1°` 步长精化的 `thetaMax` 与 `thetaMin`，统一 ECharts 图表极值标注与叠加视图快轴角标数值。
  - 修复 `StateStore.saveLatestMetrics` 中 `extinctionRatioDB` 字段读取、`DataParser` 周期分组浮点容差及 `TableGrid` 编辑重绘焦点保持。
- **HTML 精灵图与自动化测试强化**:
  - 补齐 `index.html` 中缺失的 `#i-download` SVG 图标定义，并在 `tests/check-html.mjs` 中新增所有内部 `#id` 引用完整性校验。
  - 在 `tests/overlay-smoke.mjs` 中支持跨平台浏览器探测并加入 GitHub Actions CI 工作流。

## v3.1.5 - 2026-09-18

### Changed
- Reworked the sample-overlay toolbar and HUD for narrow screens so controls remain inside the viewport without covering the canvas.
- Added keyboard canvas nudging, accessible control names, live state semantics, focus handling, and Escape-to-close behavior for the overlay workflow.
- Coalesced rotation and resize rendering through `requestAnimationFrame`, cached unchanged canvas dimensions, and observed container resizing to avoid redundant bitmap reallocations.

## v3.1.4 - 2026-09-17

### Added
- **对齐偏角滑移 (Range Slider) 与直接输入 (Number Input) 模块 (Alignment Rotation Slider & Direct Input)**:
  - 在样品叠加视图舞台上方悬浮工具条 (`.overlay-rot-group`) 中新增微型滑移模块 (`#overlayQuickRotSlider`) 与数值直接输入框 (`#overlayQuickRotInput`)。
  - 用户可直接在舞台上通过平滑拖拽滑块（范围 `-180° ~ 180°`，精度 `1°`）快速粗调样品解理面/晶棱旋转对齐角。
  - 用户亦可直接在带有科研高光环绕与 `°` 单位标识的微型输入框中键入精确绝对角度（支持按回车键立即生效及失焦校验）。
  - 实现双向高灵敏度且防焦点重入打断的联动同步：滑块拖动、数值键入、原有 `-5°/-1°/0°/+1°/+5°` 微调步进按钮、侧边栏滑块、触控捏合/单指旋转以及学术卡片晶棱偏角指标保持全局实时双向同步。
  - 角度数值严格进行 `[-180°, 180°]` 闭环模除与四舍五入规范化处理，保障物理方向的数学严密性。
- **自动化测试拓展**:
  - 在 `tests/overlay-smoke.mjs` 中添加针对滑移模块拖动、数字输入框键盘变更、微调步进联动及一键复位的无头端对端自动化断言。

## v3.1.3 - 2026-09-17

### Fixed
- **Canvas 2D 硬件加速切片渲染与黑块根治 (Black Tile Clipping Fix)**:
  - 修复了在导入大尺寸高分辨率光学显微照片（如 2592×1944 px 实拍图）时，Windows Chrome 硬件加速 (Direct3D 11 / Skia) 渲染临时滤波切片显存泄漏的问题。
  - 在 `drawBackgroundImage` 中引入严密的滤镜显式复位机制，确保绘制完毕后立即恢复 `ctx.filter = 'none'`，并在重绘入口强制重置 `ctx.setTransform(1, 0, 0, 1, 0, 0)` 与 `ctx.filter = 'none'`，彻底阻断切片残留与脏状态污染。
  - 引入基于 `requestAnimationFrame` 的平滑调度例程 (`requestRender` / `cancelPendingRender`)，将鼠标高频拖拽、滚轮平滑缩放与滑块调节合并为最高 60/120Hz 的单帧渲染，杜绝 GPU 显存队列饱和与掉帧撕裂。
- **浮动调控层 GPU 混合合成加固 (Compositing Layer Isolation)**:
  - 将 `.overlay-floating-bar`、`.overlay-quick-hud` 和 `.overlay-drag-hint` 的脆弱毛玻璃 `backdrop-filter` 替换为高保真、抗撕裂的深色防反射实色背景，避免 ANGLE Direct3D 在 Canvas 上方产生图层剪裁黑洞。
  - 为 `#overlayCanvas` 赋予 `width: 100%; height: 100%; touch-action: none;`，防止画布亚像素缩放间隙与多点触控滚动冲突。

## v3.1.2 - 2026-09-17

### Added
- Keyboard hotkey toggles for overlay mirroring: press `X` to toggle horizontal flip and `Y` to toggle vertical flip in real-time.
- Touch screen and tablet gesture support: single-finger drag to position and two-finger pinch to smoothly scale micrographs/polar plots on laboratory touch devices.
- Scientific provenance watermark tag in academic card: displays `[X-Flip]`, `[Y-Flip]`, or `[XY-Flip]` on canvas.
- Traceable export file naming: 4K exported images automatically append `_xflip`, `_yflip`, or `_xyflip` to their filenames.

### Fixed
- Added canvas boundary bounding-box check on mouse release to prevent erratic click-to-locate shifts when dragging outside window borders.
- Explicitly reset image pan and zoom offsets when importing new local image files.

## v3.1.1 - 2026-09-17

### Added
- Independent X-axis (horizontal) and Y-axis (vertical) optical micrograph mirroring options for the sample overlay view.
- Support for physical optical setups: inverted microscope camera mountings, reflected light paths, and prism-induced image reversals.
- Three synchronized control surfaces: Stage floating toolbar buttons (`#btnOverlayFlipX`, `#btnOverlayFlipY`), Quick HUD drawer toggles (`#hudChkFlipX`, `#hudChkFlipY`), and Sidebar panel checkboxes (`#overlayFlipX`, `#overlayFlipY`).
- In-place centered scale transformations (`scale(-1, 1)` and `scale(1, -1)`) around optical micrograph center without distorting the polar coordinate system, degree markers, or fast-axis vectors.
- Automated reset of mirror flip toggles on micrograph clearance and filter mode preservation during image processing adjustments.
- URL deep-link parameter support (`?flipX=1&flipY=1`) for shareable and reproducible microscope overlay configurations.
- Automated end-to-end regression tests covering mirror state transitions, multi-surface synchronization, and 4K publication export compatibility.

## v3.1.0 - 2026-09-17

### Added
- Micro-area polar plot & optical micrograph overlay engine (Tab 7: 样品叠加).
- Prioritized polar plot presentation with clean darkroom coordinate grid and subtle lab micro-dots.
- Fully on-demand optical micrograph loading with drag-and-drop, file chooser, and preset linkage buttons.
- Optical micrograph Pan & Zoom (Ctrl + Wheel to zoom, Middle-click / Ctrl + Left-drag to pan).
- Fast-axis angle and crystal cleavage offset angle Delta-theta = |theta_max - theta_align| real-time solver in academic info badge.
- Billboarded upright text rendering for angle labels (0°, 90°, 180°, 270°) and fast axis callouts during rotation.
- Quick rotation steppers (-5° / -1° / 0° / +1° / +5°) and Shift + Wheel smooth rotation for crystal alignment.
- Canvas overlay quick HUD drawer with 4-corner anti-occlusion docking.
- High-contrast scientific color themes (Emerald, Amber, Platinum, PRL, IEEE, Dark Lab).
- Publication-grade 4K / 300DPI lossless image export (.png, .jpg, .webp).

### Fixed
- Fixed scientific metric discrepancy: unified Malus fit peak angle across fast-axis rays, academic badges, and summary cards to theta_max = 103.2°.
- Removed automatic injection of synthetic reference micrographs on initialization and preset switching.
- Resolved canvas label inversion during rotation by introducing screen-aligned billboarded transforms.

### Compatibility
- Fully backward compatible with v3.0.0 recipes, datasets, and exports.

## v3.0.0 - 2026-08-19

### Added
- Independent-cycle analysis with source-membership auditing.
- Parser diagnostics, quality gating, uncertainty estimates, source fingerprints, experiment metadata, and reproducible analysis recipes.
- Automated scientific-integrity, asset, syntax, browser, and CI checks.

### Changed
- Raw pass-through with no negative clipping is now the safe default.
- Hidden groups are excluded from statistics, smoothing, fitting, reports, and exports.
- Excel exports contain data and provenance worksheets without embedded charts.
- Reports distinguish conditional modulation metrics from calibrated physical claims.

### Fixed
- Rejected malformed input instead of silently treating numeric header fragments as measurements.
- Rejected singular or underdetermined harmonic fits.
- Prevented blocked analyses and overlapping diagnostic windows from producing reportable derived statistics.
- Repaired extension-tab reuse without adding broader browser permissions.

### Compatibility
The default preprocessing and grouping semantics changed. Existing users should review saved workflows and explicitly select legacy sliding-window diagnostics only when required.

## v2.5.0 - 2026-08-18

### Added

- Added explicit analysis-participation status and a one-click restore-all-groups control.
- Recorded analysed and excluded groups in CSV, Excel, and standalone HTML reports.

### Changed

- Generated report plots now use only groups participating in the current analysis.
- Preserved zero-valued group measurements in CSV exports.

### Fixed

- Corrected XLSX ZIP header byte order so Microsoft Excel opens exported workbooks without repair.

### Compatibility

- Backward compatible; no migration is required.
