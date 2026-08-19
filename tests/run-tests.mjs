import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

async function load(file, className, alias) {
  const source = await readFile(file, 'utf8');
  vm.runInThisContext(`${source}\n;globalThis.${alias}=${className};`, { filename: file });
}

await load('js/core/parser.js', 'DataParser', 'DataParserTest');
await load('js/core/data-quality.js', 'DataQuality', 'DataQualityTest');
await load('js/algorithms/baseline-engine.js', 'BaselineEngine', 'BaselineEngineTest');
await load('js/algorithms/malus-fitter.js', 'MalusFitter', 'MalusFitterTest');
await load('js/core/xlsx-exporter.js', 'XlsxExporter', 'XlsxExporterTest');

const headerCase = DataParserTest.parseRawDataDetailed('Sample 1, angle 0, counts 7119\n1,7191\n2,7152', 10);
assert.equal(headerCase.points.length, 2);
assert.equal(headerCase.diagnostics.rejectedLines, 1);
assert.equal(headerCase.points[0].y, 7191);

const rawText = await readFile('Pol.txt', 'utf8');
const parsed = DataParserTest.parseRawDataDetailed(rawText, 10);
const sourcePoints = parsed.points.map((point, sourceIndex) => ({ ...point, sourceIndex, effectiveY: point.y }));
const repeats = DataParserTest.extractIndependentCycles(sourcePoints, 360, 3);
const memberships = repeats.flatMap(group => group.points.map(point => point.sourceIndex));
assert.deepEqual(repeats.map(group => group.points.length), [36, 37]);
assert.equal(memberships.length, parsed.points.length);
assert.equal(new Set(memberships).size, parsed.points.length);

const fitPoints = repeats.flatMap(group => group.points.map(point => ({ angle: point.relAngle, y: point.y, sourceIndex: point.sourceIndex })));
const fit = MalusFitterTest.fitMalusLaw(fitPoints);
assert.ok(fit);
assert.equal(fit.params.degreesOfFreedom, 68);
assert.ok(fit.params.conditionProxy < 10);
assert.ok(Array.isArray(fit.params.theta0CI95));
assert.ok(Array.isArray(fit.params.dolpCI95Percent));

const degenerate = MalusFitterTest.fitMalusLaw(Array.from({ length: 6 }, (_, i) => ({ angle: 0, y: i + 1 })));
assert.equal(degenerate, null);
assert.match(MalusFitterTest.lastFailureReason, /独立角度|秩不足/);

const rawY = parsed.points.map(point => point.y);
const baselineNone = BaselineEngineTest.computeBaselineAndSubtract(rawY, parsed.points.map(point => point.rawX), 'none', {}, false);
assert.deepEqual(baselineNone.subtracted, rawY);
const constantMin = BaselineEngineTest.computeBaselineAndSubtract(rawY, parsed.points.map(point => point.rawX), 'constant', { mode: 'min' }, true);
assert.ok(Math.max(...constantMin.subtracted) < Math.max(...rawY));

const audit = DataQualityTest.auditProcessing(
  { ...DataQualityTest.auditInput(sourcePoints, 10), parserDiagnostics: parsed.diagnostics },
  baselineNone,
  repeats,
  fit,
  { analysisMode: 'independent_cycles', autoPhaseLock: false, fitFailureReason: '' }
);
assert.equal(audit.reusedSourcePoints, 0);
assert.equal(audit.claimLevel, 'supported');

const legacy = DataParserTest.extractGroups(sourcePoints, [
  { id: 'group1', name: 'Group 1', start: 0, end: 36 },
  { id: 'group2', name: 'Group 2', start: 18, end: 54 },
  { id: 'group3', name: 'Group 3', start: 36, end: 72 }
], 10, false);
const legacyAudit = DataQualityTest.auditProcessing(
  { ...DataQualityTest.auditInput(sourcePoints, 10), parserDiagnostics: parsed.diagnostics },
  baselineNone,
  legacy,
  fit,
  { analysisMode: 'legacy_sliding', autoPhaseLock: false, fitFailureReason: '' }
);
assert.ok(legacyAudit.reusedSourcePoints > 0);
assert.equal(legacyAudit.claimLevel, 'blocked');

const html = await readFile('index.html', 'utf8');
assert.match(html, /<option value="none" selected>/);
assert.match(html, /id="clampZero">/);
assert.doesNotMatch(html, /id="clampZero" checked/);
for (const id of ['ribbonDolp', 'ribbonER', 'ribbonTheta', 'ribbonR2', 'ribbonBg', 'ribbonModulation', 'ribbonRmse']) {
  assert.match(html, new RegExp(`id="${id}"[^>]*>—<`));
}

const workbook = XlsxExporterTest.createWorkbook([
  { name: 'OriginPro_Data', rows: [['Angle', 'Mean'], [0, 1]] },
  { name: 'Analysis_Recipe', rows: [['Section', 'JSON'], ['Quality', '{"status":"supported"}']] }
]);
const bytes = new Uint8Array(await workbook.arrayBuffer());
assert.deepEqual([...bytes.slice(0, 4)], [0x50, 0x4b, 0x03, 0x04]);
const workbookText = new TextDecoder().decode(bytes);
assert.match(workbookText, /Analysis_Recipe/);
assert.doesNotMatch(workbookText, /xl\/charts|xl\/drawings/);

let blockedWorkbook = null;
XlsxExporterTest.download = blob => { blockedWorkbook = blob; };
assert.equal(XlsxExporterTest.exportPolarization({
  rawBaselineResult: {
    rawPoints: [{ rawX: 0, angle: 0, y: 10 }],
    baseline: [0], subtracted: [10], unboundedSubtracted: [10]
  },
  stats: { stepStats: [{ relAngle: 0, values: [10], mean: 9876.5, sd: 0, se: null, rsd: 0, n: 1 }], summary: {} },
  fitResult: null,
  qualityAudit: { claimLevel: 'blocked', issues: [] },
  provenance: { analysisMode: 'legacy_sliding' }
}), true);
const blockedText = new TextDecoder().decode(new Uint8Array(await blockedWorkbook.arrayBuffer()));
assert.doesNotMatch(blockedText, /9876\.5/);
assert.match(blockedText, /not reportable/);

console.log('PASS scientific integrity, parser diagnostics, independent repeats, stable fit, safe defaults, and XLSX structure');
