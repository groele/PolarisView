/**
 * baseline-engine.js (Algorithmic Engine - 8 Algorithms Suite)
 * 8 大背景基线扣除算法库：
 * 1. 恒定常数/暗电流扣除 (Constant)
 * 2. AsLS 非对称重加权最小二乘 (AsLS)
 * 3. airPLS 自适应迭代重加权惩罚最小二乘 (airPLS - 现代光谱金标准)
 * 4. SNIP 敏感非线性迭代峰值剪切法 (SNIP - 核物理与光谱去峰经典)
 * 5. Rubberband 橡皮筋下包络凸包法 (Rubberband)
 * 6. 多项式回归基线 (Polynomial)
 * 7. 一阶线性漂移基线 (Linear)
 * 8. 滑动极小值形态学滤波 (Moving Min)
 */

class BaselineEngine {
  /**
   * 1. 恒定常数背景扣除 (Constant / Min / Dark Current)
   */
  static constantBaseline(yValues, mode = 'min', customVal = 0, clampZero = true) {
    const n = Array.isArray(yValues) ? yValues.length : 0;
    if (n === 0) return { baseline: [], subtracted: [], details: {}, telemetry: {} };

    let bgVal = 0;
    if (mode === 'min') {
      bgVal = Math.min(...yValues);
    } else if (mode === 'bottom_avg') {
      const sorted = [...yValues].sort((a, b) => a - b);
      const k = Math.max(1, Math.floor(n * 0.1));
      const bottomK = sorted.slice(0, k);
      bgVal = bottomK.reduce((a, b) => a + b, 0) / k;
    } else if (mode === 'custom') {
      bgVal = Number.isFinite(customVal) ? customVal : 0;
    }

    bgVal = Number.isFinite(bgVal) ? bgVal : 0;
    const baseline = new Array(n).fill(Number(bgVal.toFixed(2)));
    const unboundedSubtracted = yValues.map(y => Number((y - bgVal).toFixed(2)));
    const subtracted = unboundedSubtracted.map(sub => {
      return clampZero ? Math.max(0, Number(sub.toFixed(2))) : Number(sub.toFixed(2));
    });

    const subMax = subtracted.length > 0 ? Math.max(...subtracted) : 0;
    const subMin = subtracted.length > 0 ? Math.min(...subtracted) : 0;
    const denom = bgVal + subMax;

    const telemetry = {
      bgMin: Number(bgVal.toFixed(2)),
      bgMax: Number(bgVal.toFixed(2)),
      bgMean: Number(bgVal.toFixed(2)),
      subMax: subMax,
      subMin: subMin,
      bgRatioPercent: denom > 1e-4 ? Number(((bgVal / denom) * 100).toFixed(2)) : 0,
      clampedPointsCount: clampZero ? unboundedSubtracted.filter(v => v < 0).length : 0,
      extinctionImprovement: subMin <= 1e-4 ? 999 : Number((subMax / subMin).toFixed(1))
    };

    return {
      baseline,
      subtracted,
      details: {
        algorithm: 'Constant Dark Current Baseline',
        nameZh: '恒定暗电流底噪模型',
        mode,
        bgVal: Number(bgVal.toFixed(2)),
        dynamicEquation: `y_{\\text{sub}}(x) = y(x) - ${bgVal.toFixed(1)}`
      },
      telemetry, unboundedSubtracted
    };
  }

