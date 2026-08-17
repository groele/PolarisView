/**
 * report-engine.js (UI Report Engine - Enhanced DoLP & Publication Quality)
 * 学术级光学实验分析报告自动生成器 (DoLP 线偏振度、Stokes 偏振态深度解算与出版级高清排版)
 */

class ReportEngine {
  /**
   * 生成专属高分辨率极坐标图表 DataURL
   */
  static async generateHighResPolarImage(appState) {
    if (!window.echarts || !appState || !appState.stats) return '';

    const offscreenDom = document.createElement('div');
    offscreenDom.style.width = '880px';
    offscreenDom.style.height = '600px';
    offscreenDom.style.position = 'absolute';
    offscreenDom.style.left = '-9999px';
    offscreenDom.style.top = '-9999px';
    document.body.appendChild(offscreenDom);

    let chart = null;
    try {
      chart = echarts.init(offscreenDom, null, {
        renderer: 'canvas',
        width: 880,
        height: 600
      });

      const { groups, stats, fitResult } = appState;
      const { stepStats } = stats;

      const palette = {
        g1: '#1d4ed8', g2: '#059669', g3: '#d97706', mean: '#dc2626', fit: '#7c3aed',
        smooth: '#2563eb', errArea: 'rgba(220, 38, 38, 0.12)'
      };

      let minVal = Infinity, maxVal = -Infinity;
      stepStats.forEach(s => {
        const samples = (s.values || []).filter(Number.isFinite);
        minVal = Math.min(minVal, s.mean - s.sd, ...samples);
        maxVal = Math.max(maxVal, s.mean + s.sd, ...samples);
      });
      const margin = (maxVal - minVal) * 0.1 || 50;
      const rMin = Math.max(0, Math.floor(minVal - margin));
      const rMax = Math.ceil(maxVal + margin);

      const rawMeanList = stepStats.map(s => s.mean);
      const smoothedList = FilterEngine.applyFilter(rawMeanList, 'gaussian', { sigma: 1.2 });

      const polarSeries = [];
      const legendData = [];

      // 1. 误差带
      const upperData = [];
      const lowerData = [];
      stepStats.forEach(s => {
        upperData.push([s.mean + s.sd, s.relAngle]);
        lowerData.push([Math.max(0, s.mean - s.sd), s.relAngle]);
      });
      if (upperData.length > 0) {
        upperData.push([upperData[0][0], 360]);
        lowerData.push([lowerData[0][0], 360]);
      }

      polarSeries.push({
        name: '均值下界',
        type: 'line',
        coordinateSystem: 'polar',
        smooth: 0.3,
        showSymbol: false,
        lineStyle: { opacity: 0 },
        data: lowerData,
        stack: 'rep-err',
        silent: true,
        z: 1
      });

      polarSeries.push({
        name: '标准差误差带 (±1σ)',
        type: 'line',
        coordinateSystem: 'polar',
        smooth: 0.3,
        showSymbol: false,
        lineStyle: { opacity: 0 },
        areaStyle: { color: palette.errArea },
        data: upperData.map((pt, i) => [pt[0] - lowerData[i][0], pt[1]]),
        stack: 'rep-err',
        silent: true,
        z: 2
      });
      legendData.push('标准差误差带 (±1σ)');

      // 2. 三组曲线
      groups.forEach((g, gIdx) => {
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
          itemStyle: { color: gColors[gIdx] },
          lineStyle: { width: 1.5, type: 'dashed', opacity: 0.75 },
          data: linePts,
          z: 3
        });
      });

      // 3. 均值
      legendData.push('均值 (Mean)');
      const meanPts = stepStats.map(s => [s.mean, s.relAngle]);
      if (meanPts.length > 0) meanPts.push([meanPts[0][0], 360]);
      polarSeries.push({
        name: '均值 (Mean)',
        type: 'line',
        coordinateSystem: 'polar',
        symbol: 'diamond',
        symbolSize: 7,
        showSymbol: true,
        itemStyle: { color: palette.mean },
        lineStyle: { width: 2.5 },
        data: meanPts,
        z: 5
      });

