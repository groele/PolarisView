/**
 * malus-fitter.js (Conditioned Harmonic Fitting Engine)
 * 五参数经验谐波拟合：奇异性拒绝、自由度修正、近似置信区间与条件性调制度代理
 */

class MalusFitter {
  static fitMalusLaw(points) {
    this.lastFailureReason = '';
    if (!Array.isArray(points) || points.length < 6) {
      this.lastFailureReason = '有效拟合点少于 6 个，无法估计五参数模型及残差自由度。';
      return null;
    }

    const uniqueAngles = new Set(points.map(p => Math.round((Number(p.angle) || 0) * 1e6) / 1e6));
    if (uniqueAngles.size < 6) {
      this.lastFailureReason = `仅 ${uniqueAngles.size} 个独立角度；拟合设计矩阵秩不足。`;
      return null;
    }

    const n = points.length;
    let sum1 = n;
    let sumC4 = 0, sumS4 = 0, sumC2 = 0, sumS2 = 0;
    let sumC4_2 = 0, sumC4S4 = 0, sumC4C2 = 0, sumC4S2 = 0;
    let sumS4_2 = 0, sumS4C2 = 0, sumS4S2 = 0;
    let sumC2_2 = 0, sumC2S2 = 0;
    let sumS2_2 = 0;

    let sumY = 0, sumYC4 = 0, sumYS4 = 0, sumYC2 = 0, sumYS2 = 0;

    for (let i = 0; i < n; i++) {
      const thetaRad = ((points[i].angle || 0) * Math.PI) / 180;
      const y = Number.isFinite(points[i].y) ? points[i].y : 0;

      const c4 = Math.cos(4 * thetaRad);
      const s4 = Math.sin(4 * thetaRad);
      const c2 = Math.cos(2 * thetaRad);
      const s2 = Math.sin(2 * thetaRad);

      sumC4 += c4; sumS4 += s4; sumC2 += c2; sumS2 += s2;
      sumC4_2 += c4 * c4; sumC4S4 += c4 * s4; sumC4C2 += c4 * c2; sumC4S2 += c4 * s2;
      sumS4_2 += s4 * s4; sumS4C2 += s4 * c2; sumS4S2 += s4 * s2;
      sumC2_2 += c2 * c2; sumC2S2 += c2 * s2;
      sumS2_2 += s2 * s2;

      sumY += y;
      sumYC4 += y * c4;
      sumYS4 += y * s4;
      sumYC2 += y * c2;
      sumYS2 += y * s2;
    }

    const A = [
      [sum1,   sumC4,   sumS4,   sumC2,   sumS2],
      [sumC4,  sumC4_2, sumC4S4, sumC4C2, sumC4S2],
      [sumS4,  sumC4S4, sumS4_2, sumS4C2, sumS4S2],
      [sumC2,  sumC4C2, sumS4C2, sumC2_2, sumC2S2],
      [sumS2,  sumC4S2, sumS4S2, sumC2S2, sumS2_2]
    ];
    const B = [sumY, sumYC4, sumYS4, sumYC2, sumYS2];

    const solved = this.solve5x5(A, B);
    const coeffs = solved ? solved.solution : null;
    if (!solved || solved.conditionProxy > 1e10 || !coeffs || coeffs.some(v => !Number.isFinite(v))) {
      this.lastFailureReason = !solved ? '拟合矩阵不可逆。' : `拟合矩阵病态（条件数代理 ${solved.conditionProxy.toExponential(2)}）。`;
      return null;
    }

    const [A0, A4, B4, A2, B2] = coeffs;
    const C4 = Math.sqrt(A4 * A4 + B4 * B4);
    const phi4 = Math.atan2(B4, A4);

    let theta0 = (phi4 / 4) * (180 / Math.PI);
    theta0 = ((theta0 % 90) + 90) % 90;

    const C2 = Math.sqrt(A2 * A2 + B2 * B2);
    const C4Clamped = Math.max(1e-6, C4);
    const cosDelta = Math.max(-1, Math.min(1, 1 - (C2 * C2) / (2 * C4Clamped * C4Clamped)));
    const deltaDeg = (Math.acos(cosDelta) * 180) / Math.PI;
    const retardanceError = Math.abs(180 - deltaDeg);

    // 理论调制极值与线偏振度 DoLP
    const I_max_fit = A0 + C4;
    const I_min_fit = Math.max(0, A0 - C4);
    const denom = I_max_fit + I_min_fit;
    const dolp = denom > 1e-4 ? (I_max_fit - I_min_fit) / denom : 1;
    const dolpHarmonic = A0 > 1e-4 ? Math.min(1, (2 * C4) / A0) : 1;

    let ssTot = 0, ssRes = 0;
    const yMean = sumY / n;
    const fittedPoints = [];
    const residuals = [];

    points.forEach((p, idx) => {
      const thetaRad = ((p.angle || 0) * Math.PI) / 180;
      const yFit = A0 + A4 * Math.cos(4 * thetaRad) + B4 * Math.sin(4 * thetaRad) + A2 * Math.cos(2 * thetaRad) + B2 * Math.sin(2 * thetaRad);
      const res = p.y - yFit;

      ssTot += Math.pow(p.y - yMean, 2);
      ssRes += Math.pow(res, 2);

      residuals.push(res);
      fittedPoints.push({
        index: idx,
        sourceIndex: p.sourceIndex,
        angle: p.angle,
        rawX: p.rawX,
        yRaw: p.y,
        yFit: Number(yFit.toFixed(2)),
        residual: Number(res.toFixed(2))
      });
    });

    let rSquared = ssTot > 1e-6 ? 1 - (ssRes / ssTot) : 1;
    rSquared = Math.max(0, Math.min(1, rSquared));
    const degreesOfFreedom = n - 5;
    const rmse = Math.sqrt(ssRes / Math.max(1, degreesOfFreedom));
    const inverseNormal = this.invertMatrix(A);
    const sigma2 = ssRes / Math.max(1, degreesOfFreedom);
    const coefficientSE = inverseNormal
      ? inverseNormal.map((row, i) => Math.sqrt(Math.max(0, row[i] * sigma2)))
      : Array(5).fill(null);
    const coefficientCI95 = coeffs.map((value, i) => coefficientSE[i] === null
      ? null
      : [value - 1.96 * coefficientSE[i], value + 1.96 * coefficientSE[i]]);
    const covariance = inverseNormal ? inverseNormal.map(row => row.map(value => value * sigma2)) : null;
    const quadraticVariance = (gradient) => {
      if (!covariance) return null;
      let value = 0;
      for (let i = 0; i < gradient.length; i++) {
        for (let j = 0; j < gradient.length; j++) value += gradient[i] * covariance[i][j] * gradient[j];
      }
      return Math.max(0, value);
    };
    const c4Sq = Math.max(C4 * C4, 1e-12);
    const thetaGradient = [0, -B4 / (4 * c4Sq), A4 / (4 * c4Sq), 0, 0];
    const thetaSE = Math.sqrt(quadraticVariance(thetaGradient) ?? 0) * 180 / Math.PI;
    const thetaCI95 = [theta0 - 1.96 * thetaSE, theta0 + 1.96 * thetaSE];
    const dolpGradient = A0 > 1e-6 && C4 > 1e-6
      ? [-C4 / (A0 * A0), A4 / (A0 * C4), B4 / (A0 * C4), 0, 0]
      : [0, 0, 0, 0, 0];
    const dolpSE = Math.sqrt(quadraticVariance(dolpGradient) ?? 0);
    const dolpCI95 = [Math.max(0, dolp - 1.96 * dolpSE), Math.min(1, dolp + 1.96 * dolpSE)];

    // 2.5σ 离群点探测
    const outlierThreshold = 2.5 * (rmse || 1);
    const outliers = fittedPoints.filter(fp => Math.abs(fp.residual) > outlierThreshold);

    // 360 点稠密理论拟合曲线
    const denseFitCurve = [];
    for (let deg = 0; deg <= 360; deg += 1) {
      const rad = (deg * Math.PI) / 180;
      const y = A0 + A4 * Math.cos(4 * rad) + B4 * Math.sin(4 * rad) + A2 * Math.cos(2 * rad) + B2 * Math.sin(2 * rad);
      denseFitCurve.push([deg, Math.max(0, Number(y.toFixed(2)))]);
    }

    return {
      params: {
        theta0: Number(theta0.toFixed(2)),
        theta0SE: Number(thetaSE.toFixed(3)),
        theta0CI95: thetaCI95.map(value => Number(value.toFixed(3))),
        rSquared: Number(rSquared.toFixed(5)),
        rSquaredPercent: (rSquared * 100).toFixed(3),
        rmse: Number(rmse.toFixed(2)),
        degreesOfFreedom,
        conditionProxy: Number(solved.conditionProxy.toPrecision(6)),
        amplitude: Number((2 * C4).toFixed(2)),
        offset: Number(A0.toFixed(2)),
        dolp: Number(dolp.toFixed(4)),
        dolpPercent: (dolp * 100).toFixed(2),
        dolpSE: Number(dolpSE.toFixed(5)),
        dolpCI95Percent: dolpCI95.map(value => Number((value * 100).toFixed(2))),
        dolpHarmonicPercent: (dolpHarmonic * 100).toFixed(2),
        retardance: Number(deltaDeg.toFixed(2)),
        retardanceError: Number(retardanceError.toFixed(2)),
        coeffs: { A0, A4, B4, A2, B2 },
        coefficientSE: { A0: coefficientSE[0], A4: coefficientSE[1], B4: coefficientSE[2], A2: coefficientSE[3], B2: coefficientSE[4] },
        coefficientCI95
      },
      fittedPoints,
      residuals,
      outliers,
      denseFitCurve
    };
  }

