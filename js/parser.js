/**
 * parser.js
 * 负责解析 1/2 波片偏振旋转测量数据、提取指定区间子组并进行统计学计算
 */

const DataParser = {
  /**
   * 解析原始文本数据（支持制表符、空格、逗号分隔）
   * @param {string} rawText
   * @param {number} angleMultiplier 默认 10
   * @returns {Array<{x: number, y: number, rawX: number, angle: number}>}
   */
  parseRawData(rawText, angleMultiplier = 10) {
    if (!rawText || typeof rawText !== 'string') return [];

    const lines = rawText.split(/\r?\n/);
    const dataPoints = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith('#') || line.startsWith('//') || line.startsWith('%')) {
        continue;
      }

      const parts = line.split(/[,\t\s]+/).filter(Boolean);
      if (parts.length >= 2) {
        const rawX = parseFloat(parts[0]);
        const y = parseFloat(parts[1]);

        if (!isNaN(rawX) && !isNaN(y)) {
          dataPoints.push({
            rawX: rawX,
            x: rawX,
            angle: rawX * angleMultiplier,
            y: y
          });
        }
      }
    }

    dataPoints.sort((a, b) => a.rawX - b.rawX);
    return dataPoints;
  },

  /**
   * 将数据点数组转换为标准纯文本格式 (便于反向同步回 textarea)
   */
  stringifyData(dataPoints) {
    return dataPoints.map(d => `${d.rawX}\t${d.y}`).join('\n');
  },

  /**
   * 自动提取指定区间的三个组
   * @param {Array<{x: number, y: number, rawX: number, angle: number, effectiveY?: number}>} allData
   * @param {Array<{id: string, name: string, start: number, end: number, color: string}>} groupConfigs
   * @param {number} angleMultiplier
   */
  extractGroups(allData, groupConfigs = null, angleMultiplier = 10) {
    const configs = groupConfigs || [
      { id: 'group1', name: 'Group 1 (x: 0~36)', start: 0, end: 36, color: '#3b82f6' },
      { id: 'group2', name: 'Group 2 (x: 18~54)', start: 18, end: 54, color: '#10b981' },
      { id: 'group3', name: 'Group 3 (x: 36~72)', start: 36, end: 72, color: '#f59e0b' }
    ];

    const dataMap = new Map();
    allData.forEach(d => {
      // 优先使用扣除背景后的 effectiveY，否则使用原始 y
      const val = d.effectiveY !== undefined ? d.effectiveY : d.y;
      dataMap.set(d.rawX, { val, rawY: d.y });
    });

    const groups = configs.map(cfg => {
      const points = [];
      const span = cfg.end - cfg.start;
      
      for (let rx = cfg.start; rx <= cfg.end; rx++) {
        if (dataMap.has(rx)) {
          const entry = dataMap.get(rx);
          const relStep = rx - cfg.start;
          const relAngle = (relStep / (span || 1)) * 360; // 映射到 0~360度
          points.push({
            rawX: rx,
            relStep: relStep,
            relAngle: Number(relAngle.toFixed(2)),
            angle: rx * angleMultiplier,
            y: entry.val,
            rawY: entry.rawY
          });
        }
      }

      return {
        ...cfg,
        points: points,
        count: points.length
      };
    });

    return groups;
  },

  /**
   * 计算三组数据的对齐统计量（均值、标准差、标准误差、极值）
   */
  computeStatistics(groups) {
    if (!groups || groups.length === 0) return null;

    let maxSteps = 0;
    groups.forEach(g => {
      g.points.forEach(p => {
        if (p.relStep > maxSteps) maxSteps = p.relStep;
      });
    });

    const stepStats = [];

    for (let step = 0; step <= maxSteps; step++) {
      const matchedPoints = [];
      let relAngle = (step / (maxSteps || 1)) * 360;

      groups.forEach(g => {
        const pt = g.points.find(p => p.relStep === step);
        if (pt) {
          matchedPoints.push(pt.y);
          relAngle = pt.relAngle;
        }
      });

      if (matchedPoints.length > 0) {
        const n = matchedPoints.length;
        const sum = matchedPoints.reduce((acc, v) => acc + v, 0);
        const mean = sum / n;

        // 样本标准差 SD
        let variance = 0;
        if (n > 1) {
          variance = matchedPoints.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / (n - 1);
        }
        const sd = Math.sqrt(variance);
        const se = sd / Math.sqrt(n);
        const rsd = mean !== 0 ? (sd / mean) * 100 : 0;

        const statItem = {
          step: step,
          relAngle: Number(relAngle.toFixed(2)),
          values: matchedPoints,
          count: n,
          mean: Number(mean.toFixed(2)),
          sd: Number(sd.toFixed(2)),
          se: Number(se.toFixed(2)),
          rsd: Number(rsd.toFixed(2)),
          upperSD: Number((mean + sd).toFixed(2)),
          lowerSD: Number(Math.max(0, mean - sd).toFixed(2)),
          upperSE: Number((mean + se).toFixed(2)),
          lowerSE: Number(Math.max(0, mean - se).toFixed(2)),
          min: Math.min(...matchedPoints),
          max: Math.max(...matchedPoints)
        };

        stepStats.push(statItem);
      }
    }

    if (stepStats.length === 0) return null;

    let globalMax = -Infinity;
    let globalMin = Infinity;
    let maxAngle = 0;
    let minAngle = 0;
    let maxSD = 0;
    let avgRSD = 0;

    stepStats.forEach(st => {
      if (st.mean > globalMax) {
        globalMax = st.mean;
        maxAngle = st.relAngle;
      }
      if (st.mean < globalMin) {
        globalMin = st.mean;
        minAngle = st.relAngle;
      }
      if (st.sd > maxSD) {
        maxSD = st.sd;
      }
      avgRSD += st.rsd;
    });

    avgRSD = avgRSD / stepStats.length;

    const extinctionRatio = globalMin > 0 ? (globalMax / globalMin) : (globalMax > 0 ? Infinity : 0);
    const extinctionRatioDB = globalMin > 0 ? (10 * Math.log10(globalMax / globalMin)) : 0;
    const modulationDepth = (globalMax + globalMin) > 0 ? ((globalMax - globalMin) / (globalMax + globalMin)) : 0;

    return {
      stepStats: stepStats,
      summary: {
        totalSteps: stepStats.length,
        maxIntensity: Number(globalMax.toFixed(2)),
        maxAngle: maxAngle,
        minIntensity: Number(globalMin.toFixed(2)),
        minAngle: minAngle,
        extinctionRatio: Number.isFinite(extinctionRatio) ? Number(extinctionRatio.toFixed(3)) : '∞ (已完全消光)',
        extinctionRatioDB: Number(extinctionRatioDB.toFixed(2)),
        modulationDepth: Number(modulationDepth.toFixed(4)),
        modulationPercent: Number((modulationDepth * 100).toFixed(2)),
        maxSD: Number(maxSD.toFixed(2)),
        avgRSD: Number(avgRSD.toFixed(2))
      }
    };
  }
};

// 导出
if (typeof window !== 'undefined') {
  window.DataParser = DataParser;
}
