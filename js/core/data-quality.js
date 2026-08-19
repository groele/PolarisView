/**
 * Inspectable quality gate for measurement imports and derived conclusions.
 * It never changes a measurement; it only records evidence and limits claims.
 */
class DataQuality {
  static auditInput(points, multiplier) {
    const issues = [];
    const n = Array.isArray(points) ? points.length : 0;
    if (n < 9) issues.push({ severity: 'error', text: `仅 ${n} 个有效点；不足以支撑稳定的周期拟合（建议至少 9 点/90° 周期）。` });
    const xs = new Set();
    let duplicates = 0;
    let unordered = 0;
    (points || []).forEach((p, i) => {
      const key = String(p.rawX);
      if (xs.has(key)) duplicates++; else xs.add(key);
      if (i && p.rawX < points[i - 1].rawX) unordered++;
    });
    if (duplicates) issues.push({ severity: 'warn', text: `发现 ${duplicates} 个重复 x 坐标；重复值被保留，并会影响逐点统计。` });
    if (unordered) issues.push({ severity: 'warn', text: `发现 ${unordered} 处非递增采样顺序；基线按导入顺序计算，请确认时间顺序。` });
    const angles = (points || []).map(p => p.angle).filter(Number.isFinite);
    const span = angles.length ? Math.max(...angles) - Math.min(...angles) : 0;
    if (span < 90) issues.push({ severity: 'warn', text: `角度覆盖仅 ${span.toFixed(1)}°；无法充分检验 90° 周期的马吕斯响应。` });
    if (!Number.isFinite(multiplier) || multiplier <= 0) issues.push({ severity: 'error', text: '角度换算倍率必须为正数。' });
    return { pointCount: n, angleSpan: Number(span.toFixed(2)), duplicateX: duplicates, unordered, issues };
  }

  static auditProcessing(inputAudit, baselineResult, groups, fitResult, config) {
    const issues = [...(inputAudit.issues || [])];
    const clamped = baselineResult?.telemetry?.clampedPointsCount || 0;
    if (clamped) issues.push({ severity: 'warn', text: `已截断 ${clamped} 个负净值为零；消光比与 DoLP 可能被上调，仅作处理后指标。` });
    if (config.autoPhaseLock) issues.push({ severity: 'warn', text: '已启用自动相位锁定；该操作用于可视化对齐，不能替代机械零位校准或用于评估重复性。' });
    const sizes = (groups || []).map(g => g.points.length);
    if (config.analysisMode === 'independent_cycles' && (groups || []).length < 2) {
      issues.push({ severity: 'warn', text: '仅检测到一个完整/部分周期；可拟合曲线，但不能估计独立重复测量的不确定度。' });
    }
    const memberships = (groups || []).flatMap(g => (g.points || []).map(p => p.sourceIndex).filter(Number.isFinite));
    const uniqueMemberships = new Set(memberships);
    const reusedSourcePoints = memberships.length - uniqueMemberships.size;
    if (reusedSourcePoints && config.analysisMode !== 'legacy_sliding') {
      issues.push({ severity: 'error', text: `发现 ${reusedSourcePoints} 次原始点重复计入分析；独立重复统计要求每个源点只使用一次。` });
    } else if (reusedSourcePoints) {
      issues.push({ severity: 'error', text: `滑动窗口重复使用了 ${reusedSourcePoints} 次原始点；该模式仅供形状诊断，禁止输出独立重复统计量或可报告拟合结论。` });
    }
    if (sizes.some(s => s < 5)) issues.push({ severity: 'warn', text: `至少一组切片少于 5 点（组大小：${sizes.join('/')}）；组间均值与误差带不稳健。` });
    const coherence = this.groupCoherence(groups);
    if (coherence !== null && coherence < 0.4) {
      issues.push({ severity: 'error', text: `三段周期曲线一致性极低（最小相关系数 ${coherence.toFixed(3)}）；不得将它们作为重复测量进行平均。请检查 x 列、数据行顺序和角度倍率。` });
    } else if (coherence !== null && coherence < 0.9) {
      issues.push({ severity: 'warn', text: `三段周期曲线一致性偏低（最小相关系数 ${coherence.toFixed(3)}）；平均曲线仅供排查，不能作为重复测量结论。` });
    }
    if (fitResult && fitResult.params.rSquared < 0.9) issues.push({ severity: 'warn', text: `拟合 R²=${fitResult.params.rSquaredPercent}%；经验谐波模型与数据一致性有限，不应据此作强物理反演。` });
    if (!fitResult) issues.push({ severity: 'error', text: config.fitFailureReason || '拟合未完成；不输出基于拟合的物理参数。' });
    const claimLevel = issues.some(x => x.severity === 'error') ? 'blocked' : issues.some(x => x.severity === 'warn') ? 'qualified' : 'supported';
    return { ...inputAudit, clampedPoints: clamped, groupSizes: sizes, groupCoherence: coherence, reusedSourcePoints, claimLevel, issues };
  }

