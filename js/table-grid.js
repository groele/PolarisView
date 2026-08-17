/**
 * table-grid.js
 * 交互式电子表格组件，支持单元格编辑、增删行、数据归一化缩放、剪贴板粘贴与异常点高亮
 */

class TableGrid {
  constructor(containerId, options = {}) {
    this.container = document.getElementById(containerId);
    this.data = []; // [{ x: number, y: number, rawX: number, angle: number }]
    this.originalDataBackup = [];
    this.angleMultiplier = options.angleMultiplier || 10;
    this.onChange = options.onChange || (() => {});
    this.baselineData = [];
    this.subtractedData = [];
    this.outlierIndices = new Set();
    this.init();
  }

  init() {
    if (!this.container) return;
    this.renderSkeleton();
    this.bindEvents();
  }

  renderSkeleton() {
    this.container.innerHTML = `
      <div class="table-grid-toolbar">
        <div class="btn-group">
          <button id="tblAddRowBtn" class="btn btn-secondary btn-sm" title="在底部添加一行">➕ 加行</button>
          <button id="tblNormalizeBtn" class="btn btn-secondary btn-sm" title="一键归一化到 [0, 1]">📐 归一化</button>
          <button id="tblClearBtn" class="btn btn-secondary btn-sm" title="清空全部表格数据"><svg class="table-action-icon"><use href="#i-clear"/></svg>清空</button>
        </div>
        <div style="font-size:0.75rem;color:var(--text-muted);">
          共 <b id="tblRowCount" style="color:var(--primary);font-family:var(--font-mono);">0</b> 行
        </div>
      </div>
      <div class="table-grid-scroll">
        <table class="table-grid">
          <thead>
            <tr>
              <th style="width: 38px;">#</th>
              <th style="width: 70px;">X</th>
              <th style="width: 75px;">角度</th>
              <th>Y (原始光强)</th>
              <th style="width: 75px;">基线</th>
              <th style="width: 80px;">净光强</th>
              <th style="width: 36px;">操作</th>
            </tr>
          </thead>
          <tbody id="tableGridBody">
          </tbody>
        </table>
      </div>
    `;
  }

  bindEvents() {
    const addRowBtn = document.getElementById('tblAddRowBtn');
    const normalizeBtn = document.getElementById('tblNormalizeBtn');
    const clearBtn = document.getElementById('tblClearBtn');

    if (addRowBtn) {
      addRowBtn.addEventListener('click', () => {
        const lastX = this.data.length > 0 ? this.data[this.data.length - 1].rawX + 1 : 0;
        const lastY = this.data.length > 0 ? this.data[this.data.length - 1].y : 7000;
        this.data.push({
          rawX: lastX,
          x: lastX,
          angle: lastX * this.angleMultiplier,
          y: lastY
        });
        this.renderRows();
        this.emitChange();
      });
    }

    if (normalizeBtn) {
      normalizeBtn.addEventListener('click', () => {
        if (this.data.length === 0) return;
        const yVals = this.data.map(d => d.y);
        const yMin = Math.min(...yVals);
        const yMax = Math.max(...yVals);
        const span = (yMax - yMin) || 1;

        this.data.forEach(d => {
          d.y = Number(((d.y - yMin) / span).toFixed(4));
        });
        this.renderRows();
        this.emitChange();
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        if (confirm('确定要清空表格中的所有数据吗？')) {
          this.setData([]);
          this.emitChange();
        }
      });
    }

    this.container.addEventListener('paste', (e) => {
      const text = e.clipboardData?.getData('text');
      if (text && (text.includes('\t') || text.includes('\n') || text.includes(','))) {
        e.preventDefault();
        const parsed = DataParser.parseRawData(text, this.angleMultiplier);
        if (parsed.length > 0) {
          this.setData(parsed);
          this.emitChange();
        }
      }
    });
  }

  setData(dataPoints, baselineData = null, subtractedData = null, outlierIndices = null) {
    this.data = [...dataPoints];
    this.baselineData = baselineData || [];
    this.subtractedData = subtractedData || [];
    if (outlierIndices) {
      this.outlierIndices = new Set(outlierIndices);
    }
    this.renderRows();
  }

  setOutliers(outliers) {
    this.outlierIndices = new Set(outliers.map(o => o.index));
    this.renderRows();
  }

  setAngleMultiplier(multiplier) {
    this.angleMultiplier = multiplier;
    this.data.forEach(d => {
      d.angle = d.rawX * multiplier;
    });
    this.renderRows();
  }

  renderRows() {
    const tbody = document.getElementById('tableGridBody');
    const rowCountEl = document.getElementById('tblRowCount');
    if (!tbody) return;

    if (rowCountEl) rowCountEl.textContent = this.data.length;

    if (this.data.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:2rem;">暂无数据，请点击「加行」或按 Ctrl+V 粘贴数据</td></tr>`;
      return;
    }

    let html = '';
    for (let i = 0; i < this.data.length; i++) {
      const pt = this.data[i];
      const bgVal = this.baselineData[i] !== undefined ? this.baselineData[i] : '-';
      const subVal = this.subtractedData[i] !== undefined ? this.subtractedData[i] : pt.y;
      const isOutlier = this.outlierIndices.has(i);

      html += `
        <tr data-index="${i}" style="${isOutlier ? 'background:rgba(239, 68, 68, 0.1);' : ''}">
          <td style="color:var(--text-muted);">
            ${isOutlier ? '<svg class="table-warning-icon"><use href="#i-warning"/></svg>' : ''}${i + 1}
          </td>
          <td>
            <input type="number" class="grid-cell-input input-x" data-index="${i}" value="${pt.rawX}">
          </td>
          <td style="font-family:var(--font-mono);font-size:0.75rem;color:var(--text-muted);">${pt.angle}°</td>
          <td>
            <input type="number" class="grid-cell-input input-y" data-index="${i}" value="${pt.y}">
          </td>
          <td style="font-family:var(--font-mono);font-size:0.75rem;color:var(--purple);">${bgVal}</td>
          <td style="font-family:var(--font-mono);font-size:0.75rem;color:var(--success);font-weight:600;">${subVal}</td>
          <td>
            <button class="grid-del-btn" data-index="${i}" title="删除该行">✕</button>
          </td>
        </tr>
      `;
    }
    tbody.innerHTML = html;

    tbody.querySelectorAll('.input-x').forEach(input => {
      input.addEventListener('change', (e) => {
        const idx = parseInt(e.target.dataset.index, 10);
        const val = parseFloat(e.target.value);
        if (!isNaN(val)) {
          this.data[idx].rawX = val;
          this.data[idx].x = val;
          this.data[idx].angle = val * this.angleMultiplier;
          this.emitChange();
        }
      });
    });

    tbody.querySelectorAll('.input-y').forEach(input => {
      input.addEventListener('change', (e) => {
        const idx = parseInt(e.target.dataset.index, 10);
        const val = parseFloat(e.target.value);
        if (!isNaN(val)) {
          this.data[idx].y = val;
          this.emitChange();
        }
      });
    });

    tbody.querySelectorAll('.grid-del-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.target.dataset.index, 10);
        this.data.splice(idx, 1);
        this.renderRows();
        this.emitChange();
      });
    });
  }

  getData() {
    return this.data;
  }

  emitChange() {
    this.onChange(this.data);
  }
}

// 导出
if (typeof window !== 'undefined') {
  window.TableGrid = TableGrid;
}
