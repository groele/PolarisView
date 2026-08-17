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

    const polarRows = [['Angle_deg', 'Mean', 'Group1', 'Group2', 'Group3', 'Mean_X', 'Mean_Y', 'Group1_X', 'Group1_Y', 'Group2_X', 'Group2_Y', 'Group3_X', 'Group3_Y']];
    stats.forEach(s => {
      const rad = s.relAngle * Math.PI / 180;
      const values = [s.mean, s.values[0] ?? 0, s.values[1] ?? 0, s.values[2] ?? 0];
      const xy = values.flatMap(v => [Number((v * Math.cos(rad)).toFixed(4)), Number((v * Math.sin(rad)).toFixed(4))]);
      polarRows.push([s.relAngle, ...values, ...xy]);
    });
    const blob = this.createWorkbook([
      { name: 'Polar_Preview', rows: polarRows, nativePolarChart: true },
      { name: 'OriginPro_Data', rows: originRows },
      { name: 'Raw_Preprocessing', rows: rawRows },
      { name: 'Processing_Notes', rows: notes }
    ]);
    this.download(blob, `polarization_originpro_${this.fileStamp()}.xlsx`);
    return true;
  }

  static createWorkbook(sheets) {
    const chartSheets = sheets.map((sheet, i) => ({ ...sheet, index: i + 1 })).filter(sheet => sheet.nativePolarChart);
    const files = [
      ['[Content_Types].xml', this.contentTypes(sheets.length, chartSheets.length > 0)],
      ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
      ['xl/workbook.xml', this.workbookXml(sheets)],
      ['xl/_rels/workbook.xml.rels', this.workbookRelationships(sheets.length)],
      ['xl/styles.xml', this.stylesXml()],
      ...sheets.map((sheet, i) => [`xl/worksheets/sheet${i + 1}.xml`, this.sheetXml(sheet.rows, chartSheets.find(p => p.index === i + 1))]),
      ...chartSheets.flatMap((sheet, i) => [
        [`xl/worksheets/_rels/sheet${sheet.index}.xml.rels`, this.sheetRelationship(i + 1)],
        [`xl/drawings/drawing${i + 1}.xml`, this.drawingXml()],
        [`xl/drawings/_rels/drawing${i + 1}.xml.rels`, this.drawingRelationship(i + 1)],
        [`xl/charts/chart${i + 1}.xml`, this.polarScatterChartXml(sheet.name, sheet.rows)]
      ])
    ];
    return new Blob([this.zipStore(files)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  static sheetXml(rows, previewSheet = null) {
    const rowXml = rows.map((row, r) => `<row r="${r + 1}">${row.map((value, c) => this.cellXml(value, c + 1, r + 1)).join('')}</row>`).join('');
    const drawing = previewSheet ? '<drawing r:id="rId1"/>' : '';
    const count = Math.max(...rows.map(r => r.length), 1);
    const cols = Array.from({ length: count }, (_, i) => {
      const helper = previewSheet && i >= 5;
      return `<col min="${i + 1}" max="${i + 1}" width="${i === 0 ? 13 : 15}" customWidth="1"${helper ? ' hidden="1"' : ''}/>`;
    }).join('');
    const filter = rows.length > 1 ? `<autoFilter ref="A1:${this.columnName(count)}${rows.length}"/>` : '';
    return `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${cols}</cols><sheetData>${rowXml}</sheetData>${filter}${drawing}</worksheet>`;
  }

  static cellXml(value, col, row) {
    const ref = `${this.columnName(col)}${row}`;
    const style = row === 1 ? ' s="1"' : typeof value === 'number' && Number.isFinite(value) ? ' s="2"' : '';
    if (typeof value === 'number' && Number.isFinite(value)) return `<c r="${ref}"${style}><v>${value}</v></c>`;
    if (value === null || value === undefined || value === '') return `<c r="${ref}"${style} t="inlineStr"><is><t></t></is></c>`;
    return `<c r="${ref}"${style} t="inlineStr"><is><t>${this.escapeXml(String(value))}</t></is></c>`;
  }

  static contentTypes(count, hasChart) {
    const overrides = Array.from({ length: count }, (_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('');
    const chartType = hasChart ? '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/><Override PartName="/xl/charts/chart1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>' : '';
    return `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${chartType}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${overrides}</Types>`;
  }

  static workbookXml(sheets) {
    return `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${this.escapeXml(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`;
  }

  static workbookRelationships(count) {
    return `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${Array.from({ length: count }, (_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${count + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
  }

  static sheetRelationship(drawingIndex) { return `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing${drawingIndex}.xml"/></Relationships>`; }
  static drawingRelationship(chartIndex) { return `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart${chartIndex}.xml"/></Relationships>`; }
  static drawingXml() { return '<?xml version="1.0" encoding="UTF-8"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><xdr:twoCellAnchor editAs="oneCell"><xdr:from><xdr:col>5</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>1</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>15</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>32</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:graphicFrame><xdr:nvGraphicFramePr><xdr:cNvPr id="2" name="Polar chart"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="rId1"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor></xdr:wsDr>'; }
  static radarChartXml(sheetName, rows) {
    const count = Math.max(0, rows.length - 1), safeSheet = `'${sheetName.replace(/'/g, "''")}'`;
    const categories = rows.slice(1).map(r => r[0]);
    const cache = (values, tag = 'numCache') => `<c:${tag}><c:formatCode>General</c:formatCode><c:ptCount val="${values.length}"/>${values.map((v, i) => `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`).join('')}</c:${tag}>`;
    const series = [1, 2, 3, 4].map((col, i) => {
      const values = rows.slice(1).map(r => Number(r[col]) || 0), title = rows[0][col];
      return `<c:ser><c:idx val="${i}"/><c:order val="${i}"/><c:tx><c:strRef><c:f>${safeSheet}!$${this.columnName(col + 1)}$1</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>${title}</c:v></c:pt></c:strCache></c:strRef></c:tx><c:cat><c:numRef><c:f>${safeSheet}!$A$2:$A$${count + 1}</c:f>${cache(categories)}</c:numRef></c:cat><c:val><c:numRef><c:f>${safeSheet}!$${this.columnName(col + 1)}$2:$${this.columnName(col + 1)}$${count + 1}</c:f>${cache(values)}</c:numRef></c:val></c:ser>`;
    }).join('');
    return `<?xml version="1.0" encoding="UTF-8"?><c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><c:chart><c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="zh-CN"/><a:t>Polarization polar preview</a:t></a:r></a:p></c:rich></c:tx><c:layout/></c:title><c:plotArea><c:layout/><c:radarChart><c:radarStyle val="marker"/><c:varyColors val="0"/>${series}<c:axId val="1"/><c:axId val="2"/></c:radarChart><c:valAx><c:axId val="1"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="l"/><c:majorGridlines/><c:numFmt formatCode="General" sourceLinked="1"/><c:crossAx val="2"/><c:crosses val="autoZero"/></c:valAx><c:catAx><c:axId val="2"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/><c:crossAx val="1"/><c:crosses val="autoZero"/></c:catAx></c:plotArea><c:legend><c:legendPos val="r"/><c:layout/></c:legend><c:plotVisOnly val="1"/></c:chart></c:chartSpace>`;
  }

  static polarScatterChartXml(sheetName, rows) {
    const n = rows.length - 1, sheet = `'${sheetName}'`, cache = values => `<c:numCache><c:formatCode>0.00</c:formatCode><c:ptCount val="${values.length}"/>${values.map((v, i) => `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`).join('')}</c:numCache>`;
    const radius = Math.max(1, ...rows.slice(1).flatMap(row => row.slice(5).map(v => Math.abs(Number(v) || 0))));
    const limit = Math.ceil(radius / 100) * 100;
    const spec = [[1, 5, 6, '2F75B5'], [2, 7, 8, 'E67E22'], [3, 9, 10, '27AE60'], [4, 11, 12, '8E44AD']];
    const series = spec.map(([label, x, y, color], i) => {
      const xs = rows.slice(1).map(r => Number(r[x]) || 0), ys = rows.slice(1).map(r => Number(r[y]) || 0), name = rows[0][label], xc = this.columnName(x + 1), yc = this.columnName(y + 1), lc = this.columnName(label + 1);
      return `<c:ser><c:idx val="${i}"/><c:order val="${i}"/><c:tx><c:strRef><c:f>${sheet}!$${lc}$1</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>${name}</c:v></c:pt></c:strCache></c:strRef></c:tx><c:spPr><a:ln w="19050"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill></a:ln></c:spPr><c:marker><c:symbol val="circle"/><c:size val="4"/></c:marker><c:xVal><c:numRef><c:f>${sheet}!$${xc}$2:$${xc}$${n + 1}</c:f>${cache(xs)}</c:numRef></c:xVal><c:yVal><c:numRef><c:f>${sheet}!$${yc}$2:$${yc}$${n + 1}</c:f>${cache(ys)}</c:numRef></c:yVal></c:ser>`;
    }).join('');
    const title = text => `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="1000"/><a:t>${text}</a:t></a:r></a:p></c:rich></c:tx><c:layout/></c:title>`;
    return `<?xml version="1.0" encoding="UTF-8"?><c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><c:style val="13"/><c:chart>${title('Polar coordinate preview')}<c:plotArea><c:layout/><c:scatterChart><c:scatterStyle val="lineMarker"/><c:varyColors val="0"/>${series}<c:axId val="1"/><c:axId val="2"/></c:scatterChart><c:valAx><c:axId val="1"/><c:scaling><c:orientation val="minMax"/><c:min val="-${limit}"/><c:max val="${limit}"/></c:scaling><c:delete val="0"/><c:axPos val="b"/>${title('X (Counts)')}<c:majorGridlines/><c:numFmt formatCode="0" sourceLinked="0"/><c:crossAx val="2"/><c:crosses val="autoZero"/></c:valAx><c:valAx><c:axId val="2"/><c:scaling><c:orientation val="minMax"/><c:min val="-${limit}"/><c:max val="${limit}"/></c:scaling><c:delete val="0"/><c:axPos val="l"/>${title('Y (Counts)')}<c:majorGridlines/><c:numFmt formatCode="0" sourceLinked="0"/><c:crossAx val="1"/><c:crosses val="autoZero"/></c:valAx></c:plotArea><c:legend><c:legendPos val="r"/><c:layout/></c:legend><c:plotVisOnly val="1"/></c:chart></c:chartSpace>`;
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
