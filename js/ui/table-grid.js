/**
 * table-grid.js (UI Table Component - Hardened)
 * 强化版交互式电子表格组件：输入数字清洗防退化、防抖刷新与优雅异常高亮
 */

class TableGrid {
  constructor(containerId, options = {}) {
    this.container = document.getElementById(containerId);
    this.options = {
      angleMultiplier: options.angleMultiplier || 10,
      onChange: options.onChange || (() => {})
    };

    this.points = [];
    this.baseline = [];
    this.subtracted = [];
    this.outlierIndices = new Set();
    this.debounceTimer = null;

    this.init();
  }

  init() {
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="grid-toolbar">
        <div style="display:flex;gap:0.4rem;align-items:center;">
          <span style="font-weight:700;font-size:0.74rem;">表格逐点编辑</span>
          <span id="gridRowCount" class="badge badge-success">0 行</span>
        </div>
        <div style="display:flex;gap:0.3rem;">
          <button id="btnGridAddRow" class="btn btn-secondary btn-sm" title="在末尾新增一行">+ 增行</button>
          <button id="btnGridNormalize" class="btn btn-secondary btn-sm" title="一键将光强归一化到 [0, 1]">⚡ 归一化</button>
          <button id="btnGridClear" class="btn btn-secondary btn-sm" title="清空全部数据">清空</button>
        </div>
      </div>
      <div class="grid-table-wrapper">
        <table class="grid-table">
          <thead>
            <tr>
              <th style="width: 32px;">#</th>
              <th style="width: 50px;">X</th>
              <th style="width: 60px;">角度(°)</th>
              <th>原始Y</th>
              <th>基线Y</th>
              <th>净光强Y</th>
              <th style="width: 36px;">操作</th>
            </tr>
          </thead>
          <tbody id="gridTableBody"></tbody>
        </table>
      </div>
    `;

    this.tbody = this.container.querySelector('#gridTableBody');
    this.rowCountEl = this.container.querySelector('#gridRowCount');

    this.container.querySelector('#btnGridAddRow').addEventListener('click', () => this.addRow());
    this.container.querySelector('#btnGridNormalize').addEventListener('click', () => this.normalizeY());
    this.container.querySelector('#btnGridClear').addEventListener('click', () => this.clearData());

    this.container.addEventListener('paste', (e) => this.handlePaste(e));
  }

  setAngleMultiplier(multiplier) {
    this.options.angleMultiplier = Number.isFinite(multiplier) ? multiplier : 10;
    this.renderRows();
  }

  setData(points, baseline = null, subtracted = null, outlierIndices = null) {
    this.points = Array.isArray(points) ? [...points] : [];
    this.baseline = Array.isArray(baseline) ? [...baseline] : [];
    this.subtracted = Array.isArray(subtracted) ? [...subtracted] : [];
    this.outlierIndices = outlierIndices ? new Set(outlierIndices) : new Set();
    this.renderRows();
  }

  renderRows() {
    if (!this.tbody) return;
    this.tbody.innerHTML = '';
    this.rowCountEl.textContent = `${this.points.length} 行`;

    const mult = Number.isFinite(this.options.angleMultiplier) ? this.options.angleMultiplier : 10;

    this.points.forEach((p, idx) => {
      const tr = document.createElement('tr');
      const isOutlier = this.outlierIndices.has(idx);
      if (isOutlier) tr.style.backgroundColor = 'rgba(239, 68, 68, 0.08)';

      const angleVal = (p.rawX * mult).toFixed(1);
      const baseVal = this.baseline[idx] !== undefined ? this.baseline[idx] : '-';
      const subVal = this.subtracted[idx] !== undefined ? this.subtracted[idx] : p.y;

      tr.innerHTML = `
        <td style="color:var(--text-light);">${idx + 1}</td>
        <td>
          <input type="number" class="grid-cell-input" data-field="rawX" data-idx="${idx}" value="${p.rawX}">
        </td>
        <td style="color:var(--text-muted);">${angleVal}°</td>
        <td>
          <input type="number" class="grid-cell-input" data-field="y" data-idx="${idx}" value="${p.y}">
          ${isOutlier ? '<span title="马吕斯拟合异常离群点 (>2.5σ)" style="color:#ef4444;font-size:0.65rem;cursor:help;">⚠️</span>' : ''}
        </td>
        <td style="color:var(--text-muted);">${baseVal}</td>
        <td style="color:#10b981;font-weight:600;">${subVal}</td>
        <td>
          <button class="btn btn-sm" data-action="del" data-idx="${idx}" style="padding:0 4px;color:#ef4444;background:none;border:none;cursor:pointer;">✕</button>
        </td>
      `;
      this.tbody.appendChild(tr);
    });

    this.bindRowInputs();
  }

  bindRowInputs() {
    this.tbody.querySelectorAll('.grid-cell-input').forEach(input => {
      input.addEventListener('change', (e) => {
        const idx = parseInt(e.target.dataset.idx, 10);
        const field = e.target.dataset.field;
        let val = parseFloat(e.target.value);

        if (isNaN(val) || !Number.isFinite(val)) {
          val = field === 'rawX' ? idx : 0;
          e.target.value = val;
        }

        this.points[idx][field] = val;
        if (field === 'rawX') {
          this.points[idx].angle = val * this.options.angleMultiplier;
        }

        clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => {
          this.options.onChange(this.points);
        }, 80);
      });
    });

    this.tbody.querySelectorAll('button[data-action="del"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.target.dataset.idx, 10);
        this.points.splice(idx, 1);
        this.renderRows();
        this.options.onChange(this.points);
      });
    });
  }

  addRow() {
    const lastX = this.points.length > 0 ? this.points[this.points.length - 1].rawX + 1 : 0;
    this.points.push({ rawX: lastX, y: 7000, angle: lastX * this.options.angleMultiplier });
    this.renderRows();
    this.options.onChange(this.points);
  }

  normalizeY() {
    if (this.points.length === 0) return;
    const yList = this.points.map(p => p.y);
    const minY = Math.min(...yList);
    const maxY = Math.max(...yList);
    const range = (maxY - minY) || 1;

    this.points.forEach(p => {
      p.y = Number(((p.y - minY) / range).toFixed(4));
    });
    this.renderRows();
    this.options.onChange(this.points);
  }

  clearData() {
    if (confirm('确定要清空表格全部数据吗？')) {
      this.points = [];
      this.renderRows();
      this.options.onChange(this.points);
    }
  }

  handlePaste(e) {
    const text = e.clipboardData ? e.clipboardData.getData('text') : '';
    if (!text || !text.includes('\n')) return;

    e.preventDefault();
    const newPoints = DataParser.parseRawData(text, this.options.angleMultiplier);
    if (newPoints.length > 0) {
      this.points = newPoints;
      this.renderRows();
      this.options.onChange(this.points);
    }
  }
}

if (typeof window !== 'undefined') {
  window.TableGrid = TableGrid;
}