  /**
   * 2. 非对称重加权最小二乘基线估计 (AsLS - Eilers-Boelens)
   */
  static aslsBaseline(yValues, lambda = 1e4, p = 0.01, maxIter = 15, tol = 1e-4, clampZero = true) {
    const n = Array.isArray(yValues) ? yValues.length : 0;
    if (n < 3) return this.constantBaseline(yValues, 'min', 0, clampZero);

    const safeLambda = Math.max(1, Math.min(lambda || 1e4, 1e8));
    const safeP = Math.max(0.0001, Math.min(p || 0.01, 0.5));

    let w = new Array(n).fill(1);
    let z = [...yValues];

    for (let iter = 0; iter < maxIter; iter++) {
      const zNew = this.solvePentadiagonalAsls(yValues, w, safeLambda);
      let diff = 0;
      for (let i = 0; i < n; i++) diff += Math.abs(zNew[i] - z[i]);

      z = zNew;
      if (diff / (n || 1) < tol) break;

      for (let i = 0; i < n; i++) {
        w[i] = yValues[i] > z[i] ? safeP : (1 - safeP);
      }
    }

    return this.buildBaselineResult(yValues, z, clampZero, {
      algorithm: 'AsLS Baseline Smoother (Eilers-Boelens)',
      nameZh: 'AsLS非对称最小二乘平滑',
      lambda: safeLambda,
      lambdaLog10: Math.log10(safeLambda).toFixed(1),
      p: safeP,
      dynamicEquation: `S(z) = \\sum w_i (y_i - z_i)^2 + 10^{${Math.log10(safeLambda).toFixed(1)}} \\sum (\\Delta^2 z_i)^2 \\quad (p=${safeP})`
    });
  }

  /**
   * 3. airPLS 自适应迭代重加权惩罚最小二乘法 (Zhang et al. 2010 Analyst)
   * 自动根据残差指数加权，无需手动调整非对称因子 p
   */
  static airPLSBaseline(yValues, lambda = 1e4, maxIter = 15, tol = 1e-4, clampZero = true) {
    const n = Array.isArray(yValues) ? yValues.length : 0;
    if (n < 3) return this.constantBaseline(yValues, 'min', 0, clampZero);

    const safeLambda = Math.max(10, Math.min(lambda || 1e4, 1e8));
    let w = new Array(n).fill(1);
    let z = [...yValues];

    for (let iter = 1; iter <= maxIter; iter++) {
      const zNew = this.solvePentadiagonalAsls(yValues, w, safeLambda);
      let dSum = 0;
      const d = new Array(n);

      for (let i = 0; i < n; i++) {
        d[i] = yValues[i] - zNew[i];
        if (d[i] < 0) dSum += Math.abs(d[i]);
      }

      z = zNew;
      if (dSum < 1e-5) break;

      // airPLS 指数权重自适应更新：波峰赋 0，波谷根据相对深度指数赋权
      for (let i = 0; i < n; i++) {
        if (d[i] >= 0) {
          w[i] = 0;
        } else {
          w[i] = Math.exp((iter * d[i]) / (dSum || 1));
        }
      }
    }

    return this.buildBaselineResult(yValues, z, clampZero, {
      algorithm: 'airPLS (Adaptive Iteratively Reweighted Penalized Least Squares)',
      nameZh: 'airPLS 自适应迭代重加权惩罚最小二乘',
      lambda: safeLambda,
      lambdaLog10: Math.log10(safeLambda).toFixed(1),
      maxIter,
      dynamicEquation: `w_i^{(t)} = \\begin{cases} 0, & y_i \\ge z_i \\\\ \\exp\\left(\\frac{t(y_i - z_i)}{\\sum |d_-|}\\right), & y_i < z_i \\end{cases} \\quad (\\lambda=10^{${Math.log10(safeLambda).toFixed(1)}})`
    });
  }

