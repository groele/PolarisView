/**
 * app.js - 核心应用协调器 (Application Orchestrator - Bulletproof & Robust)
 * 工业级鲁棒控制器：GBK/UTF-8 自适应、8大基线算法管道、DoLP 线偏振度、智能同相对齐、全生命周期 DOM 尺寸校准
 */

class PolarizationApp {
  constructor() {
    this.store = new StateStore();
    this.chartManager = null;
    this.tableGrid = null;
    this.parsedState = null;
    this.currentRawPoints = [];
    this.isSyncing = false;
    this.activeView = 'polar';

    this.init();
  }

  init() {
    try {
      // 1. 初始化多维图表渲染引擎
      this.chartManager = new PolarChartManager(
        'polarChart',
        'cartesianChart',
        'baselinePreviewChart',
        'residualChart',
        'unifiedComboChart'
      );

      // 2. 初始化表格式交互编辑组件
      this.tableGrid = new TableGrid('tableInputContainer', {
        angleMultiplier: 10,
        onChange: (updatedPoints) => {
          if (!this.isSyncing) {
            this.currentRawPoints = Array.isArray(updatedPoints) ? [...updatedPoints] : [];
            const rawDataInput = document.getElementById('rawDataInput');
            if (rawDataInput) {
              this.isSyncing = true;
              rawDataInput.value = DataParser.stringifyData(this.currentRawPoints);
              this.isSyncing = false;
            }
            this.processAndRender();
          }
        }
      });

      // 3. 绑定界面交互与算法参数事件
      this.bindEvents();

      // 4. 检查是否有从浏览器插件 Popup 传递过来的剪贴板数据
      ExtensionBridge.checkPendingClipboard((clipboardText) => {
        if (clipboardText && clipboardText.trim().length > 0) {
          const rawDataInput = document.getElementById('rawDataInput');
          if (rawDataInput) rawDataInput.value = clipboardText;
          const mult = parseFloat(document.getElementById('angleMultiplier').value) || 10;
          this.currentRawPoints = DataParser.parseRawData(clipboardText, mult);
          this.tableGrid.setData(this.currentRawPoints);
          this.processAndRender();
          return;
        }
      });

      // 5. 首次打开保持空白，不以示例数据替代用户自己的实验数据。
      //    示例仍可从下拉框或“载入示例”按钮按需加载。
      this.initializeEmptyDataset();

      // 6. 延迟触发尺寸校准，避免首屏 DOM 加载瞬态尺寸为 0
      setTimeout(() => {
        if (this.chartManager) this.chartManager.resize();
      }, 100);
    } catch (e) {
      console.error('应用初始化异常:', e);
    }
  }

