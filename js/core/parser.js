/**
 * parser.js (Core Data Engine - with Auto Phase Alignment)
 * 强化版数据解析引擎：增加「智能相位锁定对齐 (Auto Phase Lock)」与错相检测
 */

class DataParser {
  static parseRawData(rawText, angleMultiplier = 10) {
    if (!rawText || typeof rawText !== 'string') return [];
    
    const lines = rawText.trim().split(/\r?\n/);
    const result = [];
    const numRegex = /[-+]?[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?/g;

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].trim();
      if (!line) continue;
      
      if (line.startsWith('#') || line.startsWith('//') || line.startsWith('%') || line.startsWith(';')) {
        continue;
      }
      
      const matches = line.match(numRegex);
      if (!matches) continue;

      if (matches.length >= 2) {
        const rawX = parseFloat(matches[0]);
        const y = parseFloat(matches[1]);
        if (Number.isFinite(rawX) && Number.isFinite(y)) {
          result.push({
            rawX: rawX,
            y: y,
            angle: rawX * (Number.isFinite(angleMultiplier) ? angleMultiplier : 10)
          });
        }
      } else if (matches.length === 1) {
        const y = parseFloat(matches[0]);
        if (Number.isFinite(y)) {
          result.push({
            rawX: result.length,
            y: y,
            angle: result.length * (Number.isFinite(angleMultiplier) ? angleMultiplier : 10)
          });
        }
      }
    }
    return result;
  }

  static stringifyData(points) {
    if (!Array.isArray(points)) return '';
    return points.map(p => `${p.rawX}\t${p.y}`).join('\n');
  }

  /**
   * 提取多组切片数据，支持物理切片与智能相位锁定对齐
   * @param {Array} dataPoints
   * @param {Array} groupConfigs
   * @param {number} multiplier
   * @param {boolean} autoPhaseAlign 是否启用智能峰值相位对齐
   */
  static extractGroups(dataPoints, groupConfigs, multiplier = 10, autoPhaseAlign = false) {
    if (!Array.isArray(dataPoints) || dataPoints.length === 0) return [];
    const validMultiplier = Number.isFinite(multiplier) ? multiplier : 10;

    const rawGroups = groupConfigs.map((cfg) => {
      const start = Number.isFinite(cfg.start) ? cfg.start : 0;
      const end = Number.isFinite(cfg.end) ? cfg.end : 36;
      const pointsInGroup = dataPoints.filter(p => p.rawX >= start && p.rawX <= end);
      const startAngle = start * validMultiplier;
      
      const normalizedPoints = pointsInGroup.map((p, idx) => {
        const rawAngle = p.angle;
        let relAngle = rawAngle - startAngle;
        relAngle = ((relAngle % 360) + 360) % 360;
        if (idx === pointsInGroup.length - 1 && relAngle === 0 && pointsInGroup.length > 1) {
          relAngle = 360;
        }
        return {
          rawX: p.rawX,
          originalAngle: p.angle,
          relAngle: relAngle,
          y: Number.isFinite(p.effectiveY) ? p.effectiveY : (Number.isFinite(p.y) ? p.y : 0)
        };
      });

      return {
        id: cfg.id,
        name: cfg.name,
        color: cfg.color,
        start: start,
        end: end,
        points: normalizedPoints
      };
    });

    if (!autoPhaseAlign || rawGroups.length <= 1) {
      return rawGroups;
    }

    // 智能相位锁定：找到 Group 1 的首个主峰角度作为参考基准
    const g1 = rawGroups[0];
    if (!g1 || g1.points.length === 0) return rawGroups;

    const findFirstPeakAngle = (pts) => {
      let maxVal = -Infinity, maxAngle = 0;
      for (let i = 0; i < pts.length; i++) {
        if (pts[i].y > maxVal) {
          maxVal = pts[i].y;
          maxAngle = pts[i].relAngle;
        }
      }
      return maxAngle;
    };

    const g1PeakAngle = findFirstPeakAngle(g1.points);

    // 对后续各组进行峰值相位锁向对齐
    return rawGroups.map((g, gIdx) => {
      if (gIdx === 0 || g.points.length === 0) return g;
      const gPeakAngle = findFirstPeakAngle(g.points);
      const phaseShift = gPeakAngle - g1PeakAngle;

      const alignedPoints = g.points.map((p, idx) => {
        let newRelAngle = p.relAngle - phaseShift;
        newRelAngle = ((newRelAngle % 360) + 360) % 360;
        if (idx === g.points.length - 1 && newRelAngle === 0 && g.points.length > 1) {
          newRelAngle = 360;
        }
        return {
          ...p,
          relAngle: Math.round(newRelAngle)
        };
      });

      return {
        ...g,
        phaseShiftDeg: Math.round(phaseShift),
        points: alignedPoints
      };
    });
  }

  static computeStatistics(groups) {
    if (!Array.isArray(groups) || groups.length === 0) return null;

    const angleMap = new Map();
    groups.forEach((g, gIdx) => {
      g.points.forEach(p => {
        const a = Math.round(p.relAngle);
        if (!angleMap.has(a)) {
          angleMap.set(a, []);
        }
        angleMap.get(a).push({ groupIndex: gIdx, y: p.y });
      });
    });

    const sortedAngles = Array.from(angleMap.keys()).sort((a, b) => a - b);
    if (sortedAngles.length === 0) return null;

    const stepStats = [];

    sortedAngles.forEach(angle => {
      const entries = angleMap.get(angle);
      const values = entries.map(e => e.y);
      const n = values.length;
      
      const sum = values.reduce((acc, val) => acc + val, 0);
      const mean = n > 0 ? sum / n : 0;
      
      let variance = 0;
      if (n > 1) {
        variance = values.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / (n - 1);
      }
      const sd = Math.sqrt(Math.max(0, variance));
      const se = n > 0 ? sd / Math.sqrt(n) : 0;
      const rsd = (Math.abs(mean) > 1e-6) ? (sd / Math.abs(mean)) * 100 : 0;

      stepStats.push({
        relAngle: angle,
        n: n,
        values: values,
        mean: Number(mean.toFixed(2)),
        sd: Number(sd.toFixed(2)),
        se: Number(se.toFixed(2)),
        rsd: Number(rsd.toFixed(2))
      });
    });

    const meanValues = stepStats.map(s => s.mean);
    const maxVal = meanValues.length > 0 ? Math.max(...meanValues) : 0;
    const minVal = meanValues.length > 0 ? Math.min(...meanValues) : 0;
    const maxItem = stepStats.find(s => s.mean === maxVal);
    const minItem = stepStats.find(s => s.mean === minVal);

    let extinctionRatio = '999.00';
    let extinctionRatioDB = '> 30.00';

    if (minVal > 1e-4) {
      const ratio = maxVal / minVal;
      extinctionRatio = ratio.toFixed(2);
      extinctionRatioDB = (10 * Math.log10(ratio)).toFixed(2);
    }

    const sumMaxMin = maxVal + minVal;
    const modulation = (sumMaxMin > 1e-4) ? (((maxVal - minVal) / sumMaxMin) * 100).toFixed(2) : '100.00';
    const dolpEmpirical = (sumMaxMin > 1e-4) ? ((maxVal - minVal) / sumMaxMin) : 1;
    const avgRSD = stepStats.length > 0 ? (stepStats.reduce((a, b) => a + b.rsd, 0) / stepStats.length).toFixed(2) : '0.00';

    return {
      stepStats: stepStats,
      summary: {
        maxIntensity: maxVal,
        maxAngle: maxItem ? maxItem.relAngle : 0,
        minIntensity: minVal,
        minAngle: minItem ? minItem.relAngle : 0,
        extinctionRatio: extinctionRatio,
        extinctionRatioDB: extinctionRatioDB,
        modulationPercent: modulation,
        dolpEmpiricalPercent: (dolpEmpirical * 100).toFixed(2),
        dolpEmpirical: Number(dolpEmpirical.toFixed(4)),
        avgRSD: avgRSD
      }
    };
  }
}

if (typeof window !== 'undefined') {
  window.DataParser = DataParser;
}