  /**
   * 4. SNIP 敏感非线性迭代峰值剪切法 (Statistics-sensitive Non-linear Iterative Peak-clipping)
   * 经典高能物理与高分辨光谱峰剥离算法 (Ryan 1988)
   */
  static snipBaseline(yValues, maxClippingWindow = 8, clampZero = true) {
    const n = Array.isArray(yValues) ? yValues.length : 0;
    if (n < 3) return this.constantBaseline(yValues, 'min', 0, clampZero);

    const safeWindow = Math.max(2, Math.min(maxClippingWindow || 8, Math.floor(n / 2) - 1));
    let z = [...yValues];

    // 多阶几何三角剪切
    for (let p = 1; p <= safeWindow; p++) {
      const zNew = [...z];
      for (let i = p; i < n - p; i++) {
        const val = (z[i - p] + z[i + p]) / 2;
        if (val < zNew[i]) {
          zNew[i] = val;
        }
      }
      z = zNew;
    }

    // 平滑后处理
    const zSmooth = new Array(n);
    for (let i = 0; i < n; i++) {
      let sum = 0, count = 0;
      for (let k = -1; k <= 1; k++) {
        const idx = Math.max(0, Math.min(n - 1, i + k));
        sum += z[idx];
        count++;
      }
      zSmooth[i] = sum / count;
    }

    return this.buildBaselineResult(yValues, zSmooth, clampZero, {
      algorithm: 'SNIP (Statistics-sensitive Non-linear Iterative Peak-clipping)',
      nameZh: 'SNIP 敏感非线性迭代峰值剪切法',
      clippingWindow: safeWindow,
      dynamicEquation: `z_i^{(p)} = \\min\\left(z_i^{(p-1)}, \\; \\frac{z_{i-p}^{(p-1)} + z_{i+p}^{(p-1)}}{2}\\right) \\quad (p=1\\dots ${safeWindow})`
    });
  }

  /**
   * 5. Rubberband 橡皮筋下凸包包络法 (Convex Hull Elastic Lower Envelope)
   */
  static rubberbandBaseline(yValues, segments = 6, clampZero = true) {
    const n = Array.isArray(yValues) ? yValues.length : 0;
    if (n < 3) return this.constantBaseline(yValues, 'min', 0, clampZero);

    const safeSeg = Math.max(3, Math.min(segments || 6, Math.floor(n / 2)));
    const segLen = n / safeSeg;
    const anchorIndices = [0];
    const anchorY = [yValues[0]];

    for (let s = 0; s < safeSeg; s++) {
      const startIdx = Math.floor(s * segLen);
      const endIdx = Math.min(n - 1, Math.floor((s + 1) * segLen));
      let minIdx = startIdx;
      let minVal = yValues[startIdx];

      for (let i = startIdx; i <= endIdx; i++) {
        if (yValues[i] < minVal) {
          minVal = yValues[i];
          minIdx = i;
        }
      }
      if (!anchorIndices.includes(minIdx)) {
        anchorIndices.push(minIdx);
        anchorY.push(minVal);
      }
    }

    if (!anchorIndices.includes(n - 1)) {
      anchorIndices.push(n - 1);
      anchorY.push(yValues[n - 1]);
    }

    // 线性插值构建弹性下包络
    const z = new Array(n);
    for (let i = 0; i < n; i++) {
      let left = 0, right = anchorIndices.length - 1;
      for (let k = 0; k < anchorIndices.length - 1; k++) {
        if (i >= anchorIndices[k] && i <= anchorIndices[k + 1]) {
          left = k;
          right = k + 1;
          break;
        }
      }
      const x0 = anchorIndices[left], x1 = anchorIndices[right];
      const y0 = anchorY[left], y1 = anchorY[right];
      const dx = (x1 - x0) || 1;
      z[i] = y0 + ((y1 - y0) * (i - x0)) / dx;
    }

    return this.buildBaselineResult(yValues, z, clampZero, {
      algorithm: 'Rubberband Convex Lower Envelope',
      nameZh: 'Rubberband 橡皮筋下包络凸包法',
      segments: safeSeg,
      anchorsCount: anchorIndices.length,
      dynamicEquation: `z(x) = \\text{ElasticLowerConvexHull}(y(x), \\text{Nodes}=${anchorIndices.length})`
    });
  }

