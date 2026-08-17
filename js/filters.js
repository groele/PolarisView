/**
 * filters.js
 * 专为周期性极坐标数据优化的平滑与滤波算法库
 * 包含：闭合移动平均、闭合高斯滤波、Savitzky-Golay多项式平滑、傅里叶谐波滤波、周期样条插值
 */

const PolarFilters = {
  /**
   * 周期性边界填充（解决0度和360度闭合点边界效应）
   * @param {Array<number>} arr 原始序列（长度为 N，假设首尾对齐）
   * @param {number} padSize 填充大小
   * @returns {{padded: Array<number>, origLen: number, padSize: number}}
   */
  periodicPad(arr, padSize) {
    const n = arr.length;
    if (n === 0) return { padded: [], origLen: 0, padSize: 0 };
    // 如果首末点数值重合（如 0° 和 360°），周期实际跨度为 n-1
    const isClosed = Math.abs(arr[0] - arr[n - 1]) < 1e-3;
    const period = isClosed ? n - 1 : n;

    const padded = [];
    // 左填充：取末尾周期的数据
    for (let i = 0; i < padSize; i++) {
      const idx = ((i - padSize) % period + period) % period;
      padded.push(arr[idx]);
    }
    // 中间原数据
    for (let i = 0; i < n; i++) {
      padded.push(arr[i]);
    }
    // 右填充：取头部周期的数据
    for (let i = 0; i < padSize; i++) {
      const idx = (i + (isClosed ? 1 : 0)) % period;
      padded.push(arr[idx]);
    }

    return { padded, origLen: n, padSize };
  },

  /**
   * 从填充后的数组中裁剪回原始长度
   */
  cropPadded(padded, padSize, origLen) {
    return padded.slice(padSize, padSize + origLen);
  },

  /**
   * 1. 周期闭合移动平均滤波 (Moving Average)
   * @param {Array<number>} data
   * @param {number} windowSize 奇数窗口大小 (3, 5, 7, 9...)
   */
  movingAverage(data, windowSize = 3) {
    if (!data || data.length <= 2 || windowSize <= 1) return [...data];
    windowSize = Math.max(3, windowSize | 1); // 保证奇数
    const half = Math.floor(windowSize / 2);
    const { padded, origLen, padSize } = this.periodicPad(data, half);

    const smoothedPadded = [];
    for (let i = half; i < padded.length - half; i++) {
      let sum = 0;
      for (let j = -half; j <= half; j++) {
        sum += padded[i + j];
      }
      smoothedPadded.push(sum / windowSize);
    }

    return this.cropPadded(smoothedPadded, 0, origLen);
  },

  /**
   * 2. 周期闭合高斯平滑滤波 (Gaussian Filter)
   * @param {Array<number>} data
   * @param {number} sigma 高斯标准差 (0.5 ~ 5.0)
   * @param {number} kernelRadius 卷积核半径
   */
  gaussianSmooth(data, sigma = 1.2, kernelRadius = null) {
    if (!data || data.length <= 2 || sigma <= 0.1) return [...data];
    const radius = kernelRadius || Math.max(2, Math.ceil(sigma * 3));
    const kernelSize = 2 * radius + 1;

    // 构建高斯核
    const kernel = [];
    let kernelSum = 0;
    for (let i = -radius; i <= radius; i++) {
      const weight = Math.exp(-(i * i) / (2 * sigma * sigma));
      kernel.push(weight);
      kernelSum += weight;
    }
    for (let i = 0; i < kernel.length; i++) {
      kernel[i] /= kernelSum;
    }

    const { padded, origLen } = this.periodicPad(data, radius);
    const smoothedPadded = [];

    for (let i = radius; i < padded.length - radius; i++) {
      let sum = 0;
      for (let j = -radius; j <= radius; j++) {
        sum += padded[i + j] * kernel[j + radius];
      }
      smoothedPadded.push(sum);
    }

    return this.cropPadded(smoothedPadded, 0, origLen);
  },

  /**
   * 3. 周期闭合 Savitzky-Golay 平滑滤波 (S-G Filter)
   * 二次/三次多项式滤波，适合保持波峰波谷极值
   * @param {Array<number>} data
   * @param {number} windowSize 窗口大小（5, 7, 9, 11）
   */
  savitzkyGolay(data, windowSize = 5) {
    if (!data || data.length <= 2) return [...data];
    // 常用 S-G 卷积系数表（二次多项式卷积权重）
    const sgCoeffs = {
      5: { norm: 35, weights: [-3, 12, 17, 12, -3] },
      7: { norm: 21, weights: [-2, 3, 6, 7, 6, 3, -2] },
      9: { norm: 231, weights: [-21, 14, 39, 54, 59, 54, 39, 14, -21] },
      11: { norm: 429, weights: [-36, 9, 44, 69, 84, 89, 84, 69, 44, 9, -36] }
    };

    const validSizes = [5, 7, 9, 11];
    let matchedSize = validSizes.reduce((prev, curr) => 
      Math.abs(curr - windowSize) < Math.abs(prev - windowSize) ? curr : prev
    );

    const config = sgCoeffs[matchedSize];
    const half = Math.floor(matchedSize / 2);
    const { padded, origLen } = this.periodicPad(data, half);
    const smoothedPadded = [];

    for (let i = half; i < padded.length - half; i++) {
      let sum = 0;
      for (let j = -half; j <= half; j++) {
        sum += padded[i + j] * config.weights[j + half];
      }
      smoothedPadded.push(sum / config.norm);
    }

    return this.cropPadded(smoothedPadded, 0, origLen);
  },

  /**
   * 4. 傅里叶光学谐波滤波 (Fourier Low-pass / Harmonic Filter)
   * 1/2波片光学测量中，信号由 DC分量 和 2/4倍频 谐波主导，滤除高频噪声极其纯净
   * @param {Array<number>} data
   * @param {number} keepHarmonics 保留最高谐波阶数 (默认 4，对应波片主要旋转模式)
   */
  fourierFilter(data, keepHarmonics = 4) {
    const N = data.length;
    if (N <= 4) return [...data];

    // 实数离散傅里叶变换 (DFT)
    const cosCoeffs = new Float64Array(N);
    const sinCoeffs = new Float64Array(N);

    for (let k = 0; k < N; k++) {
      let sumCos = 0;
      let sumSin = 0;
      for (let n = 0; n < N; n++) {
        const phi = (2 * Math.PI * k * n) / N;
        sumCos += data[n] * Math.cos(phi);
        sumSin += data[n] * Math.sin(phi);
      }
      cosCoeffs[k] = sumCos / N;
      sinCoeffs[k] = sumSin / N;
    }

    // 逆变换（仅保留 0 到 keepHarmonics 的低频及对应共轭频段）
    const result = [];
    const maxK = Math.min(keepHarmonics, Math.floor((N - 1) / 2));

    for (let n = 0; n < N; n++) {
      let val = cosCoeffs[0]; // DC 分量
      for (let k = 1; k <= maxK; k++) {
        const phi = (2 * Math.PI * k * n) / N;
        val += 2 * (cosCoeffs[k] * Math.cos(phi) - sinCoeffs[k] * Math.sin(phi));
      }
      result.push(val);
    }

    return result;
  },

  /**
   * 5. 周期三次样条插值密化 (Periodic Spline for ultra-smooth polar curves)
   * 将 N 个离散点在 0~360 度上平滑插值为 targetCount (如 360) 个连续点
   * @param {Array<{angle: number, y: number}>} points
   * @param {number} targetCount 输出点数
   */
  periodicSplineInterpolate(points, targetCount = 360) {
    const n = points.length;
    if (n < 4) return points.map(p => [p.angle, p.y]);

    // 提取 x (角度) 和 y (值)
    const angles = points.map(p => p.angle);
    const values = points.map(p => p.y);

    // 简单高效的高分辨率周期性余弦插值或三次插值
    const interpolated = [];
    const step = 360 / targetCount;

    for (let i = 0; i < targetCount; i++) {
      const curAngle = i * step;
      // 找到最近的左右索引
      let idx = 0;
      while (idx < n - 1 && angles[idx + 1] <= curAngle) {
        idx++;
      }
      const nextIdx = (idx + 1) % n;
      const x0 = angles[idx];
      let x1 = angles[nextIdx];
      if (nextIdx === 0) x1 = 360;

      const t = (x1 === x0) ? 0 : (curAngle - x0) / (x1 - x0);
      // 余弦平滑过渡插值
      const mu2 = (1 - Math.cos(t * Math.PI)) / 2;
      const yVal = values[idx] * (1 - mu2) + values[nextIdx] * mu2;

      interpolated.push([Number(curAngle.toFixed(1)), Number(yVal.toFixed(2))]);
    }
    // 闭合点 360 度
    interpolated.push([360, interpolated[0][1]]);

    return interpolated;
  },

  /**
   * 统一执行用户选择的滤波方法
   * @param {Array<number>} data
   * @param {string} filterType 'none' | 'moving_avg' | 'gaussian' | 'sg' | 'fourier'
   * @param {Object} params
   */
  applyFilter(data, filterType, params = {}) {
    if (!data || data.length === 0 || filterType === 'none') {
      return [...data];
    }

    switch (filterType) {
      case 'moving_avg':
        return this.movingAverage(data, params.windowSize || 3);
      case 'gaussian':
        return this.gaussianSmooth(data, params.sigma || 1.2);
      case 'sg':
        return this.savitzkyGolay(data, params.windowSize || 5);
      case 'fourier':
        return this.fourierFilter(data, params.harmonics || 4);
      default:
        return [...data];
    }
  }
};

// 导出
if (typeof window !== 'undefined') {
  window.PolarFilters = PolarFilters;
}
