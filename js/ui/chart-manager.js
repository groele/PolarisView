/**
 * chart-manager.js (UI Visualization Engine - Robust & High-Res)
 * 工业级鲁棒偏振多维图表渲染引擎：支持容器动态感知、DOM尺寸防崩、极坐标/直角坐标/同图融合全能渲染
 */

class PolarChartManager {
  constructor(polarDomId, cartesianDomId, baselineDomId = null, residualDomId = null, unifiedDomId = null) {
    this.polarDomId = polarDomId;
    this.cartesianDomId = cartesianDomId;
    this.baselineDomId = baselineDomId;
    this.residualDomId = residualDomId;
    this.unifiedDomId = unifiedDomId;

    this.currentData = null;
    this.journalTheme = 'nature';
    this.displayMode = 'all';
    this.filterConfig = {
      type: 'gaussian',
      sigma: 1.2,
      windowSize: 3,
      harmonics: 4,
      enableInterpolation: true
    };
    this.showTheoreticalFit = true;
    this.errorType = 'sd';
    this.radiusZeroBased = false;
    this.resizeRafId = null;

    this.polarAxisConfig = {
      startAngle: 0,
      clockwise: false,
      interval: 30
    };

    window.addEventListener('resize', () => this.resize());
  }

  getDom(domId) {
    return document.getElementById(domId);
  }

  getChartInstance(domId) {
    const dom = this.getDom(domId);
    if (!dom || !window.echarts) return null;
    
    // 如果 dom 处于隐藏状态且宽高为 0，暂不强制报错
    let inst = echarts.getInstanceByDom(dom);
    if (!inst || inst.isDisposed()) {
      try {
        inst = echarts.init(dom, null, { renderer: 'canvas' });
      } catch (e) {
        console.warn(`初始化图表 [${domId}] 提示:`, e);
        return null;
      }
    }
    return inst;
  }

  getPalette() {
    const themes = {
      nature: {
        g1: '#1d4ed8', g2: '#059669', g3: '#d97706', mean: '#dc2626', fit: '#7c3aed',
        smooth: '#2563eb', errArea: 'rgba(220, 38, 38, 0.15)', text: '#0f172a'
      },
      science: {
        g1: '#0284c7', g2: '#10b981', g3: '#f59e0b', mean: '#e11d48', fit: '#4f46e5',
        smooth: '#0ea5e9', errArea: 'rgba(225, 29, 72, 0.15)', text: '#0f172a'
      },
      prl: {
        g1: '#000000', g2: '#2563eb', g3: '#16a34a', mean: '#b91c1c', fit: '#9333ea',
        smooth: '#475569', errArea: 'rgba(185, 28, 28, 0.18)', text: '#000000'
      },
      ieee: {
        g1: '#005596', g2: '#00857c', g3: '#e06d53', mean: '#cc0000', fit: '#5c2d91',
        smooth: '#005596', errArea: 'rgba(204, 0, 0, 0.15)', text: '#111827'
      },
      dark_lab: {
        g1: '#60a5fa', g2: '#34d399', g3: '#fbbf24', mean: '#f87171', fit: '#a78bfa',
        smooth: '#38bdf8', errArea: 'rgba(248, 113, 113, 0.22)', text: '#f8fafc'
      }
    };
    return themes[this.journalTheme] || themes.nature;
  }

  getDolpReferenceRings(summary, fitResult) {
    const c = fitResult?.params?.coeffs;
    const modulation = c ? Math.sqrt(c.A4 * c.A4 + c.B4 * c.B4) : null;
    const min = c && modulation !== null ? Math.max(0, c.A0 - modulation) : summary.minIntensity;
    const max = c && modulation !== null ? c.A0 + modulation : summary.maxIntensity;
    return [
      { value: Number(min.toFixed(2)), label: 'Imin' },
      { value: Number(max.toFixed(2)), label: 'Imax' }
    ].filter(item => Number.isFinite(item.value) && item.value >= 0);
  }