  static groupCoherence(groups) {
    if (!Array.isArray(groups) || groups.length < 2) return null;
    const usable = groups.filter(g => Array.isArray(g.points) && g.points.length >= 5);
    if (usable.length < 2) return null;
    const correlations = [];
    for (let i = 0; i < usable.length; i++) {
      for (let j = i + 1; j < usable.length; j++) {
        const aMap = new Map(usable[i].points.map(p => [Math.round(p.relAngle * 1000) / 1000, p.y]));
        const bMap = new Map(usable[j].points.map(p => [Math.round(p.relAngle * 1000) / 1000, p.y]));
        const common = [...aMap.keys()].filter(key => bMap.has(key)).sort((x, y) => x - y);
        const a = common.map(key => aMap.get(key));
        const b = common.map(key => bMap.get(key));
        const n = common.length;
        if (n < 5) continue;
        const aa = a.slice(0, n), bb = b.slice(0, n);
        const ma = aa.reduce((s, v) => s + v, 0) / n;
        const mb = bb.reduce((s, v) => s + v, 0) / n;
        let cov = 0, va = 0, vb = 0;
        for (let k = 0; k < n; k++) {
          const da = aa[k] - ma, db = bb[k] - mb;
          cov += da * db; va += da * da; vb += db * db;
        }
        if (va > 1e-12 && vb > 1e-12) correlations.push(cov / Math.sqrt(va * vb));
      }
    }
    return correlations.length ? Math.min(...correlations) : null;
  }

  static format(audit) {
    if (!audit) return '尚未执行质量审查。';
    const coherence = audit.groupCoherence === null || audit.groupCoherence === undefined ? '-' : audit.groupCoherence.toFixed(3);
    const included = Array.isArray(audit.analysisGroups) && audit.analysisGroups.length ? audit.analysisGroups.join('、') : '无';
    const excluded = Array.isArray(audit.excludedGroups) && audit.excludedGroups.length ? `｜已隐藏且不参与分析 ${audit.excludedGroups.join('、')}` : '';
    const parser = audit.parserDiagnostics ? `｜导入接受/拒绝 ${audit.parserDiagnostics.acceptedLines || 0}/${audit.parserDiagnostics.rejectedLines || 0}` : '';
    const head = `有效点 ${audit.pointCount}${parser}｜参与分析 ${included}${excluded}｜角度覆盖 ${audit.angleSpan}°｜重复 x ${audit.duplicateX}｜源点重复计入 ${audit.reusedSourcePoints || 0}｜周期一致性 ${coherence}｜负值截断 ${audit.clampedPoints || 0}`;
    if (!audit.issues.length) return `${head}。未发现自动规则异常；仍需结合实验校准与原始记录判断。`;
    return `${head}。${audit.issues.map(x => `${x.severity === 'error' ? '错误' : '提示'}：${x.text}`).join(' ')}`;
  }
}

if (typeof window !== 'undefined') window.DataQuality = DataQuality;
