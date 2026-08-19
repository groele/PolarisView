/** Lightweight, dependency-free XLSX writer for local/offline Chrome extensions. */
class XlsxExporter {
  static exportPolarization(state) {
    if (!state?.rawBaselineResult) return false;

    const { rawPoints, baseline, subtracted, unboundedSubtracted } = state.rawBaselineResult;
    const stats = state.stats?.stepStats || [];
    const rawRows = [['Index', 'X', 'Angle_deg', 'Raw_Intensity', 'Baseline', 'Net_Unclamped', 'Net_Displayed']];
    rawPoints.forEach((p, i) => rawRows.push([i + 1, p.rawX, p.angle, p.y, baseline[i], (unboundedSubtracted || subtracted)[i], subtracted[i]]));

    const p = state.fitResult?.params || {};
    const a = state.qualityAudit || {};
    const cfg = state.provenance || {};
    const reportable = a.claimLevel !== 'blocked';
    const originRows = [['Angle_deg', 'Group1', 'Group2', 'Group3', 'Mean', 'SD', 'SE', 'RSD_percent', 'N']];
    stats.forEach(s => originRows.push([
      s.relAngle, s.values[0] ?? '', s.values[1] ?? '', s.values[2] ?? '',
      reportable ? s.mean : '', reportable ? s.sd : '', reportable ? (s.se ?? '') : '',
      reportable ? s.rsd : '', reportable ? s.n : ''
    ]));
    const notes = [
      ['Field', 'Value'],
      ['Analysis_ID', cfg.analysisId || ''],
      ['PolarisView_version', cfg.appVersion || ''],
      ['Exported_UTC', cfg.processedAt || new Date().toISOString()],
      ['Source_type', cfg.source?.sourceType || ''],
      ['Source_file', cfg.source?.fileName || ''],
      ['Source_size_bytes', cfg.source?.sizeBytes ?? ''],
      ['Source_encoding', cfg.source?.encoding || ''],
      ['Source_SHA256', cfg.source?.sha256 || ''],
      ['Parser_accepted_lines', cfg.parserDiagnostics?.acceptedLines ?? ''],
      ['Parser_rejected_lines', cfg.parserDiagnostics?.rejectedLines ?? ''],
      ['Analysis_mode', cfg.analysisMode || ''],
      ['Baseline_algorithm', cfg.baseline?.algorithm || 'none'],
      ['Baseline_parameters', JSON.stringify(cfg.baseline?.options || {})],
      ['Negative_value_clamp', cfg.baseline?.clampZero ? 'on' : 'off'],
      ['Phase_alignment', cfg.phaseAlignment || 'off'],
      ['Analysis_groups', (a.analysisGroups || []).join('; ') || 'none'],
      ['Excluded_groups', (a.excludedGroups || []).join('; ') || 'none'],
      ['Statistics_group_count', stats.length ? Math.max(...stats.map(s => s.n || 0)) : 0],
      ['Reused_source_memberships', a.reusedSourcePoints || 0],
      ['Data_quality_status', a.claimLevel || 'unknown'],
      ['Cycle_coherence_min_r', a.groupCoherence ?? ''],
      ['Modulation_proxy_percent', reportable ? (p.dolpPercent ?? state.stats?.summary?.dolpEmpiricalPercent ?? '') : 'not reportable'],
      ['Extinction_ratio', reportable ? (state.stats?.summary?.extinctionRatio ?? '') : 'not reportable'],
      ['Fit_R_squared_percent', reportable ? (p.rSquaredPercent ?? '') : 'not reportable'],
      ['Axis_theta0_CI95_deg', reportable && p.theta0CI95 ? p.theta0CI95.join(' to ') : ''],
      ['Modulation_proxy_CI95_percent', reportable && p.dolpCI95Percent ? p.dolpCI95Percent.join(' to ') : ''],
      ['Fit_degrees_of_freedom', reportable ? (p.degreesOfFreedom ?? '') : 'not reportable'],
      ['Fit_condition_proxy', reportable ? (p.conditionProxy ?? '') : 'not reportable'],
      ['Experiment_metadata_JSON', JSON.stringify(cfg.experiment || {})],
      ['OriginPro_note', 'Import OriginPro_Data: column A is angle; B-D are repeat slots; E-I are derived statistics. No charts are embedded.']
    ];

    const recipeRows = [
      ['Section', 'JSON'],
      ['Source', JSON.stringify(cfg.source || {})],
      ['Parser', JSON.stringify(cfg.parserDiagnostics || {})],
      ['Experiment', JSON.stringify(cfg.experiment || {})],
      ['Processing', JSON.stringify(cfg)],
      ['Quality', JSON.stringify(a)]
    ];

    const blob = this.createWorkbook([
      { name: 'OriginPro_Data', rows: originRows },
      { name: 'Raw_Preprocessing', rows: rawRows },
      { name: 'Processing_Notes', rows: notes },
      { name: 'Analysis_Recipe', rows: recipeRows }
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
      ['xl/styles.xml', this.stylesXml()],
      ...sheets.map((sheet, i) => [`xl/worksheets/sheet${i + 1}.xml`, this.sheetXml(sheet.rows)])
    ];
    return new Blob([this.zipStore(files)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  static sheetXml(rows) {
    const rowXml = rows.map((row, r) => `<row r="${r + 1}">${row.map((value, c) => this.cellXml(value, c + 1, r + 1)).join('')}</row>`).join('');
    const count = Math.max(...rows.map(r => r.length), 1);
    const cols = Array.from({ length: count }, (_, i) => `<col min="${i + 1}" max="${i + 1}" width="${i === 0 ? 14 : 18}" customWidth="1"/>`).join('');
    const filter = rows.length > 1 ? `<autoFilter ref="A1:${this.columnName(count)}${rows.length}"/>` : '';
    return `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${cols}</cols><sheetData>${rowXml}</sheetData>${filter}</worksheet>`;
  }

  static cellXml(value, col, row) {
    const ref = `${this.columnName(col)}${row}`;
    const style = row === 1 ? ' s="1"' : typeof value === 'number' && Number.isFinite(value) ? ' s="2"' : '';
    if (typeof value === 'number' && Number.isFinite(value)) return `<c r="${ref}"${style}><v>${value}</v></c>`;
    if (value === null || value === undefined || value === '') return `<c r="${ref}"${style} t="inlineStr"><is><t></t></is></c>`;
    return `<c r="${ref}"${style} t="inlineStr"><is><t>${this.escapeXml(String(value))}</t></is></c>`;
  }

  static contentTypes(count) {
    const overrides = Array.from({ length: count }, (_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('');
    return `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${overrides}</Types>`;
  }

  static workbookXml(sheets) {
    return `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${this.escapeXml(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`;
  }

  static workbookRelationships(count) {
    return `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${Array.from({ length: count }, (_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${count + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
  }

  static stylesXml() { return '<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="0.00"/></numFmts><fonts count="2"><font><sz val="10"/><name val="Aptos"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="10"/><name val="Aptos"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1F4E78"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFD9E2F3"/></left><right style="thin"><color rgb="FFD9E2F3"/></right><top style="thin"><color rgb="FFD9E2F3"/></top><bottom style="thin"><color rgb="FFD9E2F3"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="1" applyBorder="1"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" applyFont="1" applyFill="1" applyBorder="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="1" applyNumberFormat="1" applyBorder="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'; }

  static zipStore(files) {
    const encoder = new TextEncoder(); const parts = []; const central = []; let offset = 0;
    files.forEach(([name, text]) => {
      const nameBytes = encoder.encode(name), data = text instanceof Uint8Array ? text : encoder.encode(text), crc = this.crc32(data);
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
    const sizes = signature === 0x04034b50 ? [2, 2, 2, 2, 2, 4, 4, 4, 2, 2] : signature === 0x02014b50 ? [2, 2, 2, 2, 2, 2, 4, 4, 4, 2, 2, 2, 2, 2, 4, 4] : [2, 2, 2, 2, 4, 4, 2];
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