  /**
   * 6. 多项式拟合基线模型 (Polynomial Regression)
   */
  static polynomialBaseline(yValues, xValues = null, degree = 2, clampZero = true) {
    const n = Array.isArray(yValues) ? yValues.length : 0;
    if (n < 2) return this.constantBaseline(yValues, 'min', 0, clampZero);

    const x = xValues || Array.from({ length: n }, (_, i) => i);
    const xMin = Math.min(...x), xMax = Math.max(...x);
    const xRange = (xMax - xMin) || 1;
    const xNorm = x.map(v => (v - xMin) / xRange);

    const deg = Math.max(1, Math.min(degree, Math.min(5, n - 1)));
    const m = deg + 1;
    const A = Array.from({ length: m }, () => new Array(m).fill(0));
    const b = new Array(m).fill(0);

    for (let i = 0; i < n; i++) {
      const xi = xNorm[i];
      const yi = yValues[i];
      const xPowers = new Array(2 * deg + 1).fill(1);
      for (let p = 1; p <= 2 * deg; p++) xPowers[p] = xPowers[p - 1] * xi;

      for (let r = 0; r < m; r++) {
        for (let c = 0; c < m; c++) A[r][c] += xPowers[r + c];
        b[r] += yi * xPowers[r];
      }
    }

    const coeffs = this.solveLinearSystem(A, b);
    const baseline = xNorm.map(xi => {
      let val = 0, p = 1;
      for (let r = 0; r < m; r++) {
        val += coeffs[r] * p;
        p *= xi;
      }
      return val;
    });

    let eqStr = `z(x) = `;
    for (let r = deg; r >= 0; r--) {
      const cVal = coeffs[r];
      const sign = (cVal >= 0 && r < deg) ? '+' : '';
      if (r === 0) eqStr += `${sign}${cVal.toFixed(1)}`;
      else if (r === 1) eqStr += `${sign}${cVal.toFixed(2)}x_n `;
      else eqStr += `${sign}${cVal.toFixed(2)}x_n^${r} `;
    }

    return this.buildBaselineResult(yValues, baseline, clampZero, {
      algorithm: `Polynomial Degree-${deg} Baseline`,
      nameZh: `${deg}阶多项式拟合基线`,
      degree: deg,
      coeffs: coeffs.map(c => Number(c.toFixed(4))),
      dynamicEquation: eqStr
    });
  }

  /**
   * 7. 线性漂移基线 (Linear Baseline)
   */
  static linearBaseline(yValues, xValues = null, clampZero = true) {
    const res = this.polynomialBaseline(yValues, xValues, 1, clampZero);
    const n = yValues.length;
    const slope = n > 1 ? (res.baseline[n - 1] - res.baseline[0]) / (n - 1) : 0;
    const totalDrift = n > 1 ? res.baseline[n - 1] - res.baseline[0] : 0;

    res.details.algorithm = 'Linear Drift Baseline';
    res.details.nameZh = '一阶线性漂移基线';
    res.details.slope = Number(slope.toFixed(4));
    res.details.totalDrift = Number(totalDrift.toFixed(2));
    res.details.dynamicEquation = `z(x) = ${slope.toFixed(3)} \\cdot x + ${(res.baseline[0] || 0).toFixed(1)}`;
    return res;
  }

  /**
   * 8. 滑动极小值形态学滤波基线 (Rolling Minimum)
   */
  static movingMinBaseline(yValues, windowSize = 9, clampZero = true) {
    const n = Array.isArray(yValues) ? yValues.length : 0;
    if (n < 3) return this.constantBaseline(yValues, 'min', 0, clampZero);

    const safeWin = Math.max(3, Math.min(windowSize, n));
    const half = Math.floor(safeWin / 2);
    const rawMin = new Array(n);

    for (let i = 0; i < n; i++) {
      let m = Infinity;
      for (let w = -half; w <= half; w++) {
        const idx = Math.max(0, Math.min(n - 1, i + w));
        m = Math.min(m, yValues[idx]);
      }
      rawMin[i] = m;
    }

    const baseline = new Array(n);
    for (let i = 0; i < n; i++) {
      let sum = 0, count = 0;
      for (let w = -1; w <= 1; w++) {
        const idx = Math.max(0, Math.min(n - 1, i + w));
        sum += rawMin[idx];
        count++;
      }
      baseline[i] = sum / (count || 1);
    }

    return this.buildBaselineResult(yValues, baseline, clampZero, {
      algorithm: `Moving Minimum Filter (W=${safeWin})`,
      nameZh: `滑动极小值形态学滤波`,
      windowSize: safeWin,
      dynamicEquation: `z(x) = \\text{MovingMin}(y(x), \\text{Window}=${safeWin})`
    });
  }

