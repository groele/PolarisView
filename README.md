# PolarisView — 偏振数据分析与透明预处理工作台

> Chrome 扩展，用于半波片旋转测量的偏振数据预览、可追溯预处理、统计分析、马吕斯模型拟合和学术报告导出。
> A Chrome extension for previewing, transparently preprocessing, analysing, fitting, and reporting half-wave-plate rotation polarization measurements.

## 应用场景 | Use cases

PolarisView 面向旋转半波片—检偏器强度扫描等偏振光学实验。它特别适合以下工作：

- 快速检查一组或多组旋转扫描是否在峰位、幅度和周期上相互一致。
- 将探测器暗背景、基线处理和截断状态明确呈现，避免只看到“处理后曲线”。
- 将覆盖的多段扫描对齐到 0–360°，计算均值、SD、SE、RSD、调制度、消光比和处理配置下的 DoLP。
- 输出可用于论文图、组会汇报、OriginPro 二次作图和实验记录归档的图表、数据、HTML/PDF 报告。

PolarisView is designed for polarization-optics workflows such as rotating-HWP/analyzer intensity scans. Typical uses include:

- Checking whether repeated angular scans agree in phase, amplitude, and periodicity.
- Making detector-background and baseline decisions visible instead of showing only a processed curve.
- Aligning overlapping scan windows to 0–360° and calculating mean, SD, SE, RSD, modulation depth, extinction ratio, and configuration-dependent DoLP.
- Producing publication figures, OriginPro-ready data, and shareable HTML/PDF experiment records.

## 核心功能 | Key features

### 数据导入与质量门 | Data import and quality gate

- 支持表格逐点编辑、文本粘贴、拖放 `.txt` / `.csv` / `.dat`，自动尝试 UTF-8 与 GBK 解码。
- 支持 `x, intensity` 两列或单列强度数据；物理角度由 `x × angle multiplier` 显式定义。
- 自动检查有效点数、角度覆盖、重复 x、乱序、三段周期一致性、负值截断、相位锁定和拟合状态。
- 工作台首次打开保持空白；`Pol.txt` 仅作为可选示例，避免示例曲线与用户实测数据混淆。

- Supports editable point tables, pasted text, and dropped `.txt` / `.csv` / `.dat` files, with UTF-8 and GBK decoding attempts.
- Accepts two-column `x, intensity` or one-column intensity input; the physical angle is explicitly `x × angle multiplier`.
- Audits usable-point count, angular coverage, duplicate x values, ordering, cycle coherence, clipping, phase locking, and fitting state.
- Opens with an empty workspace; the shipped `Pol.txt` is an optional example, preventing confusion between sample and user measurements.

### 透明预处理 | Transparent preprocessing

提供恒定偏置、AsLS、airPLS、SNIP、Rubberband、多项式、线性漂移和滑动极小值等背景模型。界面显示当前方程、参数、背景占比和净峰值；导出时同时保留：

1. 原始强度 (`Raw_Y`)
2. 估计基线 (`Baseline_Y`)
3. 未截断净值 (`Unclamped_Subtracted_Y`)
4. 显示/分析净值 (`Displayed_Subtracted_Y`)

The app provides constant-offset, AsLS, airPLS, SNIP, rubberband, polynomial, linear-drift, and moving-minimum baseline models. The active equation, parameters, background contribution, and net peak are shown in the UI. Exports retain raw intensity, estimated baseline, unclamped net intensity, and displayed/analysed net intensity separately.

### 极坐标、拟合与统计 | Polar plots, fitting, and statistics

- 生成极坐标图、角度展开图、基线图、残差图和双联视图。
- 以浅灰虚线参考环标示当前 `Imin` / `Imax`，帮助读者理解 DoLP 的读数范围；参考环不参与拟合。
- 提供高斯、Savitzky–Golay、傅里叶和滑动平均平滑显示，以及周期样条曲线。
- 使用经验谐波最小二乘模型评估强度曲线一致性，并给出 R²、RMSE、残差和离群点提示。
- 统计三段扫描的逐角度均值、SD、SE、RSD、消光比和调制度。

- Produces polar, Cartesian, baseline, residual, and combined views.
- Draws pale `Imin` / `Imax` reference rings to help readers inspect the DoLP range; these references are not fit data.
- Offers Gaussian, Savitzky–Golay, Fourier, and moving-average display smoothing plus periodic spline curves.
- Uses an empirical harmonic least-squares model to assess response consistency and report R², RMSE, residuals, and outlier flags.
- Calculates per-angle mean, SD, SE, RSD, extinction ratio, and modulation depth across three scan windows.