  static solve5x5(A, b) {
    const n = 5;
    const M = A.map((row, i) => [...row, b[i]]);

    let minPivot = Infinity;
    let maxPivot = 0;
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

      const pivot = Math.abs(M[i][i]);
      if (!Number.isFinite(pivot) || pivot < 1e-12) return null;
      minPivot = Math.min(minPivot, pivot);
      maxPivot = Math.max(maxPivot, pivot);

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
    return { solution: x, conditionProxy: maxPivot / minPivot };
  }

  static invertMatrix(A) {
    const n = A.length;
    const M = A.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => i === j ? 1 : 0)]);
    for (let i = 0; i < n; i++) {
      let pivotRow = i;
      for (let r = i + 1; r < n; r++) if (Math.abs(M[r][i]) > Math.abs(M[pivotRow][i])) pivotRow = r;
      if (Math.abs(M[pivotRow][i]) < 1e-12) return null;
      [M[i], M[pivotRow]] = [M[pivotRow], M[i]];
      const pivot = M[i][i];
      for (let c = 0; c < 2 * n; c++) M[i][c] /= pivot;
      for (let r = 0; r < n; r++) {
        if (r === i) continue;
        const factor = M[r][i];
        for (let c = 0; c < 2 * n; c++) M[r][c] -= factor * M[i][c];
      }
    }
    return M.map(row => row.slice(n));
  }
}

if (typeof window !== 'undefined') {
  window.MalusFitter = MalusFitter;
  window.OpticalFitter = MalusFitter;
}