      // 4. 平滑拟合曲线 (360 点样条)
      const ptsForSpline = stepStats.map((s, i) => ({ angle: s.relAngle, y: smoothedList[i] }));
      const denseSpline = FilterEngine.periodicSplineInterpolate(ptsForSpline, 360);
      legendData.push('高斯平滑曲线');
      polarSeries.push({
        name: '高斯平滑曲线',
        type: 'line',
        coordinateSystem: 'polar',
        smooth: true,
        showSymbol: false,
        itemStyle: { color: palette.smooth },
        lineStyle: { width: 2.8 },
        data: denseSpline.map(d => [d[1], d[0]]),
        z: 6
      });

      // 5. 马吕斯理论拟合
      if (fitResult && fitResult.denseFitCurve) {
        legendData.push('马吕斯理论拟合 (Malus Fit)');
        polarSeries.push({
          name: '马吕斯理论拟合 (Malus Fit)',
          type: 'line',
          coordinateSystem: 'polar',
          smooth: true,
          showSymbol: false,
          itemStyle: { color: palette.fit },
          lineStyle: { width: 2.2, type: 'dotted' },
          data: fitResult.denseFitCurve.map(pt => [pt[1], pt[0]]),
          z: 7
        });
      }

      const option = {
        backgroundColor: '#ffffff',
        legend: {
          bottom: 15,
          itemGap: 18,
          data: legendData,
          textStyle: { fontSize: 11, color: '#334155', fontFamily: 'sans-serif' }
        },
        polar: {
          center: ['50%', '48%'],
          radius: ['6%', '76%']
        },
        angleAxis: {
          type: 'value',
          startAngle: 0,
          clockwise: false,
          min: 0,
          max: 360,
          interval: 30,
          axisLabel: {
            formatter: '{value}°',
            fontSize: 12,
            color: '#1e293b',
            fontWeight: 'bold',
            fontFamily: 'sans-serif'
          },
          splitLine: { lineStyle: { color: 'rgba(100, 116, 139, 0.28)', type: 'dashed' } }
        },
        radiusAxis: {
          min: rMin,
          max: rMax,
          axisLabel: {
            formatter: (v) => Math.round(v),
            fontSize: 11,
            color: '#64748b',
            fontFamily: 'monospace'
          },
          splitLine: { lineStyle: { color: 'rgba(100, 116, 139, 0.2)' } }
        },
        series: polarSeries
      };

