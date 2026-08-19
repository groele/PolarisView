# PolarisView v3.0.0

## Overview

PolarisView v3.0.0 upgrades the extension from a visualization-focused workspace to a transparent, quality-gated scientific preview and preprocessing platform. The release prioritizes traceable data handling, independent-repeat statistics, explicit claim boundaries, and reproducible exports.

## Breaking changes

- The default baseline is now raw pass-through instead of a data-derived constant offset.
- Negative-value clipping is disabled by default.
- Independent non-overlapping 360-degree cycles replace overlapping sliding windows as the default grouping mode.
- Legacy sliding windows are diagnostic only and enter a blocked quality state when source points are reused.
- Excel workbooks no longer embed charts; they provide OriginPro-ready data and provenance worksheets.
- Blocked analyses no longer expose derived KPIs, fit curves, uncertainty statistics, or reportable fit parameters.

## Affected configuration and data

No source measurements are modified. Results may differ from v2.5.0 because the default baseline, clipping, grouping, and reporting rules changed. Stored display preferences remain compatible, but processing assumptions must be reviewed.

## Migration

1. Re-import the original measurement file.
2. Confirm the angle multiplier and independent-cycle boundaries.
3. Leave baseline processing disabled unless supported by a dark or blank measurement.
4. Review the parser diagnostics and quality-gate status.
5. Export a new analysis recipe and do not compare v2.5.0 and v3.0.0 derived metrics without matching preprocessing settings.

## Compatibility limits

Conditional modulation and extinction metrics are not substitutes for a calibrated Stokes or Mueller measurement. A single scan cannot independently establish retardance, full polarization state, or instrument accuracy.

## Verification

- `npm run check`
- Microsoft Excel read-only open of the generated four-sheet workbook without repair prompts
- XLSX ZIP structure and no-chart regression checks
- Independent-cycle, parser, fit conditioning, quality-gate, and blocked-export tests
- HTML/manifest ID and local-asset validation

The local Windows Chrome and Edge headless processes were blocked by a system GPU-process failure. The browser smoke test is included in GitHub Actions for execution in a clean runner.

## Rollback

The previous release remains available as tag `v2.5.0`. Check out that tag to restore the earlier processing defaults. Preserve original measurement files and analysis recipes before comparing versions.
