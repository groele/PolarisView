# PolarisView — Polarization Analysis and Transparent Preprocessing Workspace

[中文说明](README.md)

PolarisView is a Chrome extension for previewing, transparently preprocessing, analysing, fitting, and reporting half-wave-plate rotation polarization measurements.

## Use cases

PolarisView is designed for polarization-optics workflows such as rotating-HWP/analyzer intensity scans. It is especially useful for:

- Quickly comparing repeated angular scans for agreement in peak position, amplitude, and periodicity.
- Making detector background, baseline processing, and clipping decisions visible instead of presenting only a processed curve.
- Splitting a continuous scan into non-overlapping 360° independent cycles and calculating mean, SD, SE, RSD, a modulation proxy, and extinction ratio.
- Producing data, figures, and HTML/PDF reports for manuscripts, group meetings, OriginPro plotting, and experimental records.

## Key features

### Data import and quality gate

- Supports editable point tables, pasted text, and dropped `.txt` / `.csv` / `.dat` files, with UTF-8 and GBK decoding attempts.
- Accepts two-column `x, intensity` or one-column intensity input; mixed headers and extra numeric columns are rejected with line-level diagnostics.
- Audits point count, angular coverage, duplicate x values, ordering, cycle coherence, reused source points, clipping, phase alignment, and fit-matrix stability.
- Hiding a data group from the legend also excludes it from mean, SD/SE, smoothing, and harmonic fitting; showing it again immediately restores it to analysis.
- Independent-cycle mode is the default and counts each source point exactly once; legacy sliding windows are diagnostic only.
- A `blocked` quality state suppresses reportable KPIs and physical parameters while preserving raw-data diagnostic export.
- Opens with an empty workspace. The shipped `Pol.txt` is an optional example, preventing confusion between sample and user measurements.

### Transparent preprocessing

The safe default is raw pass-through with no inferred baseline and no negative clipping. Optional models include constant offset, AsLS, airPLS, SNIP, rubberband, polynomial, linear drift, and moving minimum. Exports retain:

1. Raw intensity (`Raw_Y`)
2. Estimated baseline (`Baseline_Y`)
3. Unclamped net intensity (`Unclamped_Subtracted_Y`)
4. Displayed and analysed net intensity (`Displayed_Subtracted_Y`)

### Polar plots, fitting, and statistics

- Produces polar, Cartesian, baseline, residual, and combined views.
- Draws pale `Imin` / `Imax` reference rings only when the quality gate allows reporting; these references are not fit data.
- Offers Gaussian, Savitzky–Golay, Fourier, and moving-average display smoothing plus periodic spline curves.
- Uses an empirical harmonic least-squares model with rank and condition checks; reports degrees of freedom, R², RMSE, coefficient uncertainty, 95% CIs for θ₀ and the modulation proxy, residuals, and outlier flags.
- Calculates per-angle mean, SD, SE, RSD, extinction ratio, and modulation across independent cycles; a single cycle does not receive a fabricated SE.

## Export and collaboration

| Output | Contents |
|---|---|
| PNG / SVG | Publication-ready image of the current view |
| CSV | Raw, baseline, unclamped/displayed net values, and statistics |
| Excel (`.xlsx`) | `OriginPro_Data`, `Raw_Preprocessing`, `Processing_Notes`, and `Analysis_Recipe` worksheets, with no embedded charts |
| HTML | A self-contained offline report with embedded images, tables, and processing records |
| PDF | Print the report page and select “Save as PDF” in the system dialog |

In `OriginPro_Data`, column A is angle, B–D are up to three independent-cycle slots, and E–I are mean, uncertainty, and sample-count fields. Exports record the Analysis ID, app version, source SHA-256, parser diagnostics, experimental metadata, processing recipe, group participation, and quality state.

## Installation and quick start

1. Download or clone this repository.
2. Open `chrome://extensions` in Chrome and enable **Developer mode**.
3. Click **Load unpacked** and select the repository root.
4. Open the workspace and import data. Confirm the angle multiplier and independent-cycle grouping, then enable baseline processing only when supported by experimental evidence.
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

Current extension version: **v3.0.0**.