  resize() {
    if (this.resizeRafId) cancelAnimationFrame(this.resizeRafId);
    this.resizeRafId = requestAnimationFrame(() => {
      [this.polarDomId, this.cartesianDomId, this.baselineDomId, this.residualDomId, this.unifiedDomId].forEach(id => {
        if (!id) return;
        const dom = this.getDom(id);
        if (dom && dom.offsetParent !== null) { // 仅当元素处于可见布局中时 resize
          const inst = echarts.getInstanceByDom(dom);
          if (inst && !inst.isDisposed()) {
            try { inst.resize(); } catch (e) {}
          }
        }
      });
    });
  }

  setJournalTheme(theme) {
    this.journalTheme = theme;
    this.render();
  }

  setPolarAxisConfig(cfg) {
    this.polarAxisConfig = { ...this.polarAxisConfig, ...cfg };
    this.render();
  }

  setShowTheoreticalFit(val) {
    this.showTheoreticalFit = val;
    this.render();
  }

  updateData(parsedData) {
    this.currentData = parsedData;
    this.render();
  }

  setDisplayMode(mode) {
    this.displayMode = mode;
    this.render();
  }

  setFilterConfig(config) {
    this.filterConfig = { ...this.filterConfig, ...config };
    this.render();
  }

  setErrorType(type) {
    this.errorType = type;
    this.render();
  }

  setRadiusZeroBased(val) {
    this.radiusZeroBased = val;
    this.render();
  }

  render() {
    if (!this.currentData || !this.currentData.groups || !this.currentData.stats) return;

    const { groups, stats, rawBaselineResult, fitResult } = this.currentData;
    const { stepStats, summary } = stats;
    const palette = this.getPalette();

    let minVal = Infinity;
    let maxVal = -Infinity;
    stepStats.forEach(s => {
      minVal = Math.min(minVal, s.mean - (this.errorType === 'sd' ? s.sd : (this.errorType === 'se' ? s.se : 0)), ...s.values);
      maxVal = Math.max(maxVal, s.mean + (this.errorType === 'sd' ? s.sd : (this.errorType === 'se' ? s.se : 0)), ...s.values);
    });

    const valMargin = (maxVal - minVal) * 0.1 || 50;
    const rMin = this.radiusZeroBased ? 0 : Math.max(0, Math.floor(minVal - valMargin));
    const rMax = Math.ceil(maxVal + valMargin);

    const rawMeanList = stepStats.map(s => s.mean);
    const smoothedMeanList = FilterEngine.applyFilter(rawMeanList, this.filterConfig.type, this.filterConfig);

    // 渲染各个可见图表
    this.renderBaselineChart(rawBaselineResult);
    this.renderCartesian(stepStats, groups, smoothedMeanList, summary, fitResult, palette);
    this.renderPolarOnly(stepStats, groups, smoothedMeanList, summary, fitResult, palette, rMin, rMax);
    this.renderUnifiedComboChart(stepStats, groups, smoothedMeanList, summary, fitResult, palette, rMin, rMax);
    if (fitResult) {
      this.renderResidualChart(fitResult);
    }

    // 触发自适应尺寸校准
    this.resize();
  }

