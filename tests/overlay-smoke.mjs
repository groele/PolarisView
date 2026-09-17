import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';

const candidate = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const sample = await readFile('Pol.txt', 'utf8');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.txt': 'text/plain' };

const runner = `<!doctype html><meta charset="utf-8"><title>RUNNING</title><iframe id="app" src="/index.html"></iframe><pre id="result">RUNNING</pre><script>
const frame=document.getElementById('app');
frame.addEventListener('load',async()=>{
  const w=frame.contentWindow,d=frame.contentDocument;
  await new Promise(r=>setTimeout(r,300));
  const input=d.getElementById('rawDataInput'); input.value=${JSON.stringify(sample)}; input.dispatchEvent(new Event('input',{bubbles:true}));
  await new Promise(r=>setTimeout(r,800));

  // 1. 验证预设 real_pol 联动
  w.app.loadPreset('real_pol');
  await new Promise(r=>setTimeout(r,300));
  const presetRot = w.app.overlayManager.overlayConfig.rotation;
  const isDynamicRange = w.app.overlayManager.overlayConfig.dynamicRange;
  const sampleName = w.app.overlayManager.currentPresetSampleName;

  // 2. 切换到样品叠加视图
  const overlayBtn=d.querySelector('[data-view="overlay"]');
  overlayBtn.click();
  await new Promise(r=>setTimeout(r,300));

  // 3. 验证覆盖管理器状态：默认无底图，优先展示极坐标图
  const activeView = w.app.activeView;
  const overlayVisible = getComputedStyle(d.getElementById('overlayChartCard')).display === 'flex';
  const hasSampleImageByDefault = Boolean(w.app.overlayManager.image);
  const hasPolarDataPrioritized = Boolean(w.app.overlayManager.polarData);

  // 3.1 验证点击“预设联动图”按钮后按需载入光学底图
  d.getElementById('btnOverlaySampleImg').click();
  await new Promise(r=>setTimeout(r,300));
  const hasSampleImageAfterDemand = Boolean(w.app.overlayManager.image);

  // 4. 验证单击吸附 (Click-to-Locate)
  const canvas = d.getElementById('overlayCanvas');
  const rect = canvas.getBoundingClientRect();
  const clickX = rect.left + (rect.width || 800) * 0.3;
  const clickY = rect.top + (rect.height || 600) * 0.4;
  canvas.dispatchEvent(new w.MouseEvent('mousedown', { clientX: clickX, clientY: clickY, bubbles: true }));
  canvas.dispatchEvent(new w.MouseEvent('mouseup', { clientX: clickX, clientY: clickY, bubbles: true }));
  const clickedOffsetX = w.app.overlayManager.overlayConfig.offsetX;
  const clickedOffsetY = w.app.overlayManager.overlayConfig.offsetY;

  // 5. 验证侧边栏微调滑块与状态联动
  const rotSlider = d.getElementById('overlayRotation');
  rotSlider.value = 45;
  rotSlider.dispatchEvent(new Event('input', { bubbles: true }));
  const currentRotation = w.app.overlayManager.overlayConfig.rotation;

  // 6. 验证预设切换联动 ideal_hwp
  w.app.loadPreset('ideal_hwp');
  await new Promise(r=>setTimeout(r,300));
  const idealRot = w.app.overlayManager.overlayConfig.rotation;
  const idealSample = w.app.overlayManager.currentPresetSampleName;

  // 7. 验证导出拦截
  let exportTriggered = false;
  let exportOptions = null;
  w.app.overlayManager.exportOverlayImage = async (opts) => {
    exportTriggered = true;
    exportOptions = opts;
  };
  d.getElementById('btnOverlayExportPng').click();

  // 8. 验证用户自行导入图片时：自动切换到叠加视图 + 步骤 1 显示缩略图预览卡片
  w.app.switchToView('polar');
  await new Promise(r=>setTimeout(r,150));
  const viewBeforeUpload = w.app.activeView;

  // 创建测试图像并模拟步骤 1 文件上传
  const testCanvas = d.createElement('canvas');
  testCanvas.width = 120; testCanvas.height = 80;
  const tctx = testCanvas.getContext('2d');
  tctx.fillStyle = '#10b981'; tctx.fillRect(0,0,120,80);
  const blob = await new Promise(res => testCanvas.toBlob(res, 'image/png'));
  const userFile = new w.File([blob], 'lab_micrograph_flake.png', { type: 'image/png' });
  const dt = new w.DataTransfer();
  dt.items.add(userFile);
  const step1Input = d.getElementById('step1OptFileInput');
  step1Input.files = dt.files;
  step1Input.dispatchEvent(new Event('change', { bubbles: true }));
  await new Promise(r=>setTimeout(r,400));

  const viewAfterUpload = w.app.activeView;
  const overlayVisibleAfterUpload = getComputedStyle(d.getElementById('overlayChartCard')).display === 'flex';
  const step1PreviewVisible = getComputedStyle(d.getElementById('step1OptPreviewCard')).display !== 'none';
  const step1UploadZoneHidden = getComputedStyle(d.getElementById('step1OptUploadZone')).display === 'none';
  const step1FileName = d.getElementById('step1OptFileName').textContent;
  const step1Resolution = d.getElementById('step1OptResolution').textContent;
  const step1ThumbHasSrc = Boolean(d.getElementById('step1OptThumbnail').src);
  const uploadedImageName = w.app.overlayManager.imageName;

  // 9. 验证清除底图后状态完全复原
  d.getElementById('btnStep1ClearImg').click();
  await new Promise(r=>setTimeout(r,150));
  const step1PreviewAfterClear = getComputedStyle(d.getElementById('step1OptPreviewCard')).display === 'none';
  const step1UploadZoneAfterClear = getComputedStyle(d.getElementById('step1OptUploadZone')).display !== 'none';
  const hasImageAfterClear = Boolean(w.app.overlayManager.image);

  // 10. 验证快捷旋转步进器、HUD 面板、翡翠绿配色切换与全屏模式
  const rotBeforeP5 = w.app.overlayManager.overlayConfig.rotation;
  d.getElementById('btnOverlayRotP5').click();
  const rotAfterP5 = w.app.overlayManager.overlayConfig.rotation;

  d.getElementById('btnToggleOverlayHud').click();
  const hudVisible = getComputedStyle(d.getElementById('overlayQuickHud')).display !== 'none';

  d.querySelector('.hud-theme-pill[data-theme="emerald"]').click();
  const themeAfterClick = w.app.overlayManager.overlayConfig.theme;

  d.querySelector('.hud-dock-btn[data-corner="top-left"]').click();
  const cornerAfterClick = w.app.overlayManager.overlayConfig.badgeCorner;

  d.getElementById('btnOverlayFullscreen').click();
  const cardHasFullscreen = d.getElementById('overlayChartCard').classList.contains('is-fullscreen');
  d.getElementById('btnOverlayFullscreen').click(); // toggle back

  document.getElementById('result').textContent=JSON.stringify({
    activeView,
    overlayVisible,
    hasSampleImageByDefault,
    hasPolarDataPrioritized,
    hasSampleImageAfterDemand,
    presetRot,
    isDynamicRange,
    sampleName,
    clickedOffsetX,
    clickedOffsetY,
    currentRotation,
    idealRot,
    idealSample,
    exportTriggered,
    exportOptions,
    viewBeforeUpload,
    viewAfterUpload,
    overlayVisibleAfterUpload,
    step1PreviewVisible,
    step1UploadZoneHidden,
    step1FileName,
    step1Resolution,
    step1ThumbHasSrc,
    uploadedImageName,
    step1PreviewAfterClear,
    step1UploadZoneAfterClear,
    hasImageAfterClear,
    rotBeforeP5,
    rotAfterP5,
    hudVisible,
    themeAfterClick,
    cornerAfterClick,
    cardHasFullscreen
  });
});
</script>`;

