# PolarisView — Polarization Analysis and Transparent Preprocessing Workspace

[中文说明](README.md)

PolarisView is a Chrome extension for previewing, transparently preprocessing, analysing, fitting, and reporting half-wave-plate rotation polarization measurements.

## Use cases

PolarisView is designed for polarization-optics workflows such as rotating-HWP/analyzer intensity scans. It is especially useful for:

- Quickly comparing repeated angular scans for agreement in peak position, amplitude, and periodicity.
- Making detector background, baseline processing, and clipping decisions visible instead of presenting only a processed curve.
- Aligning overlapping scan windows to 0–360° and calculating mean, SD, SE, RSD, modulation depth, extinction ratio, and configuration-dependent DoLP.
- Producing data, figures, and HTML/PDF reports for manuscripts, group meetings, OriginPro plotting, and experimental records.

## Key features

### Data import and quality gate

- Supports editable point tables, pasted text, and dropped `.txt` / `.csv` / `.dat` files, with UTF-8 and GBK decoding attempts.
- Accepts two-column `x, intensity` or one-column intensity input; the physical angle is explicitly defined as `x × angle multiplier`.
- Audits usable-point count, angular coverage, duplicate x values, ordering, cycle coherence, clipping, phase locking, and fitting state.
- Opens with an empty workspace. The shipped `Pol.txt` is an optional example, preventing confusion between sample and user measurements.

### Transparent preprocessing

The app provides constant-offset, AsLS, airPLS, SNIP, rubberband, polynomial, linear-drift, and moving-minimum baseline models. The active equation, parameters, background contribution, and net peak are shown in the UI. Exports retain:

1. Raw intensity (`Raw_Y`)
2. Estimated baseline (`Baseline_Y`)
3. Unclamped net intensity (`Unclamped_Subtracted_Y`)
4. Displayed and analysed net intensity (`Displayed_Subtracted_Y`)

### Polar plots, fitting, and statistics

- Produces polar, Cartesian, baseline, residual, and combined views.
- Draws pale `Imin` / `Imax` reference rings to help readers inspect the DoLP range; these references are not fit data.
- Offers Gaussian, Savitzky–Golay, Fourier, and moving-average display smoothing plus periodic spline curves.
- Uses an empirical harmonic least-squares model to assess response consistency and report R², RMSE, residuals, and outlier flags.
- Calculates per-angle mean, SD, SE, RSD, extinction ratio, and modulation depth across three scan windows.

## Export and collaboration

| Output | Contents |
|---|---|
| PNG / SVG | Publication-ready image of the current view |
| CSV | Raw, baseline, unclamped/displayed net values, and statistics |
| Excel (`.xlsx`) | `OriginPro_Data`, `Raw_Preprocessing`, and `Processing_Notes` data/provenance worksheets, with no embedded charts |
| HTML | A self-contained offline report with embedded images, tables, and processing records |
| PDF | Print the report page and select “Save as PDF” in the system dialog |

In `OriginPro_Data`, column A is angle, B–D are repeated scans, and E–H are mean and error statistics. The workbook intentionally contains no polar or other Excel charts, keeping data inspection and subsequent OriginPro plotting clean.

## Installation and quick start

1. Download or clone this repository.
2. Open `chrome://extensions` in Chrome and enable **Developer mode**.
3. Click **Load unpacked** and select the repository root.
4. Open the workspace and import data. Confirm the angle multiplier and scan windows, then select an appropriate baseline and display mode.
5. Review the **Data quality and claim boundaries** card. If cycle coherence is low, check x values, acquisition order, angular zero, and instrument state before averaging.

## Scientific interpretation boundaries

This tool provides transparent processing and model-consistency evidence; it does not replace instrument calibration or a complete polarimetric measurement. In particular:

- Using `min(y)` as a constant offset is a data-driven display reference, not an independent dark-field measurement.
- Negative-value clipping can inflate processed DoLP or extinction ratio; inspect the unclamped values as well.
- Automatic phase locking is for visualization only, not mechanical-zero calibration or repeatability assessment.
- A single intensity scan plus an empirical harmonic fit cannot independently calibrate retardance or a full Stokes vector. Robust conclusions need dark/blank measurements, known input states, analyser-zero calibration, and repeats.

## Project layout

```text
index.html                     Main workspace UI
js/app.js                      Processing-pipeline coordinator
js/core/parser.js              Parsing, slicing, and statistics
js/core/data-quality.js        Quality checks and claim boundaries
js/algorithms/                 Baseline, filter, and fitting engines
js/ui/chart-manager.js         Interactive visualizations
js/ui/report-engine.js         PDF/HTML report generation
js/core/xlsx-exporter.js       OriginPro-friendly Excel export
Pol.txt                        Optional measured example
```

## Version

Current extension version: **v2.4.0**.