  renderPolarOnly(stepStats, groups, smoothedMeanList, summary, fitResult, palette, rMin, rMax) {
    const chart = this.getChartInstance(this.polarDomId);
    if (!chart) return;

    const polarSeries = [];
    const legendData = [];
    this.getDolpReferenceRings(summary, fitResult).forEach(ref => {
      polarSeries.push({
        name: `DoLP ${ref.label} reference`, type: 'line', coordinateSystem: 'polar',
        showSymbol: false, silent: true, data: Array.from({ length: 37 }, (_, i) => [ref.value, i * 10]),
        lineStyle: { color: '#94a3b8', width: 1, type: 'dashed', opacity: 0.5 }, z: 0
      });
    });

    // 误差阴影带
    if (this.errorType !== 'none' && (this.displayMode === 'all' || this.displayMode === 'mean_error')) {
      const upperData = [];
      const lowerData = [];

      stepStats.forEach((s) => {
        const err = this.errorType === 'sd' ? s.sd : s.se;
        const up = s.mean + err;
        const low = Math.max(0, s.mean - err);
        upperData.push([up, s.relAngle]);
        lowerData.push([low, s.relAngle]);
      });
      if (upperData.length > 0) {
        upperData.push([upperData[0][0], 360]);
        lowerData.push([lowerData[0][0], 360]);
      }

      polarSeries.push({
        name: this.errorType === 'sd' ? '均值 - 标准差 (下界)' : '均值 - 标准误 (下界)',
        type: 'line',
        coordinateSystem: 'polar',
        smooth: 0.3,
        showSymbol: false,
        lineStyle: { opacity: 0 },
        data: lowerData,
        stack: 'error-band',
        silent: true,
        z: 1
      });

      polarSeries.push({
        name: this.errorType === 'sd' ? '均值 ± 标准差 (误差区)' : '均值 ± 标准误 (误差区)',
        type: 'line',
        coordinateSystem: 'polar',
        smooth: 0.3,
        showSymbol: false,
        lineStyle: { opacity: 0 },
        areaStyle: { color: palette.errArea },
        data: upperData.map((pt, i) => [pt[0] - lowerData[i][0], pt[1]]),
        stack: 'error-band',
        silent: true,
        z: 2
      });
      legendData.push(this.errorType === 'sd' ? '均值 ± 标准差 (误差区)' : '均值 ± 标准误 (误差区)');
    }

    groups.forEach((g, gIdx) => {
      const showThisGroup = (this.displayMode === 'all') || (this.displayMode === g.id);
      if (showThisGroup) {
        const linePts = g.points.map(p => [p.y, p.relAngle]);
        if (linePts.length > 0) linePts.push([linePts[0][0], 360]);

        const gColors = [palette.g1, palette.g2, palette.g3];
        legendData.push(g.name);
        polarSeries.push({
          name: g.name,
          type: 'line',
          coordinateSystem: 'polar',
          symbol: 'circle',
          symbolSize: 6,
          showSymbol: true,
          itemStyle: { color: gColors[gIdx] || g.color },
          lineStyle: { width: 1.5, type: 'dashed', opacity: 0.75 },
          data: linePts,
          z: 3
        });
      }
    });

    const showMean = (this.displayMode === 'all' || this.displayMode === 'mean_error');
    if (showMean) {
      const meanPts = stepStats.map(s => [s.mean, s.relAngle]);
      if (meanPts.length > 0) meanPts.push([meanPts[0][0], 360]);

      legendData.push('均值 (Mean)');
      polarSeries.push({
        name: '均值 (Mean)',
        type: 'line',
        coordinateSystem: 'polar',
        symbol: 'diamond',
        symbolSize: 7,
        showSymbol: true,
        itemStyle: { color: palette.mean },
        lineStyle: { width: 2.6 },
        data: meanPts,
        z: 5
      });
    }

    if (this.filterConfig.type !== 'none') {
      let smoothPts = [];
      if (this.filterConfig.enableInterpolation) {
        const ptsForSpline = stepStats.map((s, i) => ({ angle: s.relAngle, y: smoothedMeanList[i] }));
        const dense = FilterEngine.periodicSplineInterpolate(ptsForSpline, 360);
        smoothPts = dense.map(d => [d[1], d[0]]);
      } else {
        smoothPts = stepStats.map((s, i) => [smoothedMeanList[i], s.relAngle]);
        if (smoothPts.length > 0) smoothPts.push([smoothPts[0][0], 360]);
      }

      legendData.push('平滑拟合曲线');
      polarSeries.push({
        name: '平滑拟合曲线',
        type: 'line',
        coordinateSystem: 'polar',
        smooth: true,
        showSymbol: false,
        itemStyle: { color: palette.smooth },
        lineStyle: { width: 2.8 },
        data: smoothPts,
        z: 6
      });
    }

    if (this.showTheoreticalFit && fitResult && fitResult.denseFitCurve) {
      const fitPts = fitResult.denseFitCurve.map(pt => [pt[1], pt[0]]);
      legendData.push('马吕斯理论拟合 (Malus Fit)');
      polarSeries.push({
        name: '马吕斯理论拟合 (Malus Fit)',
        type: 'line',
        coordinateSystem: 'polar',
        smooth: true,
        showSymbol: false,
        itemStyle: { color: palette.fit },
        lineStyle: { width: 2.2, type: 'dotted' },
        data: fitPts,
        z: 7
      });
    }

    const dolpDisplay = fitResult ? fitResult.params.dolpPercent : summary.dolpEmpiricalPercent;

    const polarOption = {
      title: {
        text: '1/2波片偏振极坐标空间分布图 (Polar Intensity Distribution)',
        subtext: `DoLP: ${dolpDisplay}% | Imin/Imax 浅灰虚线参考环 | 消光比: ${summary.extinctionRatio} (${summary.extinctionRatioDB} dB) | 调制度: ${summary.modulationPercent}% | 主轴偏角 θ₀: ${fitResult ? fitResult.params.theta0 : '-'}° | 拟合 R²: ${fitResult ? fitResult.params.rSquaredPercent : '-'}%`,
        left: 'center',
        top: 6,
        textStyle: { fontSize: 13, fontWeight: '700' },
        subtextStyle: { fontSize: 10.5, color: '#64748b' }
      },
      tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
      legend: {
        bottom: 6,
        data: legendData,
        itemGap: 10,
        textStyle: { fontSize: 10.5 }
      },
      polar: {
        center: ['50%', '51%'],
        radius: ['6%', '70%']
      },
      angleAxis: {
        type: 'value',
        startAngle: this.polarAxisConfig.startAngle,
        clockwise: this.polarAxisConfig.clockwise,
        min: 0, max: 360,
        interval: this.polarAxisConfig.interval,
        axisLabel: {
          formatter: '{value}°',
          fontSize: 10.5,
          fontWeight: '600',
          color: '#334155'
        },
        splitLine: { lineStyle: { color: 'rgba(128, 128, 128, 0.25)', type: 'dashed' } }
      },
      radiusAxis: {
        min: rMin, max: rMax,
        axisLabel: {
          formatter: (v) => Math.round(v),
          fontSize: 9.5,
          fontFamily: 'monospace',
          color: '#64748b'
        },
        splitLine: { lineStyle: { color: 'rgba(128, 128, 128, 0.2)' } }
      },
      series: polarSeries
    };

    chart.setOption(polarOption, true);
  }