## 导出与协作 | Export and collaboration

| 输出 | 内容 | Output |
|---|---|---|
| PNG / SVG | 当前图形的出版级图像 | Publication-ready current view |
| CSV | 原始、基线、未截断/显示净值与统计数据 | Raw, baseline, both net-signal variants, statistics |
| Excel (`.xlsx`) | `Polar_Preview`、`OriginPro_Data`、`Raw_Preprocessing`、`Processing_Notes` | Readable workbook with native chart and provenance |
| HTML | 内嵌图像、表格和处理记录的独立离线报告 | Self-contained offline report |
| PDF | 在报告页打开系统打印窗口后选择“另存为 PDF” | Print the report and choose “Save as PDF” |

`OriginPro_Data` 的 A 列为角度，B–D 为三条重复扫描，E–H 为均值与误差统计，可直接作为 OriginPro 作图数据源。Excel 的 `Polar_Preview` 采用原生 XY 图：`X = I cos(θ)`、`Y = I sin(θ)`；辅助 X/Y 列默认隐藏但可取消隐藏。

In `OriginPro_Data`, column A is angle, B–D are repeats, and E–H are mean/error statistics. `Polar_Preview` contains a native Excel XY polar-coordinate view: `X = I cos(θ)` and `Y = I sin(θ)`. Helper X/Y columns are preserved but hidden by default.

## 安装与使用 | Installation and quick start

1. 从本仓库下载或克隆源码。
   Download or clone this repository.
2. 在 Chrome 打开 `chrome://extensions`，启用“开发者模式”。
   Open `chrome://extensions` and enable **Developer mode**.
3. 点击“加载已解压的扩展程序”，选择本项目根目录。
   Click **Load unpacked** and select the repository root.
4. 点击扩展图标，或打开工作台后导入数据。确认角度倍率及三段扫描窗口，再选择需要的基线和显示方式。
   Open the workspace, import data, confirm the angle multiplier and scan windows, then select an appropriate baseline and display mode.
5. 在“数据质量与结论边界”卡片检查警示；若周期一致性偏低，请先核查 x 列、采样顺序、角度零位和仪器状态。
   Review **Data quality and claim boundaries**. If cycle coherence is low, check x values, acquisition order, angular zero, and instrument state before averaging.

## 科研解释边界 | Scientific interpretation boundaries

本工具提供的是数据处理与模型一致性证据，并不自动替代仪器校准或完整偏振测量。尤其应注意：

- 以 `min(y)` 作为常数偏置只是数据驱动的显示基准，不等同独立暗场测量。
- 启用负值截断可能抬高处理后的 DoLP 或消光比；请同时检查未截断列。
- 自动相位锁定只用于可视化对齐，不能替代机械零位校准，也不应用于评价真实重复性。
- 单次强度扫描与经验谐波拟合不能独立标定波片延迟或完整 Stokes 矢量。严谨结论应结合暗场、空白、已知输入态、检偏器零位及重复测量。

This tool provides transparent processing and model-consistency evidence; it does not replace instrument calibration or a complete polarimetric measurement. In particular:

- Using `min(y)` as a constant offset is a data-driven display reference, not an independent dark-field measurement.
- Negative-value clipping can inflate processed DoLP or extinction ratio; inspect the unclamped values as well.
- Automatic phase locking is for visualization only, not mechanical-zero calibration or repeatability assessment.
- A single intensity scan plus an empirical harmonic fit cannot independently calibrate retardance or a full Stokes vector. Robust conclusions need dark/blank measurements, known input states, analyzer-zero calibration, and repeats.

## 项目结构 | Project layout

```text
index.html                     Main workspace UI
js/app.js                      Processing-pipeline coordinator
js/core/parser.js              Parsing, slicing, and statistics
js/core/data-quality.js        Quality checks and claim boundaries
js/algorithms/                 Baseline, filter, and fitting engines
js/ui/chart-manager.js         Interactive visualizations
js/ui/report-engine.js         PDF/HTML report generation
js/core/xlsx-exporter.js       OriginPro-friendly Excel export
Pol.txt                        Canonical measured sample
```

## 版本 | Version

Current extension version: **v2.4.0**.