      chart.setOption({ ...option, animation: false }, true);
      await this.waitForStableRender(chart);
      return chart.getDataURL({
        type: 'png',
        pixelRatio: 2,
        backgroundColor: '#ffffff'
      });
    } catch (err) {
      console.error('离屏极坐标图生成异常:', err);
      return '';
    } finally {
      if (chart) {
        try { chart.dispose(); } catch (e) {}
      }
      if (offscreenDom.parentNode) {
        offscreenDom.parentNode.removeChild(offscreenDom);
      }
    }
  }

  /**
   * 生成专属高分辨率直角坐标展开图
   */
  static async generateHighResCartesianImage(appState) {
    if (!window.echarts || !appState || !appState.stats) return '';

    const offscreenDom = document.createElement('div');
    offscreenDom.style.width = '880px';
    offscreenDom.style.height = '420px';
    offscreenDom.style.position = 'absolute';
    offscreenDom.style.left = '-9999px';
    offscreenDom.style.top = '-9999px';
    document.body.appendChild(offscreenDom);

    let chart = null;
    try {
      chart = echarts.init(offscreenDom, null, {
        renderer: 'canvas',
        width: 880,
        height: 420
      });

      const { groups, stats, fitResult } = appState;
      const { stepStats } = stats;

      const angles = stepStats.map(s => `${s.relAngle}°`);
      const palette = { g1: '#1d4ed8', g2: '#059669', g3: '#d97706', mean: '#dc2626', fit: '#7c3aed' };
      const series = [];
      const legendList = [];

      groups.forEach((g, idx) => {
        legendList.push(g.name);
        series.push({
          name: g.name,
          type: 'line',
          data: g.points.map(p => p.y),
          symbol: 'circle',
          symbolSize: 5,
          lineStyle: { width: 1.5, type: 'dashed', opacity: 0.8 },
          itemStyle: { color: [palette.g1, palette.g2, palette.g3][idx] }
        });
      });

      legendList.push('均值 (Mean)');
      series.push({
        name: '均值 (Mean)',
        type: 'line',
        data: stepStats.map(s => s.mean),
        symbol: 'diamond',
        symbolSize: 6,
        lineStyle: { width: 2.5 },
        itemStyle: { color: palette.mean }
      });

      if (fitResult) {
        legendList.push('马吕斯拟合');
        const fitLine = stepStats.map(st => {
          const rad = (st.relAngle * Math.PI) / 180;
          const c = fitResult.params.coeffs;
          return Number((c.A0 + c.A4 * Math.cos(4 * rad) + c.B4 * Math.sin(4 * rad) + c.A2 * Math.cos(2 * rad) + c.B2 * Math.sin(2 * rad)).toFixed(2));
        });
        series.push({
          name: '马吕斯拟合',
          type: 'line',
          data: fitLine,
          smooth: true,
          symbol: 'none',
          lineStyle: { width: 2.2, type: 'dotted' },
          itemStyle: { color: palette.fit }
        });
      }

      const option = {
        backgroundColor: '#ffffff',
        legend: { top: 10, data: legendList, textStyle: { fontSize: 11, color: '#334155' } },
        grid: { left: '7%', right: '4%', bottom: '15%', top: '16%', containLabel: true },
        xAxis: { type: 'category', data: angles, name: '相对角度', axisLabel: { interval: 2, rotate: 25, fontSize: 10 } },
        yAxis: { type: 'value', name: '光强 (Counts)', scale: true },
        series: series
      };

      chart.setOption({ ...option, animation: false }, true);
      await this.waitForStableRender(chart);
      return chart.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#ffffff' });
    } catch (err) {
      console.error('离屏直角坐标图生成异常:', err);
      return '';
    } finally {
      if (chart) {
        try { chart.dispose(); } catch (e) {}
      }
      if (offscreenDom.parentNode) {
        offscreenDom.parentNode.removeChild(offscreenDom);
      }
    }
  }

  /**
   * 生成并打开排版精美的学术实验报告
   */
  static waitForStableRender(chart) {
    return new Promise(resolve => {
      let resolved = false;
      const finish = () => {
        if (resolved) return;
        resolved = true;
        try { chart.off('finished', finish); } catch (e) {}
        resolve();
      };
      chart.on('finished', finish);
      // ECharts may complete synchronously for a canvas export; this fallback
      // waits for two paint opportunities without making a blank image likely.
      requestAnimationFrame(() => requestAnimationFrame(finish));
      setTimeout(finish, 160);
    });
  }

  static async generateAndOpenReport(appState) {
    if (!appState || !appState.stats) {
      alert('暂无有效实验数据可生成报告！');
      return;
    }

    // Must be opened inside the user-click call stack; otherwise browsers block
    // it after the asynchronous chart paint wait.
    const reportWin = window.open('', '_blank');
    if (!reportWin) {
      alert('报告窗口被浏览器拦截，请允许此扩展打开新标签页后重试。');
      return;
    }
    reportWin.document.open();
    reportWin.document.write('<!doctype html><title>正在生成报告</title><p style="font-family:sans-serif;padding:2rem">正在渲染数据预览图…</p>');
    reportWin.document.close();

    const { stats, fitResult, qualityAudit, provenance } = appState;
    const { summary, stepStats } = stats;
    const p = fitResult ? fitResult.params : {};
    const dateStr = new Date().toLocaleString();

    const [polarImgUrl, cartesianImgUrl] = await Promise.all([
      this.generateHighResPolarImage(appState),
      this.generateHighResCartesianImage(appState)
    ]);

    let tableRowsHtml = '';
    stepStats.forEach(st => {
      tableRowsHtml += `
        <tr>
          <td>${st.relAngle}°</td>
          <td>${st.values[0] !== undefined ? st.values[0] : '-'}</td>
          <td>${st.values[1] !== undefined ? st.values[1] : '-'}</td>
          <td>${st.values[2] !== undefined ? st.values[2] : '-'}</td>
          <td style="font-weight:bold;color:#b91c1c;">${st.mean}</td>
          <td>±${st.sd}</td>
          <td>±${st.se}</td>
          <td>${st.rsd}%</td>
        </tr>
      `;
    });

    const reportHtml = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>1/2波片旋转测量偏振特性学术分析报告</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Times New Roman", SimSun, "Songti SC", serif;
      line-height: 1.6;
      color: #0f172a;
      max-width: 960px;
      margin: 0 auto;
      padding: 36px 28px;
      background: #ffffff;
    }
    .report-header {
      text-align: center;
      border-bottom: 2px solid #1e293b;
      padding-bottom: 16px;
      margin-bottom: 28px;
    }
    .report-title {
      font-size: 24px;
      font-weight: 800;
      color: #0f172a;
      margin: 0 0 8px 0;
      letter-spacing: 0.5px;
    }
    .report-subtitle {
      font-size: 13px;
      color: #64748b;
      margin: 0;
    }
    .section-title {
      font-size: 16px;
      font-weight: 700;
      color: #1e3a8a;
      border-left: 4px solid #2563eb;
      padding-left: 10px;
      margin-top: 30px;
      margin-bottom: 14px;
    }
    .metrics-table, .data-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
      margin-bottom: 18px;
    }
    .metrics-table th, .metrics-table td, .data-table th, .data-table td {
      border: 1px solid #cbd5e1;
      padding: 8px 12px;
      text-align: center;
    }
    .metrics-table th, .data-table th {
      background-color: #f1f5f9;
      font-weight: 700;
      color: #334155;
    }
    .polar-figure-card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 16px;
      margin: 16px 0 24px 0;
      text-align: center;
      box-shadow: 0 1px 3px rgba(0,0,0,0.04);
    }
    .polar-img {
      max-width: 100%;
      height: auto;
      display: block;
      margin: 0 auto;
      border-radius: 4px;
    }
    .figure-caption {
      font-size: 13px;
      color: #475569;
      margin-top: 10px;
      font-weight: 500;
    }
    .figure-caption b {
      color: #0f172a;
    }
    .btn-print {
      position: fixed;
      top: 24px;
      right: 24px;
      padding: 10px 20px;
      background: #2563eb;
      color: #ffffff;
      border: none;
      border-radius: 6px;
      font-weight: 700;
      font-size: 14px;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(37,99,235,0.3);
      transition: all 0.15s ease;
      z-index: 100;
    }
    .btn-print:hover {
      background: #1d4ed8;
      box-shadow: 0 6px 16px rgba(37,99,235,0.4);
    }
    .btn-export-html {
      position: fixed;
      top: 70px;
      right: 24px;
      padding: 8px 16px;
      background: #ffffff;
      color: #1d4ed8;
      border: 1px solid #93c5fd;
      border-radius: 6px;
      font-weight: 700;
      font-size: 13px;
      cursor: pointer;
      box-shadow: 0 2px 7px rgba(15, 23, 42, 0.1);
      z-index: 100;
    }
    .btn-export-html:hover { background: #eff6ff; border-color: #2563eb; }
    .btn-print:disabled { opacity: 0.72; cursor: wait; }
    @media print {
      .btn-print, .btn-export-html { display: none; }
      body { padding: 0; max-width: 100%; }
      .polar-figure-card { box-shadow: none; border-color: #cbd5e1; }
    }
    @page { size: A4; margin: 12mm; }
  </style>
</head>
<body>
  <button id="btnPrintPdf" class="btn-print" type="button">打印 / 导出为 PDF</button>
  <button id="btnExportHtml" class="btn-export-html" type="button">导出 HTML</button>

  <div class="report-header">
    <h1 class="report-title">1/2波片旋转测量偏振特性学术分析报告</h1>
    <div class="report-subtitle">Half-Wave Plate Polarization & Malus Inversion Report • 实验日期: ${dateStr}</div>
  </div>

  <div class="section-title">1. 核心光学偏振特征参数 (含 DoLP 线偏振度)</div>
  <table class="metrics-table">
    <tr>
      <th>线偏振度 (DoLP)</th>
      <td><b style="color:#2563eb;font-size:16px;">${p.dolpPercent || summary.dolpEmpiricalPercent}%</b></td>
      <th>消光比 (Extinction Ratio)</th>
      <td><b style="color:#059669;font-size:16px;">${summary.extinctionRatio}</b> (${summary.extinctionRatioDB} dB)</td>
    </tr>
    <tr>
      <th>调制度 (Modulation Depth)</th>
      <td><b>${summary.modulationPercent}%</b></td>
      <th>平均相对标准差 (RSD)</th>
      <td>${summary.avgRSD}%</td>
    </tr>
    <tr>
      <th>最大净光强 (峰值)</th>
      <td>${summary.maxIntensity} Counts (${summary.maxAngle}°)</td>
      <th>最小净光强 (谷值)</th>
      <td>${summary.minIntensity} Counts (${summary.minAngle}°)</td>
    </tr>
  </table>

  <div class="section-title">2. 马吕斯定律理论拟合与波片参数反演结果</div>
  <table class="metrics-table">
    <tr>
      <th>快轴初始偏角 θ₀</th>
      <td><b style="color:#059669;font-size:15px;">${p.theta0 || '-'}°</b></td>
      <th>拟合优度 (R²)</th>
      <td><b style="color:#2563eb;font-size:15px;">${p.rSquaredPercent || '-'}%</b></td>
    </tr>
    <tr>
      <th>二/四阶谐波诊断量</th>
      <td>${p.retardanceError || '-'}°（模型依赖，非独立波片延迟标定）</td>
      <th>均方根误差 (RMSE)</th>
      <td>${p.rmse || '-'} Counts</td>
    </tr>
    <tr>
      <th>理论调制幅度 I₀</th>
      <td>${p.amplitude || '-'} Counts</td>
      <th>谐波解算线偏度 DoLP</th>
      <td><b>${p.dolpHarmonicPercent || '-'}%</b></td>
    </tr>
  </table>

  <div class="section-title">3. 极坐标空间光强分布图 (Polar Intensity Distribution)</div>
  <div class="polar-figure-card">
    <img src="${polarImgUrl}" class="polar-img" alt="1/2波片旋转测量极坐标图">
    <div class="figure-caption">
      <b>图 1</b>: 1/2波片旋转 360° 空间偏振四瓣花样响应（含 Group 1/2/3 对齐散点、均值折线、±1σ 标准差半透明阴影包络带与高精度马吕斯拟合理论线）。
    </div>
  </div>

  <div class="section-title">4. 直角坐标角度展开与周期响应对比</div>
  <div class="polar-figure-card">
    <img src="${cartesianImgUrl}" class="polar-img" alt="直角坐标角度展开响应图">
    <div class="figure-caption">
      <b>图 2</b>: 0°~360° 相对角度轴上的周期光强响应曲线与马吕斯理论谐波拟合线。
    </div>
  </div>

  <div class="section-title">5. 三组切片对齐与逐点统计明细</div>
  <table class="data-table">
    <thead>
      <tr>
        <th>相对角度</th>
        <th>Group 1</th>
        <th>Group 2</th>
        <th>Group 3</th>
        <th>均值 (Mean)</th>
        <th>标准差 (SD)</th>
        <th>标准误 (SE)</th>
        <th>RSD%</th>
      </tr>
    </thead>
    <tbody>
      ${tableRowsHtml}
    </tbody>
  </table>

  <div class="section-title">6. 数据质量、处理可追溯性与结论边界</div>
  <p style="font-size:13px;line-height:1.75;color:#334155;background:#f8fafc;padding:14px;border-radius:6px;border:1px solid #e2e8f0;">
    <b>结论状态：</b>${qualityAudit?.claimLevel || 'unknown'}。${DataQuality.format(qualityAudit)}<br>
    <b>处理记录：</b>${provenance?.processedAt || '-'}；基线=${provenance?.baseline?.algorithm || '-'}；参数=${JSON.stringify(provenance?.baseline?.options || {})}；负值截断=${provenance?.baseline?.clampZero ? '开启' : '关闭'}；相位对齐=${provenance?.phaseAlignment || '关闭'}。<br>
    <b>解释限制：</b>DoLP、消光比和拟合参数均是此处理配置下的派生结果。自动相位对齐只用于展示；若启用负值截断，相关指标可能偏高。仅凭该强度扫描与经验谐波模型，不能将二/四阶谐波比作为独立的波片延迟标定；需结合已知输入偏振、检偏器零位、暗场/空白和独立校准测量。
  </p>

  <div class="section-title">7. 偏振物理评述</div>
  <p style="font-size:13px;line-height:1.75;color:#334155;background:#f8fafc;padding:14px;border-radius:6px;border:1px solid #e2e8f0;">
    本次实验通过旋转 1/2 波片记录强度响应，并按当前切片规则计算重复测量统计量。
    在当前经验谐波模型下，拟合 R² 为 <b>${p.rSquaredPercent || '-'}%</b>、RMSE 为 <b>${p.rmse || '-'} Counts</b>，主轴方向的模型估计为 <b>θ₀ = ${p.theta0 || '-'}°</b>；这些数值应与仪器零位和独立校准共同解释。
    <br><br>
    <b>线偏振度 (DoLP) 分析</b>：在当前基线、切片和拟合配置下，派生 DoLP 为 <b>${p.dolpPercent || summary.dolpEmpiricalPercent}%</b>，消光比为 <b>${summary.extinctionRatio} (${summary.extinctionRatioDB} dB)</b>，调制度为 <b>${summary.modulationPercent}%</b>。这些结果描述数据与模型的一致程度，不单独证明偏振纯度、仪器精度或波片参数；应报告暗场、空白、零位与重复测量验证。
  </p>
</body>
</html>
    `;

    reportWin.document.open();
    reportWin.document.write(reportHtml);
    reportWin.document.close();

    // Do not use inline onclick: extension CSP can silently block it.
    const printButton = reportWin.document.getElementById('btnPrintPdf');
    if (printButton) {
      const resetPrintButton = () => {
        printButton.disabled = false;
        printButton.textContent = '打印 / 导出为 PDF';
      };
      printButton.addEventListener('click', () => {
        printButton.disabled = true;
        printButton.textContent = '正在打开打印窗口…';
        try {
          reportWin.focus();
          reportWin.print();
        } catch (err) {
          console.error('打开打印对话框失败:', err);
          alert('无法打开系统打印窗口。请检查浏览器的弹窗和打印权限后重试。');
          resetPrintButton();
        }
      });
      reportWin.addEventListener('afterprint', resetPrintButton);
    }

    const htmlButton = reportWin.document.getElementById('btnExportHtml');
    if (htmlButton) {
      htmlButton.addEventListener('click', () => {
        // Standalone export intentionally omits live controls whose listeners
        // belong to the extension page, leaving a clean shareable report.
        const standaloneHtml = reportHtml
          .replace('  <button id="btnPrintPdf" class="btn-print" type="button">打印 / 导出为 PDF</button>', '')
          .replace('  <button id="btnExportHtml" class="btn-export-html" type="button">导出 HTML</button>', '');
        const blob = new Blob([standaloneHtml], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = reportWin.document.createElement('a');
        link.href = url;
        link.download = `polarization_analysis_report_${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.html`;
        reportWin.document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 0);
      });
    }
  }
}

if (typeof window !== 'undefined') {
  window.ReportEngine = ReportEngine;
  window.ReportGenerator = ReportEngine;
}
