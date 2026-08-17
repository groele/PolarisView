/** Lightweight, dependency-free XLSX writer for local/offline Chrome extensions. */
class XlsxExporter {
  static exportPolarization(state) {
    if (!state?.stats || !state?.rawBaselineResult) return false;
    const { rawPoints, baseline, subtracted, unboundedSubtracted } = state.rawBaselineResult;
    const stats = state.stats.stepStats || [];
    const rawRows = [['Index', 'X', 'Angle_deg', 'Raw_Intensity', 'Baseline', 'Net_Unclamped', 'Net_Displayed']];
    rawPoints.forEach((p, i) => rawRows.push([i + 1, p.rawX, p.angle, p.y, baseline[i], (unboundedSubtracted || subtracted)[i], subtracted[i]]));

    const originRows = [['Angle_deg', 'Group1', 'Group2', 'Group3', 'Mean', 'SD', 'SE', 'RSD_percent', 'N']];
    stats.forEach(s => originRows.push([s.relAngle, s.values[0] ?? '', s.values[1] ?? '', s.values[2] ?? '', s.mean, s.sd, s.se, s.rsd, s.n]));

    const p = state.fitResult?.params || {};
    const a = state.qualityAudit || {};
    const cfg = state.provenance || {};
    const notes = [
      ['Field', 'Value'],
      ['Exported_UTC', cfg.processedAt || new Date().toISOString()],
      ['Baseline_algorithm', cfg.baseline?.algorithm || 'none'],
      ['Baseline_parameters', JSON.stringify(cfg.baseline?.options || {})],
      ['Negative_value_clamp', cfg.baseline?.clampZero ? 'on' : 'off'],
      ['Phase_alignment', cfg.phaseAlignment || 'off'],
      ['Data_quality_status', a.claimLevel || 'unknown'],
      ['Cycle_coherence_min_r', a.groupCoherence ?? ''],
      ['DoLP_percent', p.dolpPercent ?? state.stats.summary?.dolpEmpiricalPercent ?? ''],
      ['Extinction_ratio', state.stats.summary?.extinctionRatio ?? ''],
      ['Fit_R_squared_percent', p.rSquaredPercent ?? ''],
      ['OriginPro_note', 'Import sheet OriginPro_Data; column A is X, columns B-D are repeats, columns E-H are derived statistics.']
    ];

    const blob = this.createWorkbook([
      { name: 'OriginPro_Data', rows: originRows },
      { name: 'Raw_Preprocessing', rows: rawRows },
      { name: 'Processing_Notes', rows: notes }
    ]);
    this.download(blob, `polarization_originpro_${this.fileStamp()}.xlsx`);
    return true;
  }

  static createWorkbook(sheets) {
    const files = [
      ['[Content_Types].xml', this.contentTypes(sheets.length)],
      ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
      ['xl/workbook.xml', this.workbookXml(sheets)],
      ['xl/_rels/workbook.xml.rels', this.workbookRelationships(sheets.length)],
      ...sheets.map((sheet, i) => [`xl/worksheets/sheet${i + 1}.xml`, this.sheetXml(sheet.rows)])
    ];
    return new Blob([this.zipStore(files)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  static sheetXml(rows) {
    const rowXml = rows.map((row, r) => `<row r="${r + 1}">${row.map((value, c) => this.cellXml(value, c + 1, r + 1)).join('')}</row>`).join('');
    return `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rowXml}</sheetData></worksheet>`;
  }

  static cellXml(value, col, row) {
    const ref = `${this.columnName(col)}${row}`;
    if (typeof value === 'number' && Number.isFinite(value)) return `<c r="${ref}"><v>${value}</v></c>`;
    if (value === null || value === undefined || value === '') return `<c r="${ref}" t="inlineStr"><is><t></t></is></c>`;
    return `<c r="${ref}" t="inlineStr"><is><t>${this.escapeXml(String(value))}</t></is></c>`;
  }

  static contentTypes(count) {
    const overrides = Array.from({ length: count }, (_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('');
    return `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${overrides}</Types>`;
  }

  static workbookXml(sheets) {
    return `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${this.escapeXml(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`;
  }

  static workbookRelationships(count) {
    return `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${Array.from({ length: count }, (_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}</Relationships>`;
  }

  static zipStore(files) {
    const encoder = new TextEncoder(); const parts = []; const central = []; let offset = 0;
    files.forEach(([name, text]) => {
      const nameBytes = encoder.encode(name), data = encoder.encode(text), crc = this.crc32(data);
      const local = this.header(0x04034b50, [20, 0x0800, 0, 0, 0, crc, data.length, data.length, nameBytes.length, 0]);
      parts.push(local, nameBytes, data);
      central.push(this.header(0x02014b50, [20, 20, 0x0800, 0, 0, 0, crc, data.length, data.length, nameBytes.length, 0, 0, 0, 0, 0, offset]), nameBytes);
      offset += local.length + nameBytes.length + data.length;
    });
    const centralSize = central.reduce((n, p) => n + p.length, 0);
    parts.push(...central, this.header(0x06054b50, [0, 0, files.length, files.length, centralSize, offset, 0]));
    return new Blob(parts);
  }

  static header(signature, values) {
    const sizes = signature === 0x04034b50
      ? [2, 2, 2, 2, 2, 4, 4, 4, 2, 2]
      : signature === 0x02014b50
        ? [2, 2, 2, 2, 2, 2, 4, 4, 4, 2, 2, 2, 2, 2, 4, 4]
        : [2, 2, 2, 2, 4, 4, 2];
    const out = new Uint8Array(4 + values.reduce((n, _, i) => n + sizes[i], 0)); const view = new DataView(out.buffer); view.setUint32(0, signature, true);
    let pos = 4; values.forEach((v, i) => { const size = sizes[i]; size === 2 ? view.setUint16(pos, v, true) : view.setUint32(pos, v >>> 0, true); pos += size; }); return out;
  }

  static crc32(bytes) { let crc = -1; for (const b of bytes) { crc ^= b; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); } return (crc ^ -1) >>> 0; }
  static columnName(n) { let s = ''; while (n) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; }
  static escapeXml(s) { return s.replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]); }
  static fileStamp() { return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19); }
  static download(blob, filename) { const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 0); }
}

if (typeof window !== 'undefined') window.XlsxExporter = XlsxExporter;
