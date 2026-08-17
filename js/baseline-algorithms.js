/**
 * baseline-algorithms.js
 * 专为光学测量与偏振光谱设计的多种背景基线估计与移除算法引擎
 * 提供全透明数学模型、拟合参数解构与实时遥测指标
 */

const BaselineAlgorithms = {
  /**
   * 1. 恒定背景 (Constant / Dark Current / Min Value)
   */
  constantBaseline(yData, options = {}) {
    const n = yData.length;
    if (n === 0) return { baseline: [], details: {} };
    const mode = options.mode || 'min';
    let bgVal = 0;
    const yMin = Math.min(...yData);
    const yMax = Math.max(...yData);

    if (mode === 'min') {
      bgVal = yMin;
    } else if (mode === 'custom') {
      bgVal = typeof options.value === 'number' ? options.value : 0;
    } else if (mode === 'bottom_avg') {
      const sorted = [...yData].sort((a, b) => a - b);
      const count = Math.max(1, Math.floor((n * (options.percent || 10)) / 100));
      const sum = sorted.slice(0, count).reduce((a, b) => a + b, 0);
      bgVal = sum / count;
    }

    const baseline = new Array(n).fill(Number(bgVal.toFixed(2)));
    return {
      baseline,
      details: {
        mode,
        bgVal: Number(bgVal.toFixed(2)),
        yMin: Number(yMin.toFixed(2)),
        yMax: Number(yMax.toFixed(2)),
        bgRatioPercent: Number(((bgVal / (yMax || 1)) * 100).toFixed(2)),
        formulaText: 'y_{\\text{sub}}(x) = \\max(0,\\, y(x) - I_{\\text{bg}})',
        dynamicEquation: `y_{\\text{sub}}(x) = y(x) - ${bgVal.toFixed(1)}`
      }
    };
  },

  /**
   * 2. 线性漂移基线 (Linear Baseline)
   */
  linearBaseline(yData, xData = null, options = {}) {
    const n = yData.length;
    if (n <= 1) return { baseline: [...yData], details: {} };
    const x = xData || yData.map((_, i) => i);
    const mode = options.mode || 'endpoints';
    let slope = 0;
    let intercept = 0;

    if (mode === 'endpoints') {
      const k = Math.min(3, Math.floor(n / 2));
      const yStart = yData.slice(0, k).reduce((a, b) => a + b, 0) / k;
      const yEnd = yData.slice(n - k).reduce((a, b) => a + b, 0) / k;
      const xStart = x.slice(0, k).reduce((a, b) => a + b, 0) / k;
      const xEnd = x.slice(n - k).reduce((a, b) => a + b, 0) / k;

      slope = (xEnd - xStart === 0) ? 0 : (yEnd - yStart) / (xEnd - xStart);
      intercept = yStart - slope * xStart;
    } else {
      let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
      for (let i = 0; i < n; i++) {
        sumX += x[i];
        sumY += yData[i];
        sumXY += x[i] * yData[i];
        sumXX += x[i] * x[i];
      }
      slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
      intercept = (sumY - slope * sumX) / n;
    }

    const baseline = x.map(xi => Number((slope * xi + intercept).toFixed(2)));
    const totalDrift = slope * (x[n - 1] - x[0]);

    return {
      baseline,
      details: {
        mode,
        slope: Number(slope.toFixed(4)),
        intercept: Number(intercept.toFixed(2)),
        totalDrift: Number(totalDrift.toFixed(2)),
        formulaText: 'z(x) = k \\cdot x + b, \\quad y_{\\text{sub}}(x) = y(x) - z(x)',
        dynamicEquation: `z(x) = ${slope >= 0 ? '' : '-'}${Math.abs(slope).toFixed(3)} \\cdot x ${intercept >= 0 ? '+' : '-'} ${Math.abs(intercept).toFixed(1)}`
      }
    };
  },

  /**
   * 3. 多项式拟合基线 (Polynomial Baseline Fit)
   */
  polynomialBaseline(yData, xData = null, degree = 2) {
    const n = yData.length;
    if (n <= degree) return { baseline: [...yData], details: {} };
    const x = xData || yData.map((_, i) => i);
    degree = Math.max(1, Math.min(5, degree));

    const xMin = Math.min(...x);
    const xMax = Math.max(...x);
    const xSpan = (xMax - xMin) || 1;
    const normX = x.map(v => (v - xMin) / xSpan);

    const m = degree + 1;
    const ATA = Array.from({ length: m }, () => new Float64Array(m));
    const ATY = new Float64Array(m);

    for (let i = 0; i < n; i++) {
      const xi = normX[i];
      const yi = yData[i];
      const powers = [1];
      for (let p = 1; p <= 2 * degree; p++) {
        powers[p] = powers[p - 1] * xi;
      }

      for (let r = 0; r < m; r++) {
        ATY[r] += yi * powers[r];
        for (let c = 0; c < m; c++) {
          ATA[r][c] += powers[r + c];
        }
      }
    }

    const coeffs = this.solveGaussian(ATA, ATY, m);
    if (!coeffs) {
      return { baseline: new Array(n).fill(yData[0]), details: {} };
    }

    const baseline = normX.map(xi => {
      let val = 0;
      let pX = 1;
      for (let d = 0; d < m; d++) {
        val += coeffs[d] * pX;
        pX *= xi;
      }
      return Number(val.toFixed(2));
    });

    // 格式化方程文本 (以原始 x_norm 展开)
    let eqParts = [];
    for (let d = degree; d >= 0; d--) {
      const c = coeffs[d];
      if (Math.abs(c) > 1e-4) {
        if (d === 0) eqParts.push(`${c > 0 && eqParts.length > 0 ? '+' : ''}${c.toFixed(1)}`);
        else if (d === 1) eqParts.push(`${c > 0 && eqParts.length > 0 ? '+' : ''}${c.toFixed(2)}x_n`);
        else eqParts.push(`${c > 0 && eqParts.length > 0 ? '+' : ''}${c.toFixed(2)}x_n^${d}`);
      }
    }

    return {
      baseline,
      details: {
        degree,
        coeffs: Array.from(coeffs).map(v => Number(v.toFixed(3))),
        formulaText: 'z(x) = \\sum_{k=0}^{d} c_k x^k, \\quad (A^T A) c = A^T y',
        dynamicEquation: `z(x) = ${eqParts.join(' ')}`
      }
    };
  },

  solveGaussian(A, B, n) {
    for (let i = 0; i < n; i++) {
      let maxEl = Math.abs(A[i][i]);
      let maxRow = i;
      for (let k = i + 1; k < n; k++) {
        if (Math.abs(A[k][i]) > maxEl) {
          maxEl = Math.abs(A[k][i]);
          maxRow = k;
        }
      }
      if (maxEl < 1e-12) return null;

      for (let k = i; k < n; k++) {
        const tmp = A[maxRow][k];
        A[maxRow][k] = A[i][k];
        A[i][k] = tmp;
      }
      const tmpB = B[maxRow];
      B[maxRow] = B[i];
      B[i] = tmpB;

      for (let k = i + 1; k < n; k++) {
        const c = -A[k][i] / A[i][i];
        for (let j = i; j < n; j++) {
          if (i === j) A[k][j] = 0;
          else A[k][j] += c * A[i][j];
        }
        B[k] += c * B[i];
      }
    }

    const x = new Float64Array(n);
    for (let i = n - 1; i >= 0; i--) {
      x[i] = B[i] / A[i][i];
      for (let k = i - 1; k >= 0; k--) {
        B[k] -= A[k][i] * x[i];
      }
    }
    return x;
  },

  /**
   * 4. 非对称重加权最小二乘基线算法 (Asymmetric Least Squares, AsLS / ALS)
   */
  aslsBaseline(yData, lambda = 10000, p = 0.01, maxIter = 10) {
    const N = yData.length;
    if (N < 4) return { baseline: [...yData], details: {} };

    let w = new Float64Array(N).fill(1.0);
    let z = new Float64Array(yData);

    for (let iter = 0; iter < maxIter; iter++) {
      z = this.solvePentadiagonalAsls(yData, w, lambda, N);
      for (let i = 0; i < N; i++) {
        w[i] = yData[i] > z[i] ? p : (1 - p);
      }
    }

    const baseline = Array.from(z).map(v => Number(v.toFixed(2)));
    const peakWeight = p;
    const baseWeight = 1 - p;

    return {
      baseline,
      details: {
        lambda: lambda,
        lambdaLog10: Math.log10(lambda),
        p: p,
        peakSuppressionFactor: Number((baseWeight / peakWeight).toFixed(1)),
        iterations: maxIter,
        formulaText: '\\min_z \\left[ \\sum_{i} w_i (y_i - z_i)^2 + \\lambda \\sum_{i} (\\Delta^2 z_i)^2 \\right], \\quad w_i = \\begin{cases} p & y_i > z_i \\\\ 1-p & y_i \\le z_i \\end{cases}',
        dynamicEquation: `S(z) = \\sum w_i (y_i - z_i)^2 + 10^{${Math.log10(lambda).toFixed(1)}} \\sum (\\Delta^2 z_i)^2 \\quad (p=${p})`
      }
    };
  },

  solvePentadiagonalAsls(y, w, lambda, N) {
    const d0 = new Float64Array(N);
    const d1 = new Float64Array(N);
    const d2 = new Float64Array(N);
    const rhs = new Float64Array(N);

    for (let i = 0; i < N; i++) {
      let c0 = 0;
      if (i === 0 || i === N - 1) c0 = 1;
      else if (i === 1 || i === N - 2) c0 = 5;
      else c0 = 6;

      d0[i] = w[i] + lambda * c0;
      d1[i] = (i < N - 1) ? (i === 0 || i === N - 2 ? -2 : -4) * lambda : 0;
      d2[i] = (i < N - 2) ? 1 * lambda : 0;
      rhs[i] = w[i] * y[i];
    }

    for (let i = 0; i < N; i++) {
      if (i > 0) {
        const m1 = d1[i - 1] / d0[i - 1];
        d0[i] -= m1 * d1[i - 1];
        rhs[i] -= m1 * rhs[i - 1];
        if (i < N - 1) {
          d1[i] -= m1 * d2[i - 1];
        }
      }
      if (i > 1) {
        const m2 = d2[i - 2] / d0[i - 2];
        d0[i] -= m2 * d2[i - 2];
        rhs[i] -= m2 * rhs[i - 2];
      }
    }

    const z = new Float64Array(N);
    z[N - 1] = rhs[N - 1] / d0[N - 1];
    if (N > 1) {
      z[N - 2] = (rhs[N - 2] - d1[N - 2] * z[N - 1]) / d0[N - 2];
    }
    for (let i = N - 3; i >= 0; i--) {
      z[i] = (rhs[i] - d1[i] * z[i + 1] - d2[i] * z[i + 2]) / d0[i];
    }

    return z;
  },

  /**
   * 5. 滚动极小值形态学滤波基线 (Moving Minimum)
   */
  movingMinimumBaseline(yData, windowSize = 9) {
    const N = yData.length;
    if (N === 0) return { baseline: [], details: {} };
    windowSize = Math.max(3, windowSize | 1);
    const half = Math.floor(windowSize / 2);
    const mins = new Float64Array(N);

    for (let i = 0; i < N; i++) {
      let minVal = Infinity;
      for (let j = -half; j <= half; j++) {
        let idx = i + j;
        if (idx < 0) idx = 0;
        if (idx >= N) idx = N - 1;
        if (yData[idx] < minVal) minVal = yData[idx];
      }
      mins[i] = minVal;
    }

    const smoothed = [];
    for (let i = 0; i < N; i++) {
      let sum = 0, count = 0;
      for (let j = -1; j <= 1; j++) {
        const idx = i + j;
        if (idx >= 0 && idx < N) {
          sum += mins[idx];
          count++;
        }
      }
      smoothed.push(Number((sum / count).toFixed(2)));
    }

    return {
      baseline: smoothed,
      details: {
        windowSize: windowSize,
        formulaText: 'z(x) = \\text{Smooth}\\left( \\min_{j \\in [-W/2, W/2]} y(x+j) \\right)',
        dynamicEquation: `z(x) = \\text{MovingMin}(y(x), \\text{Window}=${windowSize})`
      }
    };
  },

  /**
   * 统一执行背景基线扣除与遥测指标统计
   */
  computeBaselineAndSubtract(yData, xData = null, algorithm = 'none', options = {}, clampZero = true) {
    if (!yData || yData.length === 0) {
      return { baseline: [], subtracted: [], hasSubtracted: false, details: {}, telemetry: {} };
    }

    let baseline = [];
    let details = {};

    switch (algorithm) {
      case 'constant': {
        const res = this.constantBaseline(yData, options);
        baseline = res.baseline;
        details = res.details;
        break;
      }
      case 'linear': {
        const res = this.linearBaseline(yData, xData, options);
        baseline = res.baseline;
        details = res.details;
        break;
      }
      case 'polynomial': {
        const res = this.polynomialBaseline(yData, xData, options.degree || 2);
        baseline = res.baseline;
        details = res.details;
        break;
      }
      case 'asls': {
        const res = this.aslsBaseline(yData, options.lambda || 10000, options.p || 0.01);
        baseline = res.baseline;
        details = res.details;
        break;
      }
      case 'moving_min': {
        const res = this.movingMinimumBaseline(yData, options.windowSize || 9);
        baseline = res.baseline;
        details = res.details;
        break;
      }
      case 'none':
      default:
        baseline = new Array(yData.length).fill(0);
        return {
          baseline: baseline,
          subtracted: [...yData],
          hasSubtracted: false,
          details: {
            formulaText: 'y_{\\text{sub}}(x) = y(x)',
            dynamicEquation: 'y_{\\text{sub}}(x) = y(x) \\quad (未扣除背景)'
          },
          telemetry: {
            bgMin: 0,
            bgMax: 0,
            bgMean: 0,
            subMax: Math.max(...yData),
            subMin: Math.min(...yData),
            bgRatioPercent: 0,
            extinctionImprovement: 1
          }
        };
    }

    // 执行扣除
    let clampedCount = 0;
    const subtracted = yData.map((y, i) => {
      const diff = y - baseline[i];
      if (diff < 0 && clampZero) clampedCount++;
      return clampZero ? Math.max(0, Number(diff.toFixed(2))) : Number(diff.toFixed(2));
    });

    // 遥测分析
    const bgMin = Math.min(...baseline);
    const bgMax = Math.max(...baseline);
    const bgMean = baseline.reduce((a, b) => a + b, 0) / baseline.length;
    const rawMax = Math.max(...yData);
    const rawMin = Math.min(...yData);
    const subMax = Math.max(...subtracted);
    const subMin = Math.min(...subtracted);

    const rawER = rawMin > 0 ? rawMax / rawMin : Infinity;
    const subER = subMin > 0 ? subMax / subMin : (subMax > 0 ? Infinity : 1);
    const extinctionImprovement = rawER > 0 && Number.isFinite(subER) ? (subER / rawER) : (subER === Infinity ? 999 : 1);

    const telemetry = {
      bgMin: Number(bgMin.toFixed(2)),
      bgMax: Number(bgMax.toFixed(2)),
      bgMean: Number(bgMean.toFixed(2)),
      subMax: Number(subMax.toFixed(2)),
      subMin: Number(subMin.toFixed(2)),
      bgRatioPercent: Number(((bgMean / (rawMax || 1)) * 100).toFixed(2)),
      clampedPointsCount: clampedCount,
      extinctionImprovement: Number.isFinite(extinctionImprovement) ? Number(extinctionImprovement.toFixed(2)) : '∞'
    };

    return {
      baseline,
      subtracted,
      hasSubtracted: true,
      details,
      telemetry
    };
  }
};

// 导出
if (typeof window !== 'undefined') {
  window.BaselineAlgorithms = BaselineAlgorithms;
}