  renderCartesian(stepStats, groups, smoothedMeanList, summary, fitResult, palette) {
    const chart = this.getChartInstance(this.cartesianDomId);
    if (!chart) return;

    const angles = stepStats.map(s => `${s.relAngle}°`);
    const cartesianSeries = [];
    const legendList = [];
    const gColors = [palette.g1, palette.g2, palette.g3];

    groups.forEach((g, idx) => {
      const pts = g.points.map(p => p.y);
      legendList.push(g.name);
      cartesianSeries.push({
        name: g.name,
        type: 'line',
        data: pts,
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { width: 1.5, type: 'dashed', opacity: 0.8 },
        itemStyle: { color: gColors[idx] }
      });
    });

    legendList.push('均值 (Mean)');
    cartesianSeries.push({
      name: '均值 (Mean)',
      type: 'line',
      data: stepStats.map(s => s.mean),
      symbol: 'diamond',
      symbolSize: 6,
      lineStyle: { width: 2.5 },
      itemStyle: { color: palette.mean }
    });

    if (this.filterConfig.type !== 'none') {
      legendList.push('平滑拟合');
      cartesianSeries.push({
        name: '平滑拟合',
        type: 'line',
        data: smoothedMeanList,
        smooth: true,
        symbol: 'none',
        lineStyle: { width: 2.5 },
        itemStyle: { color: palette.smooth }
      });
    }

    if (this.showTheoreticalFit && fitResult) {
      legendList.push('马吕斯理论拟合');
      const fitLineAtSteps = stepStats.map(st => {
        const rad = (st.relAngle * Math.PI) / 180;
        const c = fitResult.params.coeffs;
        return Number((c.A0 + c.A4 * Math.cos(4 * rad) + c.B4 * Math.sin(4 * rad) + c.A2 * Math.cos(2 * rad) + c.B2 * Math.sin(2 * rad)).toFixed(2));
      });

      cartesianSeries.push({
        name: '马吕斯理论拟合',
        type: 'line',
        data: fitLineAtSteps,
        smooth: true,
        symbol: 'none',
        lineStyle: { width: 2.2, type: 'dotted' },
        itemStyle: { color: palette.fit }
      });
    }

    const dolpDisplay = fitResult ? fitResult.params.dolpPercent : summary.dolpEmpiricalPercent;

    const cartesianOption = {
      title: {
        text: '直角坐标角度-光强响应曲线 (Cartesian Plot)',
        subtext: `DoLP: ${dolpDisplay}% | 消光比: ${summary.extinctionRatio} | 调制度: ${summary.modulationPercent}%`,
        left: 'center',
        top: 8,
        textStyle: { fontSize: 13, fontWeight: '700' },
        subtextStyle: { fontSize: 10, color: '#64748b', lineHeight: 16 }
      },
      tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
      // Keep the metric subtitle and the series legend in separate rows.
      legend: { top: 54, data: legendList, itemGap: 12, textStyle: { fontSize: 10 } },
      grid: { left: '6%', right: '4%', bottom: '12%', top: 88, containLabel: true },
      xAxis: { type: 'category', data: angles, name: '相对角度', axisLabel: { interval: 2, rotate: 25, fontSize: 10 } },
      yAxis: { type: 'value', name: '光强 (Counts)', scale: !this.radiusZeroBased },
      series: cartesianSeries
    };

    chart.setOption(cartesianOption, true);
  }