  static buildBaselineResult(yValues, zRaw, clampZero, details = {}) {
    const n = yValues.length;
    const baseline = zRaw.map(v => Number(v.toFixed(2)));
    const unboundedSubtracted = yValues.map((y, i) => Number((y - baseline[i]).toFixed(2)));
    const subtracted = unboundedSubtracted.map(sub => {
      return clampZero ? Math.max(0, Number(sub.toFixed(2))) : Number(sub.toFixed(2));
    });

    const bgMin = Math.min(...baseline);
    const bgMax = Math.max(...baseline);
    const bgMean = Number((baseline.reduce((a, b) => a + b, 0) / (n || 1)).toFixed(2));
    const subMax = Math.max(...subtracted);
    const subMin = Math.min(...subtracted);
    const denom = bgMean + subMax;

    const telemetry = {
      bgMin,
      bgMax,
      bgMean,
      subMax,
      subMin,
      bgRatioPercent: denom > 1e-4 ? Number(((bgMean / denom) * 100).toFixed(2)) : 0,
      clampedPointsCount: clampZero ? unboundedSubtracted.filter(v => v < 0).length : 0,
      extinctionImprovement: subMin <= 1e-4 ? 999 : Number((subMax / subMin).toFixed(1))
    };

    return { baseline, subtracted, unboundedSubtracted, details, telemetry };
  }

  static solvePentadiagonalAsls(y, w, lambda) {
    const n = y.length;
    const d0 = new Array(n).fill(0);
    const d1 = new Array(n).fill(0);
    const d2 = new Array(n).fill(0);

    for (let i = 0; i < n; i++) d0[i] = w[i];

    for (let i = 0; i < n - 2; i++) {
      const l = lambda;
      d0[i] += l * 1;
      d1[i] += l * (-2);
      d2[i] += l * 1;

      d0[i + 1] += l * 4;
      d1[i + 1] += l * (-2);

      d0[i + 2] += l * 1;
    }

    const rhs = new Array(n);
    for (let i = 0; i < n; i++) rhs[i] = w[i] * y[i];

    for (let i = 0; i < n; i++) {
      if (Math.abs(d0[i]) < 1e-12) d0[i] = 1e-12;

      if (i > 0) {
        const factor1 = d1[i - 1] / d0[i - 1];
        d0[i] -= factor1 * d1[i - 1];
        rhs[i] -= factor1 * rhs[i - 1];
        if (i < n - 1) d1[i] -= factor1 * (i > 1 ? d2[i - 2] : 0);
      }
      if (i > 1) {
        const factor2 = d2[i - 2] / d0[i - 2];
        d0[i] -= factor2 * d2[i - 2];
        rhs[i] -= factor2 * rhs[i - 2];
      }
    }

    const z = new Array(n);
    for (let i = n - 1; i >= 0; i--) {
      let sum = rhs[i];
      if (i + 1 < n) sum -= d1[i] * z[i + 1];
      if (i + 2 < n) sum -= d2[i] * z[i + 2];
      z[i] = sum / (d0[i] || 1e-12);
    }
    return z;
  }