  bindEvents() {
    // 预设选择器
    const presetSelector = document.getElementById('presetSelector');
    if (presetSelector) {
      presetSelector.addEventListener('change', (e) => {
        if (e.target.value) this.loadPreset(e.target.value);
      });
    }

    // 输入模式切换 (表格 vs 纯文本)
    const btnModeTable = document.getElementById('btnModeTable');
    const btnModeText = document.getElementById('btnModeText');
    const tableContainer = document.getElementById('tableInputContainer');
    const textContainer = document.getElementById('textInputContainer');

    if (btnModeTable && btnModeText) {
      btnModeTable.addEventListener('click', () => {
        btnModeTable.classList.add('active');
        btnModeText.classList.remove('active');
        tableContainer.style.display = 'flex';
        textContainer.style.display = 'none';
      });

      btnModeText.addEventListener('click', () => {
        btnModeText.classList.add('active');
        btnModeTable.classList.remove('active');
        tableContainer.style.display = 'none';
        textContainer.style.display = 'block';
      });
    }

    // 纯文本输入双向同步
    const rawDataInput = document.getElementById('rawDataInput');
    if (rawDataInput) {
      rawDataInput.addEventListener('input', () => {
        if (!this.isSyncing) {
          const mult = parseFloat(document.getElementById('angleMultiplier').value) || 10;
          this.currentRawPoints = DataParser.parseRawData(rawDataInput.value, mult);
          this.isSyncing = true;
          this.tableGrid.setData(this.currentRawPoints);
          this.isSyncing = false;
          this.processAndRender();
        }
      });
    }

    // 角度系数调整
    const angleMultiplier = document.getElementById('angleMultiplier');
    if (angleMultiplier) {
      angleMultiplier.addEventListener('input', (e) => {
        const mult = parseFloat(e.target.value) || 10;
        this.tableGrid.setAngleMultiplier(mult);
        this.currentRawPoints.forEach(p => p.angle = p.rawX * mult);
        this.processAndRender();
      });
    }

    // 智能相位锁定对齐开关
    const autoPhaseLock = document.getElementById('autoPhaseLock');
    if (autoPhaseLock) {
      autoPhaseLock.addEventListener('change', () => this.processAndRender());
    }

    // 拖拽与文件上传 (支持 GBK / UTF-8 自适应探测)
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    if (dropZone && fileInput) {
      dropZone.addEventListener('click', () => fileInput.click());
      dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
      });
      dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
      dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) this.readFile(e.dataTransfer.files[0]);
      });
      fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) this.readFile(e.target.files[0]);
      });
    }

    // 分组区间配置变化
    ['g1Start', 'g1End', 'g2Start', 'g2End', 'g3Start', 'g3End'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('change', () => this.processAndRender());
    });

    // 8大背景扣除算法与参数
    const baselineAlgo = document.getElementById('baselineAlgo');
    if (baselineAlgo) {
      baselineAlgo.addEventListener('change', (e) => {
        this.updateBaselineControls(e.target.value);
        this.processAndRender();
      });
    }

    const constMode = document.getElementById('constMode');
    if (constMode) {
      constMode.addEventListener('change', (e) => {
        document.getElementById('customConstGroup').style.display = e.target.value === 'custom' ? 'block' : 'none';
        this.processAndRender();
      });
    }

    [
      'customConstVal', 'aslsLambda', 'aslsP', 'airplsLambda', 'snipWindow',
      'rubberbandSeg', 'polyDegree', 'movingMinWindow', 'clampZero'
    ].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('input', (e) => {
          if (id === 'aslsLambda') document.getElementById('aslsLambdaVal').textContent = `${e.target.value} (1e${e.target.value})`;
          if (id === 'aslsP') document.getElementById('aslsPVal').textContent = e.target.value;
          if (id === 'airplsLambda') document.getElementById('airplsLambdaVal').textContent = `${e.target.value} (1e${e.target.value})`;
          if (id === 'snipWindow') document.getElementById('snipWindowVal').textContent = e.target.value;
          if (id === 'rubberbandSeg') document.getElementById('rubberbandSegVal').textContent = e.target.value;
          if (id === 'polyDegree') document.getElementById('polyDegreeVal').textContent = e.target.value;
          if (id === 'movingMinWindow') document.getElementById('movingMinWindowVal').textContent = e.target.value;
          this.processAndRender();
        });
      }
    });

    // 理论拟合开关
    const showTheoreticalFit = document.getElementById('showTheoreticalFit');
    if (showTheoreticalFit) {
      showTheoreticalFit.addEventListener('change', (e) => {
        this.chartManager.setShowTheoreticalFit(e.target.checked);
      });
    }

    // 学术期刊配色与极轴网格
    const journalTheme = document.getElementById('journalTheme');
    if (journalTheme) {
      journalTheme.addEventListener('change', (e) => {
        this.chartManager.setJournalTheme(e.target.value);
      });
    }

    const polarStartAngle = document.getElementById('polarStartAngle');
    if (polarStartAngle) {
      polarStartAngle.addEventListener('change', (e) => {
        this.chartManager.setPolarAxisConfig({ startAngle: parseFloat(e.target.value) });
      });
    }

    const polarGridInterval = document.getElementById('polarGridInterval');
    if (polarGridInterval) {
      polarGridInterval.addEventListener('change', (e) => {
        this.chartManager.setPolarAxisConfig({ interval: parseFloat(e.target.value) });
      });
    }

    // 平滑滤波
    const filterType = document.getElementById('filterType');
    const smoothSlider = document.getElementById('smoothSlider');
    const smoothSliderVal = document.getElementById('smoothSliderVal');
    const enableSpline = document.getElementById('enableSpline');

    if (filterType) {
      filterType.addEventListener('change', (e) => {
        this.updateFilterControls(e.target.value);
        this.applyFilterConfig();
      });
    }
    if (smoothSlider) {
      smoothSlider.addEventListener('input', (e) => {
        if (smoothSliderVal) smoothSliderVal.textContent = e.target.value;
        this.applyFilterConfig();
      });
    }
    if (enableSpline) {
      enableSpline.addEventListener('change', () => this.applyFilterConfig());
    }

    // 误差与组别
    const errorType = document.getElementById('errorType');
    if (errorType) errorType.addEventListener('change', (e) => this.chartManager.setErrorType(e.target.value));

    const radiusZeroBased = document.getElementById('radiusZeroBased');
    if (radiusZeroBased) radiusZeroBased.addEventListener('change', (e) => this.chartManager.setRadiusZeroBased(e.target.checked));

    const groupFilter = document.getElementById('groupFilter');
    if (groupFilter) groupFilter.addEventListener('change', (e) => this.chartManager.setDisplayMode(e.target.value));

    // 现代分段胶囊视图切换器
    const viewButtons = document.querySelectorAll('.segmented-btn[data-view]');
    const chartViewport = document.getElementById('chartViewport');
    const polarContainer = document.getElementById('polarChartCard');
    const cartesianContainer = document.getElementById('cartesianChartCard');
    const baselineContainer = document.getElementById('baselineChartCard');
    const residualContainer = document.getElementById('residualChartCard');
    const unifiedContainer = document.getElementById('unifiedChartCard');

    viewButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        viewButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const view = btn.dataset.view;
        this.activeView = view;

        chartViewport.classList.remove('dual-view');
        polarContainer.style.display = 'none';
        cartesianContainer.style.display = 'none';
        baselineContainer.style.display = 'none';
        residualContainer.style.display = 'none';
        if (unifiedContainer) unifiedContainer.style.display = 'none';

        if (view === 'polar') {
          polarContainer.style.display = 'flex';
        } else if (view === 'cartesian') {
          cartesianContainer.style.display = 'flex';
        } else if (view === 'baseline') {
          baselineContainer.style.display = 'flex';
        } else if (view === 'unified') {
          if (unifiedContainer) unifiedContainer.style.display = 'flex';
        } else if (view === 'residual') {
          residualContainer.style.display = 'flex';
        } else if (view === 'dual') {
          chartViewport.classList.add('dual-view');
          polarContainer.style.display = 'flex';
          baselineContainer.style.display = 'flex';
        }

        this.chartManager.render();
        setTimeout(() => this.chartManager.resize(), 50);
      });
    });

    // 主题切换
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
      themeToggle.addEventListener('click', () => {
        const isDark = document.body.getAttribute('data-theme') === 'dark';
        const newTheme = isDark ? 'light' : 'dark';
        document.body.setAttribute('data-theme', newTheme);
        themeToggle.innerHTML = newTheme === 'dark' ? '☀️ 亮色模式' : '🌙 暗色模式';
        this.chartManager.setJournalTheme(newTheme === 'dark' ? 'dark_lab' : 'nature');
      });
    }

    // 侧边栏 3 步 Tab 切换
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-pane');
    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        tabBtns.forEach(b => b.classList.remove('active'));
        tabContents.forEach(c => c.style.display = 'none');
        btn.classList.add('active');
        const target = document.getElementById(btn.dataset.tab);
        if (target) target.style.display = 'block';
      });
    });

    // 报告生成
    const btnGenerateReport = document.getElementById('btnGenerateReport');
    if (btnGenerateReport) {
      btnGenerateReport.addEventListener('click', () => {
        const appState = {
          ...this.parsedState,
          config: {
            bgAlgo: document.getElementById('baselineAlgo').value,
            filterType: document.getElementById('filterType').value
          }
        };
        ReportEngine.generateAndOpenReport(appState);
      });
    }

    // 导出操作
    const btnExportPng = document.getElementById('btnExportPng');
    const btnExportSvg = document.getElementById('btnExportSvg');
    const btnExportCsv = document.getElementById('btnExportCsv');
    const btnExportXlsx = document.getElementById('btnExportXlsx');

    if (btnExportPng) {
      btnExportPng.addEventListener('click', () => {
        this.chartManager.exportImage(this.activeView, 'png', 3);
      });
    }

    if (btnExportSvg) {
      btnExportSvg.addEventListener('click', () => {
        this.chartManager.exportImage(this.activeView, 'svg');
      });
    }

    if (btnExportCsv) btnExportCsv.addEventListener('click', () => this.exportCsv());
    if (btnExportXlsx) btnExportXlsx.addEventListener('click', () => this.exportXlsx());

    // 重置数据
    const btnResetData = document.getElementById('btnResetData');
    if (btnResetData) {
      btnResetData.addEventListener('click', () => this.loadPreset('real_pol'));
    }
  }

  loadPreset(presetKey) {
    const preset = PolarizationPresets[presetKey] || PolarizationPresets['real_pol'];
    const rawDataInput = document.getElementById('rawDataInput');
    const angleMultiplier = document.getElementById('angleMultiplier');

    if (angleMultiplier) angleMultiplier.value = preset.multiplier;
    if (rawDataInput) rawDataInput.value = preset.data;

    this.store.setState({ currentDatasetName: preset.name });
    this.currentRawPoints = DataParser.parseRawData(preset.data, preset.multiplier);
    this.tableGrid.setAngleMultiplier(preset.multiplier);
    this.tableGrid.setData(this.currentRawPoints);
    this.processAndRender();
  }

  initializeEmptyDataset() {
    const rawDataInput = document.getElementById('rawDataInput');
    const presetSelector = document.getElementById('presetSelector');

    if (rawDataInput) rawDataInput.value = '';
    if (presetSelector) presetSelector.value = '';

    this.currentRawPoints = [];
    this.parsedState = null;
    this.tableGrid.setData([]);
    this.store.setState({ currentDatasetName: '未导入数据' });
  }

  readFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const buffer = e.target.result;
      let content = '';
      try {
        const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
        content = utf8Decoder.decode(buffer);
      } catch (err) {
        try {
          const gbkDecoder = new TextDecoder('gbk');
          content = gbkDecoder.decode(buffer);
        } catch (err2) {
          content = new TextDecoder().decode(buffer);
        }
      }

      const rawDataInput = document.getElementById('rawDataInput');
      if (rawDataInput) rawDataInput.value = content;
      const mult = parseFloat(document.getElementById('angleMultiplier').value) || 10;
      this.store.setState({ currentDatasetName: file.name || '本地文件' });
      this.currentRawPoints = DataParser.parseRawData(content, mult);
      this.tableGrid.setData(this.currentRawPoints);
      this.processAndRender();
    };
    reader.readAsArrayBuffer(file);
  }

  updateBaselineControls(algo) {
    const badge = document.getElementById('bgStatusBadge');
    if (badge) {
      badge.textContent = algo === 'none' ? '未启用' : '已启用';
      badge.style.background = algo === 'none' ? 'rgba(148,163,184,0.2)' : 'rgba(16,185,129,0.15)';
      badge.style.color = algo === 'none' ? 'var(--text-muted)' : 'var(--success)';
    }

    document.getElementById('cfgConstant').style.display = algo === 'constant' ? 'block' : 'none';
    document.getElementById('cfgAirpls').style.display = algo === 'airpls' ? 'block' : 'none';
    document.getElementById('cfgAsls').style.display = algo === 'asls' ? 'block' : 'none';
    document.getElementById('cfgSnip').style.display = algo === 'snip' ? 'block' : 'none';
    document.getElementById('cfgRubberband').style.display = algo === 'rubberband' ? 'block' : 'none';
    document.getElementById('cfgPoly').style.display = algo === 'polynomial' ? 'block' : 'none';
    document.getElementById('cfgMovingMin').style.display = algo === 'moving_min' ? 'block' : 'none';
  }

  updateFilterControls(type) {
    const sliderLabel = document.getElementById('smoothParamLabel');
    const slider = document.getElementById('smoothSlider');
    const sliderVal = document.getElementById('smoothSliderVal');

    if (type === 'gaussian') {
      sliderLabel.textContent = '高斯 Sigma:';
      slider.min = '0.3'; slider.max = '3.0'; slider.step = '0.1'; slider.value = '1.2';
      sliderVal.textContent = '1.2';
      slider.parentElement.style.display = 'flex';
    } else if (type === 'moving_avg') {
      sliderLabel.textContent = '窗口宽度:';
      slider.min = '3'; slider.max = '9'; slider.step = '2'; slider.value = '3';
      sliderVal.textContent = '3';
      slider.parentElement.style.display = 'flex';
    } else if (type === 'sg') {
      sliderLabel.textContent = 'S-G 窗口:';
      slider.min = '5'; slider.max = '11'; slider.step = '2'; slider.value = '5';
      sliderVal.textContent = '5';
      slider.parentElement.style.display = 'flex';
    } else if (type === 'fourier') {
      sliderLabel.textContent = '保留谐波阶数:';
      slider.min = '2'; slider.max = '8'; slider.step = '1'; slider.value = '4';
      sliderVal.textContent = '4';
      slider.parentElement.style.display = 'flex';
    } else {
      slider.parentElement.style.display = 'none';
    }
  }

  applyFilterConfig() {
    const filterType = document.getElementById('filterType').value;
    const smoothVal = parseFloat(document.getElementById('smoothSlider').value);
    const enableSpline = document.getElementById('enableSpline').checked;

    const config = {
      type: filterType,
      enableInterpolation: enableSpline,
      sigma: smoothVal,
      windowSize: smoothVal,
      harmonics: smoothVal
    };

    this.chartManager.setFilterConfig(config);
  }

  processAndRender() {
    if (!Array.isArray(this.currentRawPoints) || this.currentRawPoints.length === 0) return;

    try {
      const multiplier = parseFloat(document.getElementById('angleMultiplier').value) || 10;
      const yRaw = this.currentRawPoints.map(p => p.y);
      const xRaw = this.currentRawPoints.map(p => p.rawX);

      // 1. 8大背景基线扣除算法调度
      const bgAlgo = document.getElementById('baselineAlgo').value;
      const clampZero = document.getElementById('clampZero').checked;
      const bgOptions = {};

      if (bgAlgo === 'constant') {
        bgOptions.mode = document.getElementById('constMode').value;
        bgOptions.value = parseFloat(document.getElementById('customConstVal').value) || 0;
      } else if (bgAlgo === 'airpls') {
        const lambdaExp = parseFloat(document.getElementById('airplsLambda').value);
        bgOptions.lambda = Math.pow(10, lambdaExp);
      } else if (bgAlgo === 'asls') {
        const lambdaExp = parseFloat(document.getElementById('aslsLambda').value);
        bgOptions.lambda = Math.pow(10, lambdaExp);
        bgOptions.p = parseFloat(document.getElementById('aslsP').value);
      } else if (bgAlgo === 'snip') {
        bgOptions.clippingWindow = parseInt(document.getElementById('snipWindow').value, 10);
      } else if (bgAlgo === 'rubberband') {
        bgOptions.segments = parseInt(document.getElementById('rubberbandSeg').value, 10);
      } else if (bgAlgo === 'polynomial') {
        bgOptions.degree = parseInt(document.getElementById('polyDegree').value, 10);
      } else if (bgAlgo === 'moving_min') {
        bgOptions.windowSize = parseInt(document.getElementById('movingMinWindow').value, 10);
      }

      const baselineResult = BaselineEngine.computeBaselineAndSubtract(yRaw, xRaw, bgAlgo, bgOptions, clampZero);

      // 更新透明预处理数学卡片与实时遥测
      this.updateTransparentMathCard(bgAlgo, baselineResult);

      // 净光强数据
      const processedPoints = this.currentRawPoints.map((pt, i) => ({
        ...pt,
        effectiveY: baselineResult.hasSubtracted ? baselineResult.subtracted[i] : pt.y
      }));

      // 2. 马吕斯定律理论拟合与物理反演
      const pointsForFit = processedPoints.map(p => ({
        angle: p.angle,
        rawX: p.rawX,
        y: p.effectiveY
      }));
      const fitResult = MalusFitter.fitMalusLaw(pointsForFit);

      // 3. 更新表格与异常点标记
      this.tableGrid.setData(
        this.currentRawPoints,
        baselineResult.baseline,
        baselineResult.subtracted,
        fitResult ? fitResult.outliers.map(o => o.index) : null
      );

      // 4. 三组切片与统计计算 (含智能相位锁定)
      const g1Start = parseFloat(document.getElementById('g1Start').value) || 0;
      const g1End = parseFloat(document.getElementById('g1End').value) || 36;
      const g2Start = parseFloat(document.getElementById('g2Start').value) || 18;
      const g2End = parseFloat(document.getElementById('g2End').value) || 54;
      const g3Start = parseFloat(document.getElementById('g3Start').value) || 36;
      const g3End = parseFloat(document.getElementById('g3End').value) || 72;
      const autoPhaseLock = document.getElementById('autoPhaseLock') ? document.getElementById('autoPhaseLock').checked : false;

      const groupConfigs = [
        { id: 'group1', name: `Group 1 (x: ${g1Start}~${g1End})`, start: g1Start, end: g1End, color: '#3b82f6' },
        { id: 'group2', name: `Group 2 (x: ${g2Start}~${g2End})`, start: g2Start, end: g2End, color: '#10b981' },
        { id: 'group3', name: `Group 3 (x: ${g3Start}~${g3End})`, start: g3Start, end: g3End, color: '#f59e0b' }
      ];

      const groups = DataParser.extractGroups(processedPoints, groupConfigs, multiplier, autoPhaseLock);
      const stats = DataParser.computeStatistics(groups);
      const inputAudit = DataQuality.auditInput(this.currentRawPoints, multiplier);
      const qualityAudit = DataQuality.auditProcessing(inputAudit, baselineResult, groups, fitResult, {
        autoPhaseLock, bgAlgo, clampZero
      });
      this.updateQualityAudit(qualityAudit);

      this.parsedState = {
        allPoints: processedPoints,
        groups,
        stats,
        fitResult,
        qualityAudit,
        provenance: {
          processedAt: new Date().toISOString(),
          angleMultiplier: multiplier,
          baseline: { algorithm: bgAlgo, options: bgOptions, clampZero },
          phaseAlignment: autoPhaseLock ? 'automatic peak alignment (visualization only)' : 'off',
          fitModel: 'least-squares Fourier harmonic model: A0 + A4cos(4theta) + B4sin(4theta) + A2cos(2theta) + B2sin(2theta)'
        },
        rawBaselineResult: {
          rawPoints: this.currentRawPoints,
          baseline: baselineResult.baseline,
          unboundedSubtracted: baselineResult.unboundedSubtracted || baselineResult.subtracted,
          subtracted: baselineResult.subtracted,
          hasSubtracted: baselineResult.hasSubtracted
        }
      };

      // 5. 保存遥测指标至插件 Storage
      if (stats && stats.summary) {
        this.store.saveLatestMetrics(stats.summary, fitResult);
        ExtensionBridge.notifyStateUpdate(stats.summary, fitResult);
        this.updateStatsCards(stats.summary, fitResult, baselineResult);
        this.updateDataTable(stats.stepStats);
      }

      // 6. 渲染图表
      this.applyFilterConfig();
      this.chartManager.updateData(this.parsedState);
    } catch (err) {
      console.error('数据处理管道异常:', err);
    }
  }

  updateTransparentMathCard(algo, baselineResult) {
    const eqDisplay = document.getElementById('mathEquationDisplay');
    const descEl = document.getElementById('mathDesc');
    const telMean = document.getElementById('telemetryBgMean');
    const telSubMax = document.getElementById('telemetrySubMax');
    const telRatio = document.getElementById('telemetryBgRatio');

    if (!eqDisplay || !descEl) return;

    const details = baselineResult.details || {};
    const tel = baselineResult.telemetry || {};

    if (algo === 'constant') {
      eqDisplay.textContent = details.dynamicEquation || 'y_sub(x) = y(x) - 7033.0';
      descEl.innerHTML = `<b>恒定偏置模型</b>：以 <i>I</i><sub>bg</sub> = ${details.bgVal || 7033} 整体平移。若该值来自 min(y)，它是数据驱动的显示基准而非独立暗场测量。`;
    } else if (algo === 'airpls') {
      eqDisplay.textContent = details.dynamicEquation || 'w_i = exp(t(y_i - z_i)/|d_|)';
      descEl.innerHTML = `<b>airPLS 自适应迭代重加权惩罚最小二乘</b>：用波谷残差的指数重加权估计平滑下包络。该算法并非对所有偏振扫描均自动适用；请比较未扣除、暗场扣除与参数扰动后的结论。`;
    } else if (algo === 'asls') {
      eqDisplay.textContent = details.dynamicEquation || 'min_z [ Σ w_i(y_i - z_i)² + λ Σ (Δ² z_i)² ]';
      descEl.innerHTML = `<b>AsLS非对称重加权最小二乘</b>（Eilers-Boelens光谱经典）：采用二阶差分平滑约束 (λ=10<sup>${details.lambdaLog10 || 4}</sup>)，波谷赋权 ${(1 - (details.p || 0.01)).toFixed(2)}，波峰赋权 ${details.p || 0.01}，自适应贴合基底。`;
    } else if (algo === 'snip') {
      eqDisplay.textContent = details.dynamicEquation || 'z_i = min(z_i, (z_{i-p} + z_{i+p})/2)';
      descEl.innerHTML = `<b>SNIP 敏感非线性迭代峰值剪切法</b>（Ryan 1988 核物理与高分辨光谱经典）：利用连续递增可变宽度三角几何核递归剥离偏振四瓣峰，保留宽泛本底漫反射。`;
    } else if (algo === 'rubberband') {
      eqDisplay.textContent = details.dynamicEquation || 'z(x) = ElasticConvexHull(y(x))';
      descEl.innerHTML = `<b>Rubberband 橡皮筋下包络凸包法</b>：沿测量信号下边界拉伸弹性多边形凸包，连接局部极小值节点构建下包络基线。`;
    } else if (algo === 'polynomial') {
      eqDisplay.textContent = details.dynamicEquation || 'z(x) = c₂x² + c₁x + c₀';
      descEl.innerHTML = `<b>多项式拟合基线模型</b>：采用 ${details.degree || 2} 阶多项式正规方程最小二乘求解，拟合低频宏观背景弯曲与弧形漂移。`;
    } else if (algo === 'linear') {
      eqDisplay.textContent = details.dynamicEquation || 'z(x) = k·x + b';
      descEl.innerHTML = `<b>线性漂移基线模型</b>：斜率 k = ${details.slope || 0} Counts/步，总漂移量 Δz = ${details.totalDrift || 0} Counts。消除光源功率单调衰减或探测器升温效应。`;
    } else if (algo === 'moving_min') {
      eqDisplay.textContent = details.dynamicEquation || 'z(x) = MovingMin(y(x))';
      descEl.innerHTML = `<b>滑动极小值形态学滤波</b>：在局部宽度 W = ${details.windowSize || 9} 的滑动窗口内追踪极小值下包络并平滑。`;
    } else {
      eqDisplay.textContent = 'y_sub(x) = y(x)  [保留原始测量数据]';
      descEl.innerHTML = `<b>原始直通模式</b>：不执行背景基线扣除，直接进行分组与拟合。`;
    }

    if (telMean) telMean.textContent = tel.bgMean !== undefined ? tel.bgMean : '-';
    if (telSubMax) telSubMax.textContent = tel.subMax !== undefined ? tel.subMax : '-';
    if (telRatio) telRatio.textContent = tel.bgRatioPercent !== undefined ? `${tel.bgRatioPercent}%` : '-';
  }

  updateQualityAudit(audit) {
    const output = document.getElementById('qualityAudit');
    const badge = document.getElementById('qualityBadge');
    if (output) output.textContent = DataQuality.format(audit);
    if (!badge) return;
    const map = {
      supported: ['可用于描述', 'rgba(16,185,129,.15)', 'var(--success)'],
      qualified: ['限条件解释', 'rgba(245,158,11,.15)', '#b45309'],
      blocked: ['阻止结论', 'rgba(239,68,68,.15)', '#b91c1c']
    };
    const style = map[audit.claimLevel] || map.qualified;
    badge.textContent = style[0]; badge.style.background = style[1]; badge.style.color = style[2];
  }

  updateStatsCards(summary, fitResult, baselineResult = null) {
    if (!summary) return;

    // 1. 更新顶部实时 KPI 横幅 (含 DoLP)
    const ribbonDolp = document.getElementById('ribbonDolp');
    const ribbonER = document.getElementById('ribbonER');
    const ribbonMod = document.getElementById('ribbonModulation');
    const ribbonTheta = document.getElementById('ribbonTheta');
    const ribbonR2 = document.getElementById('ribbonR2');
    const ribbonBg = document.getElementById('ribbonBg');
    const ribbonRmse = document.getElementById('ribbonRmse');

    if (ribbonDolp) {
      ribbonDolp.textContent = fitResult ? `${fitResult.params.dolpPercent}%` : `${summary.dolpEmpiricalPercent}%`;
    }
    if (ribbonER) ribbonER.textContent = summary.extinctionRatio;
    if (ribbonMod) ribbonMod.textContent = `${summary.modulationPercent}%`;

    if (fitResult) {
      const p = fitResult.params;
      if (ribbonTheta) ribbonTheta.textContent = `${p.theta0}°`;
      if (ribbonR2) ribbonR2.textContent = `${p.rSquaredPercent}%`;
      if (ribbonRmse) ribbonRmse.textContent = p.rmse;
    }

    if (baselineResult && baselineResult.telemetry && ribbonBg) {
      ribbonBg.textContent = `${baselineResult.telemetry.bgMean} (${baselineResult.telemetry.bgRatioPercent}%)`;
    }

    // 2. 更新面板内详细参数卡片 (含 DoLP)
    const elDolp = document.getElementById('statDolp');
    const elER = document.getElementById('statExtinctionRatio');
    const elDB = document.getElementById('statExtinctionDB');
    const elMod = document.getElementById('statModulation');

    if (elDolp) elDolp.textContent = fitResult ? `${fitResult.params.dolpPercent}%` : `${summary.dolpEmpiricalPercent}%`;
    if (elER) elER.textContent = summary.extinctionRatio;
    if (elDB) elDB.textContent = `${summary.extinctionRatioDB} dB`;
    if (elMod) elMod.textContent = `${summary.modulationPercent}%`;

    if (fitResult) {
      const p = fitResult.params;
      const elTheta = document.getElementById('fitTheta0');
      const elR2 = document.getElementById('fitRSquared');
      const elDelta = document.getElementById('fitRetardance');
      const elRmse = document.getElementById('fitRmse');

      if (elTheta) elTheta.textContent = `${p.theta0}°`;
      if (elR2) elR2.textContent = `${p.rSquaredPercent}%`;
      if (elDelta) elDelta.textContent = `${p.retardanceError}°`;
      if (elRmse) elRmse.textContent = p.rmse;
    }
  }

  updateDataTable(stepStats) {
    const tbody = document.getElementById('dataTableBody');
    if (!tbody || !Array.isArray(stepStats)) return;

    tbody.innerHTML = '';
    stepStats.forEach(st => {
      const tr = document.createElement('tr');
      const gVals = st.values || [];
      tr.innerHTML = `
        <td>${st.relAngle}°</td>
        <td>${gVals[0] !== undefined ? gVals[0] : '-'}</td>
        <td>${gVals[1] !== undefined ? gVals[1] : '-'}</td>
        <td>${gVals[2] !== undefined ? gVals[2] : '-'}</td>
        <td style="color:#ef4444;font-weight:600;">${st.mean}</td>
        <td>±${st.sd}</td>
        <td>±${st.se}</td>
        <td>${st.rsd}%</td>
      `;
      tbody.appendChild(tr);
    });
  }

  exportCsv() {
    if (!this.parsedState || !this.parsedState.stats) return;
    const { stepStats, summary } = this.parsedState.stats;
    const { rawPoints, baseline, subtracted } = this.parsedState.rawBaselineResult;
    const p = this.parsedState.fitResult ? this.parsedState.fitResult.params : {};

    const provenance = this.parsedState.provenance || {};
    const audit = this.parsedState.qualityAudit || {};
    let csv = '# 1/2波片偏振测量综合分析导出数据\n';
    csv += `# 处理时间(UTC): ${provenance.processedAt || '-'}\n`;
    csv += `# 原始数据点: ${audit.pointCount || 0}; 角度覆盖: ${audit.angleSpan || 0} deg; 重复x: ${audit.duplicateX || 0}\n`;
    csv += `# 基线: ${provenance.baseline?.algorithm || '-'}; 参数: ${JSON.stringify(provenance.baseline?.options || {})}; 负值截断: ${provenance.baseline?.clampZero ? 'on' : 'off'}\n`;
    csv += `# 相位处理: ${provenance.phaseAlignment || 'off'}\n`;
    csv += `# 结论状态: ${audit.claimLevel || 'unknown'}; 警示: ${(audit.issues || []).map(x => x.text).join(' | ') || 'none'}\n`;
    csv += `# 线偏振度 DoLP: ${p.dolpPercent || summary.dolpEmpiricalPercent}%\n`;
    csv += `# 消光比 ER: ${summary.extinctionRatio} (${summary.extinctionRatioDB} dB)\n`;
    csv += `# 快轴偏角 θ0: ${p.theta0 || '-'} deg, 拟合优度 R2: ${p.rSquaredPercent || '-'}%\n\n`;

    csv += '# 全局原始与扣除背景数据\n';
    csv += 'Index_X,Angle(deg),Raw_Y,Baseline_Y,Unclamped_Subtracted_Y,Displayed_Subtracted_Y\n';
    rawPoints.forEach((pt, i) => {
      const unbounded = this.parsedState.rawBaselineResult.unboundedSubtracted || subtracted;
      csv += `${pt.rawX},${pt.angle},${pt.y},${baseline[i] ?? 0},${unbounded[i] ?? pt.y},${subtracted[i] ?? pt.y}\n`;
    });

    csv += '\n# 三组对齐统计明细\n';
    csv += '相对角度(deg),Group1,Group2,Group3,均值(Mean),标准差(SD),标准误(SE),相对标准差(RSD%)\n';
    stepStats.forEach(s => {
      const v = s.values;
      csv += `${s.relAngle},${v[0] || ''},${v[1] || ''},${v[2] || ''},${s.mean},${s.sd},${s.se},${s.rsd}\n`;
    });

    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'polarization_comprehensive_analysis.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  exportXlsx() {
    if (!this.parsedState || !XlsxExporter.exportPolarization(this.parsedState)) {
      alert('暂无有效数据可导出为 Excel。');
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.app = new PolarizationApp();
});