  renderBaselineChart(baselineResult) {
    if (!baselineResult) return;
    const chart = this.getChartInstance(this.baselineDomId);
    if (!chart) return;

    const { rawPoints, baseline, subtracted, hasSubtracted } = baselineResult;
    const xLabels = rawPoints.map(p => `x:${p.rawX} (${p.angle}°)`);
    const rawYList = rawPoints.map(p => p.y);

    const series = [{
      name: '原始测量光强 (Raw Y)',
      type: 'line',
      data: rawYList,
      symbol: 'circle',
      symbolSize: 4,
      lineStyle: { width: 1.8, color: '#3b82f6' },
      itemStyle: { color: '#3b82f6' }
    }];
    const legend = ['原始测量光强 (Raw Y)'];

    if (hasSubtracted) {
      legend.push('估计背景基线 (Baseline)');
      legend.push('扣除背景后净光强 (Subtracted)');

      series.push({
        name: '估计背景基线 (Baseline)',
        type: 'line',
        data: baseline,
        smooth: true,
        symbol: 'none',
        lineStyle: { width: 2.2, color: '#ef4444', type: 'dashed' },
        itemStyle: { color: '#ef4444' }
      });

      series.push({
        name: '扣除背景后净光强 (Subtracted)',
        type: 'line',
        data: subtracted,
        symbol: 'circle',
        symbolSize: 4,
        lineStyle: { width: 2.2, color: '#10b981' },
        itemStyle: { color: '#10b981' },
        areaStyle: { color: 'rgba(16, 185, 129, 0.12)' }
      });
    }

    const baselineOption = {
      title: { text: 'X-Y 坐标轴体系：原始数据、背景基线与扣除净信号预览', left: 'center', top: 6, textStyle: { fontSize: 13, fontWeight: '700' } },
      tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
      legend: { top: 28, data: legend, textStyle: { fontSize: 10.5 } },
      grid: { left: '5%', right: '4%', bottom: '12%', top: '22%', containLabel: true },
      xAxis: { type: 'category', data: xLabels, name: 'X (物理角度)', axisLabel: { interval: 5, rotate: 25, fontSize: 10 } },
      yAxis: { type: 'value', name: '光强数值', scale: true },
      series: series
    };

    chart.setOption(baselineOption, true);
  }

  renderResidualChart(fitResult) {
    if (!fitResult) return;
    const chart = this.getChartInstance(this.residualDomId);
    if (!chart) return;

    const points = fitResult.fittedPoints;
    const xLabels = points.map(p => `${p.angle}°`);
    const residuals = points.map(p => p.residual);
    const rmse = fitResult.params.rmse;
    const outlierThreshold = 2.5 * rmse;

    const resSeries = [
      {
        name: '拟合残差 (Residual)',
        type: 'bar',
        data: residuals.map(r => ({
          value: r,
          itemStyle: { color: Math.abs(r) > outlierThreshold ? '#ef4444' : '#3b82f6' }
        })),
        barWidth: '50%',
        markLine: {
          silent: true,
          symbol: 'none',
          data: [
            { yAxis: 0, lineStyle: { color: '#64748b', width: 1.5 } },
            { yAxis: outlierThreshold, lineStyle: { color: '#ef4444', type: 'dashed' }, label: { formatter: '+2.5σ 异常线' } },
            { yAxis: -outlierThreshold, lineStyle: { color: '#ef4444', type: 'dashed' }, label: { formatter: '-2.5σ 异常线' } }
          ]
        }
      }
    ];

    const residualOption = {
      title: {
        text: `马吕斯拟合残差分析 (Residual Plot) - RMSE: ${rmse} | 拟合优度 R²: ${fitResult.params.rSquaredPercent}% | DoLP: ${fitResult.params.dolpPercent}%`,
        left: 'center',
        top: 6,
        textStyle: { fontSize: 13, fontWeight: '700' }
      },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { left: '5%', right: '5%', bottom: '12%', top: '22%', containLabel: true },
      xAxis: { type: 'category', data: xLabels, name: '角度', axisLabel: { interval: 5, rotate: 25, fontSize: 10 } },
      yAxis: { type: 'value', name: '残差 (Counts)' },
      series: resSeries
    };

    chart.setOption(residualOption, true);
  }

