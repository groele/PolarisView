/**
 * optical-fitter.js
 * 1/2 波片光学偏振理论马吕斯拟合、物理参数反演与残差分析引擎
 */

const OpticalFitter = {
  /**
   * 执行 1/2 波片旋转马吕斯理论拟合
   * 理论模型：I(theta) = A0 + A4*cos(4*theta) + B4*sin(4*theta) + A2*cos(2*theta) + B2*sin(2*theta)
   * 反演：快轴初角 theta_0, 调制幅度 I0, 背景光强 I_bg, 拟合优度 R^2, 波片延迟偏差 delta
   * @param {Array<{angle: number, y: number, rawX?: number}>} points
   * @returns {Object} 拟合结果对象
   */
  fitMalusLaw(points) {
    const N = points.length;
    if (N < 5) return null;

    // 转换为弧度
    const rads = points.map(p => (p.angle * Math.PI) / 180);
    const yVals = points.map(p => p.y);

    // 构建正规方程矩阵 X^T * X 和 X^T * y
    // 基函数: [1, cos(4*theta), sin(4*theta), cos(2*theta), sin(2*theta)]
    const M = 5;
    const ATA = Array.from({ length: M }, () => new Float64Array(M));
    const ATY = new Float64Array(M);

    for (let i = 0; i < N; i++) {
      const th = rads[i];
      const yi = yVals[i];
      const basis = [
        1.0,
        Math.cos(4 * th),
        Math.sin(4 * th),
        Math.cos(2 * th),
        Math.sin(2 * th)
      ];

      for (let r = 0; r < M; r++) {
        ATY[r] += yi * basis[r];
        for (let c = 0; c < M; c++) {
          ATA[r][c] += basis[r] * basis[c];
        }
      }
    }

    // 高斯消元求解系数 [A0, A4, B4, A2, B2]
    const coeffs = this.solveGaussian(ATA, ATY, M);
    if (!coeffs) return null;

    const [A0, A4, B4, A2, B2] = coeffs;

    // 1. 物理参数反演
    const amp4 = Math.sqrt(A4 * A4 + B4 * B4); // 4倍频主谐波幅度
    const amp2 = Math.sqrt(A2 * A2 + B2 * B2); // 2倍频副谐波幅度 (相位延迟误差分量)

    const I0 = 2 * amp4; // 理想调制总幅度
    const I_bg = Math.max(0, A0 - amp4); // 估计直流背景底噪

    // 快轴初始角偏移 theta_0: 4*(theta - theta_0) => cos(4*th - 4*th0) = cos(4th)cos(4th0) + sin(4th)sin(4th0)
    const phase4 = Math.atan2(B4, A4); // 4*theta_0
    let theta0_rad = phase4 / 4;
    let theta0_deg = (theta0_rad * 180) / Math.PI;
    // 归一化到 0 ~ 90 度 (1/2波片主轴周期为 90 度)
    theta0_deg = ((theta0_deg % 90) + 90) % 90;

    // 波片相位延迟偏差估计 (理想 1/2 波片延迟为 180 度 / pi)
    let retardanceErrorDeg = 0;
    if (amp4 > 0) {
      const ratio = Math.min(1.0, amp2 / amp4);
      retardanceErrorDeg = (Math.asin(ratio) * 180) / Math.PI;
    }

    // 2. 拟合预测与残差计算
    let ssTot = 0;
    let ssRes = 0;
    const yMean = yVals.reduce((a, b) => a + b, 0) / N;

    const fittedPoints = [];
    const residuals = [];
    const outliers = [];

    for (let i = 0; i < N; i++) {
      const th = rads[i];
      const yFit = A0 + A4 * Math.cos(4 * th) + B4 * Math.sin(4 * th) + A2 * Math.cos(2 * th) + B2 * Math.sin(2 * th);
      const res = yVals[i] - yFit;

      ssTot += Math.pow(yVals[i] - yMean, 2);
      ssRes += Math.pow(res, 2);

      fittedPoints.push({
        angle: points[i].angle,
        rawX: points[i].rawX,
        yExp: yVals[i],
        yFit: Number(yFit.toFixed(2)),
        residual: Number(res.toFixed(2))
      });
      residuals.push(res);
    }

    const rSquared = ssTot > 0 ? Math.max(0, 1 - (ssRes / ssTot)) : 1;
    const rmse = Math.sqrt(ssRes / N);

    // 3. 异常点检测 (残差超过 2.5 倍 RMSE)
    const outlierThreshold = 2.5 * (rmse || 1);
    fittedPoints.forEach((pt, idx) => {
      if (Math.abs(pt.residual) > outlierThreshold) {
        outliers.push({
          index: idx,
          angle: pt.angle,
          rawX: pt.rawX,
          residual: pt.residual,
          deviation: Number((Math.abs(pt.residual) / (rmse || 1)).toFixed(2))
        });
      }
    });

    // 4. 生成 360 点高分辨率理论拟合曲线 (用于光滑绘制)
    const denseFitCurve = [];
    for (let deg = 0; deg <= 360; deg += 1) {
      const th = (deg * Math.PI) / 180;
      const yVal = A0 + A4 * Math.cos(4 * th) + B4 * Math.sin(4 * th) + A2 * Math.cos(2 * th) + B2 * Math.sin(2 * th);
      denseFitCurve.push([deg, Math.max(0, Number(yVal.toFixed(2)))]);
    }

    // 5. 偏振度与消光参数
    const fitMax = A0 + amp4;
    const fitMin = Math.max(0, A0 - amp4);
    const extinctionRatioFit = fitMin > 0 ? (fitMax / fitMin) : Infinity;
    const dolp = (fitMax + fitMin) > 0 ? (fitMax - fitMin) / (fitMax + fitMin) : 1;

    return {
      params: {
        theta0: Number(theta0_deg.toFixed(2)),
        amplitude: Number(I0.toFixed(2)),
        background: Number(I_bg.toFixed(2)),
        retardanceError: Number(retardanceErrorDeg.toFixed(2)),
        rSquared: Number(rSquared.toFixed(5)),
        rSquaredPercent: Number((rSquared * 100).toFixed(3)),
        rmse: Number(rmse.toFixed(2)),
        dolp: Number(dolp.toFixed(4)),
        dolpPercent: Number((dolp * 100).toFixed(2)),
        fitMax: Number(fitMax.toFixed(2)),
        fitMin: Number(fitMin.toFixed(2)),
        extinctionRatio: Number.isFinite(extinctionRatioFit) ? Number(extinctionRatioFit.toFixed(2)) : '∞',
        coeffs: { A0, A4, B4, A2, B2 }
      },
      fittedPoints: fittedPoints,
      denseFitCurve: denseFitCurve,
      outliers: outliers
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
  }
};

// 导出
if (typeof window !== 'undefined') {
  window.OpticalFitter = OpticalFitter;
}
