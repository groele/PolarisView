import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';

const candidates = process.platform === 'win32'
  ? [
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe')
    ]
  : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];

let chromePath = '';
for (const candidate of candidates) {
  try { await readFile(candidate); chromePath = candidate; break; } catch {}
}
if (!chromePath) throw new Error('Chrome/Chromium executable not found.');

const sample = await readFile('Pol.txt', 'utf8');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.txt': 'text/plain' };
const runner = `<!doctype html><meta charset="utf-8"><title>RUNNING</title><iframe id="app" src="/index.html"></iframe><pre id="result">RUNNING</pre><script>
const frame=document.getElementById('app');
frame.addEventListener('load',async()=>{
  const w=frame.contentWindow,d=frame.contentDocument;
  await new Promise(r=>setTimeout(r,300));
  const blank={values:['ribbonDolp','ribbonER','ribbonTheta','ribbonR2','ribbonBg','ribbonModulation','ribbonRmse'].map(id=>d.getElementById(id).textContent),disabled:d.getElementById('btnExportXlsx').disabled,emptyVisible:getComputedStyle(d.getElementById('emptyWorkspaceState')).display!=='none'};
  const input=d.getElementById('rawDataInput'); input.value=${JSON.stringify(sample)}; input.dispatchEvent(new Event('input',{bubbles:true}));
  await new Promise(r=>setTimeout(r,800));
  const analysed={groups:w.app.parsedState.groups.map(g=>g.points.length),reused:w.app.parsedState.qualityAudit.reusedSourcePoints,level:w.app.parsedState.qualityAudit.claimLevel,mode:w.app.parsedState.provenance.analysisMode,baseline:w.app.parsedState.provenance.baseline.algorithm,reportable:w.app.parsedState.isReportable,exportEnabled:!d.getElementById('btnExportXlsx').disabled};
  document.getElementById('result').textContent=JSON.stringify({blank,analysed}); document.title='POLARISVIEW_TEST_DONE';
});
</script>`;

const server = createServer(async (request, response) => {
  try {
    const urlPath = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    if (urlPath === '/__browser_test__.html') {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); response.end(runner); return;
    }
    const relative = urlPath === '/' ? 'index.html' : urlPath.replace(/^\//, '');
    const absolute = path.resolve(relative);
    if (!absolute.startsWith(path.resolve('.'))) throw new Error('invalid path');
    const body = await readFile(absolute);
    response.writeHead(200, { 'Content-Type': mime[path.extname(absolute)] || 'application/octet-stream' }); response.end(body);
  } catch { response.writeHead(404); response.end('not found'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;

try {
  const chrome = spawn(chromePath, [
    '--headless=new', '--disable-gpu', '--disable-software-rasterizer',
    '--disable-extensions', '--disable-gpu-shader-disk-cache',
    '--no-first-run', '--no-default-browser-check', '--dump-dom',
    '--virtual-time-budget=4000', `http://127.0.0.1:${port}/__browser_test__.html`
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  chrome.stdout.setEncoding('utf8'); chrome.stderr.setEncoding('utf8');
  chrome.stdout.on('data', chunk => { stdout += chunk; }); chrome.stderr.on('data', chunk => { stderr += chunk; });
  const exitCode = await new Promise((resolve, reject) => { chrome.on('error', reject); chrome.on('close', resolve); });
  assert.equal(exitCode, 0, stderr);
  const match = stdout.match(/<pre id="result">([^<]+)<\/pre>/);
  assert.ok(match, `Browser test result not found. ${stderr}`);
  const result = JSON.parse(match[1].replaceAll('&quot;', '"').replaceAll('&amp;', '&'));
  assert.deepEqual(result.blank.values, Array(7).fill('—'));
  assert.equal(result.blank.disabled, true);
  assert.equal(result.blank.emptyVisible, true);
  assert.deepEqual(result.analysed.groups, [36, 37]);
  assert.equal(result.analysed.reused, 0);
  assert.equal(result.analysed.level, 'supported');
  assert.equal(result.analysed.mode, 'independent_cycles');
  assert.equal(result.analysed.baseline, 'none');
  assert.equal(result.analysed.reportable, true);
  assert.equal(result.analysed.exportEnabled, true);
  console.log('PASS browser: honest empty state and independent-cycle analysis flow');
} finally {
  server.close();
}