  renderUnifiedComboChart(stepStats, groups, smoothedMeanList, summary, fitResult, palette, rMin, rMax) {
    const chart = this.getChartInstance(this.unifiedDomId);
    if (!chart) return;

    const angles = stepStats.map(s => `${s.relAngle}°`);
    const gColors = [palette.g1, palette.g2, palette.g3];
    const legendList = [];
    const comboSeries = [];

    this.getDolpReferenceRings(summary, fitResult).forEach(ref => {
      comboSeries.push({
        name: `DoLP ${ref.label} reference`, type: 'line', coordinateSystem: 'polar', polarIndex: 0,
        showSymbol: false, silent: true, data: Array.from({ length: 37 }, (_, i) => [ref.value, i * 10]),
        lineStyle: { color: '#94a3b8', width: 1, type: 'dashed', opacity: 0.5 }, z: 0
      });
    });

    if (this.errorType !== 'none' && (this.displayMode === 'all' || this.displayMode === 'mean_error')) {
      const upperData = [];
      const lowerData = [];
      stepStats.forEach(s => {
        const err = this.errorType === 'sd' ? s.sd : s.se;
        upperData.push([s.mean + err, s.relAngle]);
        lowerData.push([Math.max(0, s.mean - err), s.relAngle]);
      });
      if (upperData.length > 0) {
        upperData.push([upperData[0][0], 360]);
        lowerData.push([lowerData[0][0], 360]);
      }

      comboSeries.push({
        name: '均值误差下界',
        type: 'line',
        coordinateSystem: 'polar',
        polarIndex: 0,
        smooth: 0.3,
        showSymbol: false,
        lineStyle: { opacity: 0 },
        data: lowerData,
        stack: 'combo-err',
        silent: true,
        z: 1
      });

      comboSeries.push({
        name: '误差阴影带',
        type: 'line',
        coordinateSystem: 'polar',
        polarIndex: 0,
        smooth: 0.3,
        showSymbol: false,
        lineStyle: { opacity: 0 },
        areaStyle: { color: palette.errArea },
        data: upperData.map((pt, i) => [pt[0] - lowerData[i][0], pt[1]]),
        stack: 'combo-err',
        silent: true,
        z: 2
      });
    }

    groups.forEach((g, idx) => {
      legendList.push(g.name);
      const polarPts = g.points.map(p => [p.y, p.relAngle]);
      if (polarPts.length > 0) polarPts.push([polarPts[0][0], 360]);

      comboSeries.push({
        name: g.name,
        type: 'line',
        coordinateSystem: 'polar',
        polarIndex: 0,
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { width: 1.5, type: 'dashed', opacity: 0.8 },
        itemStyle: { color: gColors[idx] },
        data: polarPts,
        z: 3
      });

      comboSeries.push({
        name: g.name,
        type: 'line',
        coordinateSystem: 'cartesian2d',
        xAxisIndex: 0,
        yAxisIndex: 0,
        symbol: 'circle',
        symbolSize: 4,
        lineStyle: { width: 1.5, type: 'dashed', opacity: 0.8 },
        itemStyle: { color: gColors[idx] },
        data: g.points.map(p => p.y),
        z: 3
      });
    });

    legendList.push('均值 (Mean)');
    const polarMeanPts = stepStats.map(s => [s.mean, s.relAngle]);
    if (polarMeanPts.length > 0) polarMeanPts.push([polarMeanPts[0][0], 360]);

    comboSeries.push({
      name: '均值 (Mean)',
      type: 'line',
      coordinateSystem: 'polar',
      polarIndex: 0,
      symbol: 'diamond',
      symbolSize: 6,
      lineStyle: { width: 2.2 },
      itemStyle: { color: palette.mean },
      data: polarMeanPts,
      z: 5
    });

    comboSeries.push({
      name: '均值 (Mean)',
      type: 'line',
      coordinateSystem: 'cartesian2d',
      xAxisIndex: 0,
      yAxisIndex: 0,
      symbol: 'diamond',
      symbolSize: 5,
      lineStyle: { width: 2.2 },
      itemStyle: { color: palette.mean },
      data: stepStats.map(s => s.mean),
      z: 5
    });

    if (this.filterConfig.type !== 'none') {
      legendList.push('平滑拟合');
      let polarSmoothPts = [];
      if (this.filterConfig.enableInterpolation) {
        const ptsForSpline = stepStats.map((s, i) => ({ angle: s.relAngle, y: smoothedMeanList[i] }));
        const dense = FilterEngine.periodicSplineInterpolate(ptsForSpline, 360);
        polarSmoothPts = dense.map(d => [d[1], d[0]]);
      } else {
        polarSmoothPts = stepStats.map((s, i) => [smoothedMeanList[i], s.relAngle]);
        if (polarSmoothPts.length > 0) polarSmoothPts.push([polarSmoothPts[0][0], 360]);
      }

      comboSeries.push({
        name: '平滑拟合',
        type: 'line',
        coordinateSystem: 'polar',
        polarIndex: 0,
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 2.5 },
        itemStyle: { color: palette.smooth },
        data: polarSmoothPts,
        z: 6
      });

      comboSeries.push({
        name: '平滑拟合',
        type: 'line',
        coordinateSystem: 'cartesian2d',
        xAxisIndex: 0,
        yAxisIndex: 0,
        smooth: true,
        symbol: 'none',
        lineStyle: { width: 2.5 },
        itemStyle: { color: palette.smooth },
        data: smoothedMeanList,
        z: 6
      });
    }

