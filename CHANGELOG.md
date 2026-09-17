# Changelog

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