  static solveLinearSystem(A, b) {
    const n = b.length;
    const M = A.map((row, i) => [...row, b[i]]);

    for (let i = 0; i < n; i++) {
      let maxEl = Math.abs(M[i][i]);
      let maxRow = i;
      for (let k = i + 1; k < n; k++) {
        if (Math.abs(M[k][i]) > maxEl) {
          maxEl = Math.abs(M[k][i]);
          maxRow = k;
        }
      }

      for (let k = i; k < n + 1; k++) {
        const tmp = M[maxRow][k];
        M[maxRow][k] = M[i][k];
        M[i][k] = tmp;
      }

      if (Math.abs(M[i][i]) < 1e-12) {
        M[i][i] = (M[i][i] < 0 ? -1 : 1) * 1e-12;
      }

      for (let k = i + 1; k < n; k++) {
        const c = -M[k][i] / M[i][i];
        for (let j = i; j < n + 1; j++) {
          if (i === j) M[k][j] = 0;
          else M[k][j] += c * M[i][j];
        }
      }
    }

    const x = new Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) {
      x[i] = M[i][n] / (M[i][i] || 1e-12);
      for (let k = i - 1; k >= 0; k--) {
        M[k][n] -= M[k][i] * x[i];
      }
    }
    return x;
  }

  /**
   * 统一调度入口
   */
  static computeBaselineAndSubtract(yValues, xValues = null, algorithm = 'none', options = {}, clampZero = true) {
    if (!Array.isArray(yValues) || yValues.length === 0) {
      return { baseline: [], subtracted: [], hasSubtracted: false };
    }

    try {
      if (algorithm === 'constant') {
        const mode = options.mode || 'min';
        const val = options.value || 0;
        const res = this.constantBaseline(yValues, mode, val, clampZero);
        return { ...res, hasSubtracted: true };
      } else if (algorithm === 'asls') {
        const lambda = options.lambda || 1e4;
        const p = options.p || 0.01;
        const res = this.aslsBaseline(yValues, lambda, p, 15, 1e-4, clampZero);
        return { ...res, hasSubtracted: true };
      } else if (algorithm === 'airpls') {
        const lambda = options.lambda || 1e4;
        const res = this.airPLSBaseline(yValues, lambda, 15, 1e-4, clampZero);
        return { ...res, hasSubtracted: true };
      } else if (algorithm === 'snip') {
        const win = options.clippingWindow || 8;
        const res = this.snipBaseline(yValues, win, clampZero);
        return { ...res, hasSubtracted: true };
      } else if (algorithm === 'rubberband') {
        const segs = options.segments || 6;
        const res = this.rubberbandBaseline(yValues, segs, clampZero);
        return { ...res, hasSubtracted: true };
      } else if (algorithm === 'polynomial') {
        const degree = options.degree || 2;
        const res = this.polynomialBaseline(yValues, xValues, degree, clampZero);
        return { ...res, hasSubtracted: true };
      } else if (algorithm === 'linear') {
        const res = this.linearBaseline(yValues, xValues, clampZero);
        return { ...res, hasSubtracted: true };
      } else if (algorithm === 'moving_min') {
        const windowSize = options.windowSize || 9;
        const res = this.movingMinBaseline(yValues, windowSize, clampZero);
        return { ...res, hasSubtracted: true };
      }
    } catch (err) {
      console.warn('基线算法运算异常，自动安全降级为常数底噪模式:', err);
      return this.constantBaseline(yValues, 'min', 0, clampZero);
    }

    return {
      baseline: new Array(yValues.length).fill(0),
      subtracted: [...yValues],
      hasSubtracted: false,
      details: { algorithm: 'None', nameZh: '未扣除背景', dynamicEquation: 'y_{\\text{sub}}(x) = y(x)' },
      telemetry: { bgMean: 0, subMax: Math.max(...yValues), bgRatioPercent: 0 }
    };
  }
}

if (typeof window !== 'undefined') {
  window.BaselineEngine = BaselineEngine;
  window.BaselineAlgorithms = BaselineEngine;
}
