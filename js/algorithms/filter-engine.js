/**
 * filter-engine.js (Filter & Interpolation Engine - Hardened)
 * 强化版平滑滤波引擎：高斯、S-G、傅里叶谐波与 360 点三次 Hermite 周期样条插值（零除与短数组安全）
 */

class FilterEngine {
  static applyFilter(dataArray, type = 'gaussian', options = {}) {
    if (!Array.isArray(dataArray) || dataArray.length < 3) {
      return Array.isArray(dataArray) ? [...dataArray] : [];
    }

    try {
      switch (type) {
        case 'gaussian':
          return this.gaussianFilter(dataArray, options.sigma || 1.2);
        case 'sg':
          return this.savitzkyGolay(dataArray, options.windowSize || 5);
        case 'fourier':
          return this.fourierFilter(dataArray, options.harmonics || 4);
        case 'moving_avg':
          return this.movingAverage(dataArray, options.windowSize || 3);
        case 'none':
        default:
          return [...dataArray];
      }
    } catch (e) {
      console.warn('滤波算法运算异常，安全回退至原始均值:', e);
      return [...dataArray];
    }
  }

  static gaussianFilter(data, sigma = 1.2) {
    const n = data.length;
    if (n < 3) return [...data];

    const safeSigma = Math.max(0.1, Number(sigma) || 1.2);
    const radius = Math.max(1, Math.min(Math.ceil(safeSigma * 3), Math.floor(n / 2)));
    const kernel = [];
    let kernelSum = 0;

    for (let i = -radius; i <= radius; i++) {
      const w = Math.exp(-(i * i) / (2 * safeSigma * safeSigma));
      kernel.push(w);
      kernelSum += w;
    }
    const normKernel = kernel.map(k => k / (kernelSum || 1));

    const result = new Array(n);
    for (let i = 0; i < n; i++) {
      let val = 0;
      for (let k = -radius; k <= radius; k++) {
        const idx = ((i + k) % n + n) % n;
        val += data[idx] * normKernel[k + radius];
      }
      result[i] = Number(val.toFixed(2));
    }
    return result;
  }

  static savitzkyGolay(data, windowSize = 5) {
    const n = data.length;
    if (n < 5) return this.gaussianFilter(data, 1.0);

    const win = Math.min(n % 2 === 0 ? n - 1 : n, Math.max(5, windowSize % 2 === 0 ? windowSize + 1 : windowSize));
    let coeffs = [-3, 12, 17, 12, -3];
    let norm = 35;

    if (win === 7) {
      coeffs = [-2, 3, 6, 7, 6, 3, -2];
      norm = 21;
    } else if (win === 9) {
      coeffs = [-21, 14, 39, 54, 59, 54, 39, 14, -21];
      norm = 231;
    }

    const half = Math.floor(coeffs.length / 2);
    const result = new Array(n);

    for (let i = 0; i < n; i++) {
      let sum = 0;
      for (let k = -half; k <= half; k++) {
        const idx = ((i + k) % n + n) % n;
        sum += data[idx] * coeffs[k + half];
      }
      result[i] = Number((sum / (norm || 1)).toFixed(2));
    }
    return result;
  }

  static fourierFilter(data, harmonics = 4) {
    const n = data.length;
    if (n < 4) return [...data];

    const safeH = Math.max(1, Math.min(harmonics || 4, Math.floor(n / 2) - 1));
    const re = new Array(safeH + 1).fill(0);
    const im = new Array(safeH + 1).fill(0);

    for (let k = 0; k <= safeH; k++) {
      for (let t = 0; t < n; t++) {
        const angle = (2 * Math.PI * k * t) / n;
        re[k] += data[t] * Math.cos(angle);
        im[k] -= data[t] * Math.sin(angle);
      }
      re[k] /= n;
      im[k] /= n;
    }

    const result = new Array(n);
    for (let t = 0; t < n; t++) {
      let val = re[0];
      for (let k = 1; k <= safeH; k++) {
        const angle = (2 * Math.PI * k * t) / n;
        val += 2 * (re[k] * Math.cos(angle) - im[k] * Math.sin(angle));
      }
      result[t] = Math.max(0, Number(val.toFixed(2)));
    }
    return result;
  }

  static movingAverage(data, windowSize = 3) {
    const n = data.length;
    if (n < 3) return [...data];

    const win = Math.max(3, windowSize % 2 === 0 ? windowSize + 1 : windowSize);
    const half = Math.floor(win / 2);
    const result = new Array(n);

    for (let i = 0; i < n; i++) {
      let sum = 0;
      for (let k = -half; k <= half; k++) {
        const idx = ((i + k) % n + n) % n;
        sum += data[idx];
      }
      result[i] = Number((sum / (win || 1)).toFixed(2));
    }
    return result;
  }

  /**
   * 周期三次 Hermite 样条插值 (含除零与距离微元保护)
   */
  static periodicSplineInterpolate(points, totalTargetPoints = 360) {
    if (!Array.isArray(points) || points.length < 2) return [];

    const n = points.length;
    const sorted = [...points].sort((a, b) => a.angle - b.angle);
    const ext = [];

    ext.push({ angle: sorted[n - 1].angle - 360, y: sorted[n - 1].y });
    sorted.forEach(p => ext.push({ ...p }));
    ext.push({ angle: sorted[0].angle + 360, y: sorted[0].y });
    ext.push({ angle: sorted[1].angle + 360, y: sorted[1].y });

    const m = ext.length;
    const tangents = new Array(m).fill(0);

    for (let i = 1; i < m - 1; i++) {
      const dt = ext[i + 1].angle - ext[i - 1].angle;
      tangents[i] = (ext[i + 1].y - ext[i - 1].y) / (dt || 1e-6);
    }

    const denseCurve = [];
    const step = 360 / totalTargetPoints;

    for (let deg = 0; deg <= 360; deg += step) {
      let segIdx = 1;
      for (let i = 1; i < m - 2; i++) {
        if (deg >= ext[i].angle && deg <= ext[i + 1].angle) {
          segIdx = i;
          break;
        }
      }

      const p0 = ext[segIdx];
      const p1 = ext[segIdx + 1];
      const m0 = tangents[segIdx];
      const m1 = tangents[segIdx + 1];

      const dt = (p1.angle - p0.angle) || 1e-6;
      const t = Math.max(0, Math.min(1, (deg - p0.angle) / dt));

      const yVal = this.interpolateHermite(p0.y, p1.y, m0, m1, t, dt);
      denseCurve.push([Math.round(deg), Math.max(0, Number(yVal.toFixed(2)))]);
    }

    return denseCurve;
  }

  static interpolateHermite(y0, y1, m0, m1, t, dt) {
    const t2 = t * t;
    const t3 = t2 * t;
    const h00 = 2 * t3 - 3 * t2 + 1;
    const h10 = t3 - 2 * t2 + t;
    const h01 = -2 * t3 + 3 * t2;
    const h11 = t3 - t2;
    return h00 * y0 + h10 * dt * m0 + h01 * y1 + h11 * dt * m1;
  }
}

if (typeof window !== 'undefined') {
  window.FilterEngine = FilterEngine;
  window.PolarFilters = FilterEngine;
}