const server = createServer(async (req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
  if (urlPath === '/__overlay_test__.html') {
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'}); res.end(runner); return;
  }
  const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\//, '');
  const abs = path.resolve(rel);
  try {
    const body = await readFile(abs);
    res.writeHead(200, {'Content-Type': mime[path.extname(abs)] || 'application/octet-stream'}); res.end(body);
  } catch { res.writeHead(404); res.end('404'); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

try {
  const chrome = spawn(candidate, [
    '--headless=new', '--disable-gpu', '--disable-software-rasterizer',
    '--disable-extensions', '--no-first-run', '--dump-dom',
    '--virtual-time-budget=5000', `http://127.0.0.1:${port}/__overlay_test__.html`
  ]);
  let stdout = '';
  let stderr = '';
  chrome.stdout.on('data', d => stdout += d);
  chrome.stderr.on('data', d => stderr += d);
  const exitCode = await new Promise((resolve, reject) => { chrome.on('error', reject); chrome.on('close', resolve); });
  assert.equal(exitCode, 0, stderr);

  const match = stdout.match(/<pre id="result">([^<]+)<\/pre>/);
  assert.ok(match, 'Test result not found in DOM');
  const res = JSON.parse(match[1].replaceAll('&quot;', '"').replaceAll('&amp;', '&'));
  assert.equal(res.activeView, 'overlay');
  assert.equal(res.overlayVisible, true);
  assert.equal(res.hasSampleImageByDefault, false); // 默认不注入虚假底图，极坐标优先展示
  assert.equal(res.hasPolarDataPrioritized, true);   // 极坐标图数据就绪
  assert.equal(res.hasSampleImageAfterDemand, true); // 用户按需点击后载入
  assert.equal(res.presetRot, 36);
  assert.equal(res.isDynamicRange, true);
  assert.ok(res.sampleName.includes('ReS₂'));
  assert.notEqual(res.clickedOffsetX, 0);
  assert.notEqual(res.clickedOffsetY, 0);
  assert.equal(res.currentRotation, 45);
  assert.equal(res.idealRot, 15);
  assert.ok(res.idealSample.includes('Quartz'));
  assert.equal(res.exportTriggered, true);
  assert.equal(res.exportOptions.scale, 3);
  assert.equal(res.exportOptions.format, 'png');

  // 断言用户自主导入图片逻辑
  assert.equal(res.viewBeforeUpload, 'polar');
  assert.equal(res.viewAfterUpload, 'overlay');
  assert.equal(res.overlayVisibleAfterUpload, true);
  assert.equal(res.step1PreviewVisible, true);
  assert.equal(res.step1UploadZoneHidden, true);
  assert.equal(res.step1FileName, 'lab_micrograph_flake.png');
  assert.equal(res.step1Resolution, '120 × 80 px');
  assert.equal(res.step1ThumbHasSrc, true);
  assert.equal(res.uploadedImageName, 'lab_micrograph_flake.png');
  assert.equal(res.step1PreviewAfterClear, true);
  assert.equal(res.step1UploadZoneAfterClear, true);
  assert.equal(res.hasImageAfterClear, false);

  // 断言快捷步进器、HUD 面板、翡翠绿配色与全屏
  assert.equal(res.rotAfterP5, res.rotBeforeP5 + 5);
  assert.equal(res.hudVisible, true);
  assert.equal(res.themeAfterClick, 'emerald');
  assert.equal(res.cornerAfterClick, 'top-left');
  assert.equal(res.cardHasFullscreen, true);

  console.log('PASS overlay smoke: preset bundle linkage, auto view-switch on upload, Step1 thumbnail preview, click-to-locate, dynamic range, 4K export, quick rotation steppers, and HUD drawer');
} finally {
  server.close();
}
