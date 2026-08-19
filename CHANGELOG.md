# Changelog

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