    if (this.showTheoreticalFit && fitResult) {
      legendList.push('马吕斯理论拟合');
      if (fitResult.denseFitCurve) {
        comboSeries.push({
          name: '马吕斯理论拟合',
          type: 'line',
          coordinateSystem: 'polar',
          polarIndex: 0,
          smooth: true,
          showSymbol: false,
          lineStyle: { width: 2.0, type: 'dotted' },
          itemStyle: { color: palette.fit },
          data: fitResult.denseFitCurve.map(pt => [pt[1], pt[0]]),
          z: 7
        });
      }

      const fitLineAtSteps = stepStats.map(st => {
        const rad = (st.relAngle * Math.PI) / 180;
        const c = fitResult.params.coeffs;
        return Number((c.A0 + c.A4 * Math.cos(4 * rad) + c.B4 * Math.sin(4 * rad) + c.A2 * Math.cos(2 * rad) + c.B2 * Math.sin(2 * rad)).toFixed(2));
      });

      comboSeries.push({
        name: '马吕斯理论拟合',
        type: 'line',
        coordinateSystem: 'cartesian2d',
        xAxisIndex: 0,
        yAxisIndex: 0,
        smooth: true,
        symbol: 'none',
        lineStyle: { width: 2.0, type: 'dotted' },
        itemStyle: { color: palette.fit },
        data: fitLineAtSteps,
        z: 7
      });
    }

    const dolpDisplay = fitResult ? fitResult.params.dolpPercent : summary.dolpEmpiricalPercent;

