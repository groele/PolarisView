# PolarisView v3.1.0

## Overview

PolarisView v3.1.0 introduces a dedicated **Micro-Area Optical Micrograph Overlay Engine** (`Tab 7: 样品叠加`), designed specifically for 2D material optoelectronics, anisotropic crystal physics, and waveplate polarization characterization.

This release prioritizes scientific workflow correctness: **the polar plot is always presented as the primary subject**, without forcing synthetic reference micrographs into the user's workspace. Optical micrographs are loaded purely on-demand, with comprehensive Pan & Zoom, crystal cleavage angle ($\Delta\theta$) calculation, frosted HUD controls, and publication-grade 4K / 300DPI export.

## Key Features & Improvements

### 1. Prioritized Polar Plot & On-Demand Micrograph Loading
- **No forced fake background**: Loading datasets or switching presets no longer injects synthetic micrographs. The canvas starts in a high-tech darkroom coordinate grid mode with subtle millimeter ticks and guidance capsules.
- **On-demand micrograph loading**: Users can import optical micrographs via drag-and-drop, the "导入光学图" file picker, or explicit "预设联动图" clicks.
- **Thumbnail integration**: Step 1 data panel displays real-time thumbnail previews, image resolution, and quick navigation back to the overlay stage.

### 2. Optical Micrograph Pan & Zoom
- **Pan**: Smoothly translate background micrographs using `Middle Mouse Drag` or `Ctrl + Left Mouse Drag` to center micro-flakes or laser spots under the polar coordinate center.
- **Zoom**: Smoothly adjust micrograph scale via `Ctrl + Wheel` (from 10% to 600%) without distorting polar plot data.
- **Center Reset**: One-click "对准微区中心" resets both polar offsets and image Pan/Zoom.

### 3. Crystal Cleavage Offset Angle ($\Delta\theta$) Solver
- **Rigorous orientation solver**: Solves $\Delta\theta = |\theta_{\max} - \theta_{\text{align}}| \pmod{180^\circ} \le 90^\circ$ in real time.
- **Unified metrics**: Fully resolved angle metric discrepancies by synchronizing the Malus fit peak angle across fast-axis rays, academic badges, and summary cards to $\theta_{\max} = 103.2^\circ$.

### 4. Screen-Aligned Billboarded Typography
- Angle tick labels (`0°`, `90°`, `180°`, `270°`) and fast-axis callout badges remain horizontally upright during rotation, preventing upside-down text.

### 5. Ergonomic Controls & Color Schemes
- **Rotation Stepper Cluster**: Fine-tune orientation with `-5°`, `-1°`, `0°`, `+1°`, `+5°` buttons or `Shift + Wheel`.
- **Overlay Quick HUD**: Floating control drawer for opacity, scale, filters, and 4-corner anti-occlusion docking.
- **High-Contrast Themes**: Dedicated palettes including Emerald, Amber, Platinum, PRL, IEEE, and Dark Lab.
- **Publication 4K Export**: Export crisp 300DPI images (`.png`, `.jpg`, `.webp`) matching onscreen framing.

## Verification
All automated test suites pass with 100% success rate:
- `node tests/check-syntax.mjs`
- `node tests/check-html.mjs`
- `node tests/run-tests.mjs`
- `node tests/overlay-smoke.mjs`
- `node tests/browser-smoke.mjs`