    const comboOption = {
      title: [
        {
          text: `极坐标花样 (DoLP: ${dolpDisplay}%)`,
          left: '26%',
          top: 10,
          textAlign: 'center',
          textStyle: { fontSize: 12.5, fontWeight: '700' }
        },
        {
          text: `直角坐标角度展开 (ER: ${summary.extinctionRatio})`,
          left: '74%',
          top: 10,
          textAlign: 'center',
          textStyle: { fontSize: 12.5, fontWeight: '700' }
        }
      ],
      tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
      legend: {
        bottom: 6,
        data: legendList,
        textStyle: { fontSize: 10.5 }
      },
      polar: {
        center: ['26%', '52%'],
        radius: ['6%', '68%']
      },
      angleAxis: {
        polarIndex: 0,
        type: 'value',
        startAngle: this.polarAxisConfig.startAngle,
        clockwise: this.polarAxisConfig.clockwise,
        min: 0, max: 360,
        interval: this.polarAxisConfig.interval,
        axisLabel: { formatter: '{value}°', fontSize: 10, color: '#334155' },
        splitLine: { lineStyle: { color: 'rgba(128, 128, 128, 0.25)', type: 'dashed' } }
      },
      radiusAxis: {
        polarIndex: 0,
        min: rMin, max: rMax,
        axisLabel: { formatter: (v) => Math.round(v), fontSize: 9, fontFamily: 'monospace' },
        splitLine: { lineStyle: { color: 'rgba(128, 128, 128, 0.2)' } }
      },
      grid: {
        left: '54%',
        right: '4%',
        top: '16%',
        bottom: '16%',
        containLabel: true
      },
      xAxis: {
        gridIndex: 0,
        type: 'category',
        data: angles,
        name: '相对角度',
        axisLabel: { interval: 3, rotate: 25, fontSize: 9 }
      },
      yAxis: {
        gridIndex: 0,
        type: 'value',
        name: '光强 (Counts)',
        scale: !this.radiusZeroBased
      },
      series: comboSeries
    };

    chart.setOption(comboOption, true);
  }

  async exportImage(chartType = 'polar', format = 'png', pixelRatio = 3) {
    if (chartType === 'dual') {
      const pChart = this.getChartInstance(this.polarDomId);
      const bChart = this.getChartInstance(this.baselineDomId);
      await this.exportDualStitchedImage(pChart, bChart, format, pixelRatio);
      return;
    }

    let targetDomId = this.polarDomId;
    if (chartType === 'cartesian') targetDomId = this.cartesianDomId;
    if (chartType === 'baseline') targetDomId = this.baselineDomId;
    if (chartType === 'residual') targetDomId = this.residualDomId;
    if (chartType === 'unified') targetDomId = this.unifiedDomId;

    const targetChart = this.getChartInstance(targetDomId);
    if (!targetChart || targetChart.isDisposed()) return;

    try {
      const url = targetChart.getDataURL({
        type: format === 'svg' ? 'svg' : 'png',
        pixelRatio: pixelRatio,
        backgroundColor: '#ffffff'
      });
      this.triggerDownload(url, `polarization_${chartType}_plot.${format}`);
    } catch (e) {
      console.error('导出图像异常:', e);
      alert('导出图像失败，请重试');
    }
  }


  async exportDualStitchedImage(chartA, chartB, format = 'png', pixelRatio = 3) {
    if (!chartA || !chartB || chartA.isDisposed() || chartB.isDisposed()) return;

    try {
      const urlA = chartA.getDataURL({ type: 'png', pixelRatio, backgroundColor: '#ffffff' });
      const urlB = chartB.getDataURL({ type: 'png', pixelRatio, backgroundColor: '#ffffff' });

      const imgA = new Image();
      const imgB = new Image();

      await Promise.all([
        new Promise((res, rej) => { imgA.onload = res; imgA.onerror = rej; imgA.src = urlA; }),
        new Promise((res, rej) => { imgB.onload = res; imgB.onerror = rej; imgB.src = urlB; })
      ]);

      const gap = 16 * pixelRatio;
      const canvas = document.createElement('canvas');
      canvas.width = imgA.width + imgB.width + gap;
      canvas.height = Math.max(imgA.height, imgB.height);

      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.drawImage(imgA, 0, 0);
      ctx.drawImage(imgB, imgA.width + gap, 0);

      const stitchedUrl = canvas.toDataURL(format === 'svg' ? 'image/png' : `image/${format}`);
      this.triggerDownload(stitchedUrl, `polarization_dual_comparison_plot.${format === 'svg' ? 'png' : format}`);
    } catch (e) {
      console.error('双联拼接导出异常:', e);
      alert('双联图导出失败，请重试');
    }
  }

  triggerDownload(dataUrl, filename) {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

if (typeof window !== 'undefined') {
  window.PolarChartManager = PolarChartManager;
}
