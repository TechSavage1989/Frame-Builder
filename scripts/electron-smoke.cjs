'use strict';
// Run only as a developer check in Electron, not as the packaged entry point.
const { app, session, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const out = path.resolve(__dirname, '../validation/runtime');
fs.mkdirSync(out, { recursive: true });
fs.mkdirSync(path.join(out, 'profile'), { recursive: true });
app.setPath('userData', path.join(out, 'profile'));
const downloads = [];
const errors = [];
let main;
const timeout = setTimeout(() => finish(new Error('Desktop check timed out')), 180000);

function finish(error) {
  clearTimeout(timeout);
  if (error) {
    console.error(error.stack || String(error));
    fs.writeFileSync(path.join(out, 'failure.json'), JSON.stringify({ error: String(error), errors }, null, 2));
    app.exit(1);
  } else app.exit(0);
}

async function waitFor(predicate, label, duration = 90000) {
  const until = Date.now() + duration;
  while (Date.now() < until) {
    if (await predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error('Timed out: ' + label);
}

async function run(window) {
  const contents = window.webContents;
  const evaluate = code => contents.executeJavaScript(code, true);
  await waitFor(() => evaluate("Boolean(window.CanvasFrameViewer && CanvasFrameViewer.getState().status === 'ready')"), '3D preview');
  const initial = await evaluate('CanvasFrameViewer.getState()');
  assert.equal(initial.params.structure, 'reinforced');
  assert.equal(initial.params.d, 8);
  assert.equal(await evaluate('typeof require'), 'undefined');
  assert.equal(await evaluate('typeof window.CanvasFrameDesktop.onExportStatus'), 'function');
  console.log('Desktop preview ready; reinforced frame; isolated renderer.');

  await evaluate("document.getElementById('detachViewer').click()");
  await waitFor(() => evaluate("CanvasFrameWorkspace.getState().mode === 'detached'"), 'detached viewer', 10000);
  const child = BrowserWindow.getAllWindows().find(w => w !== window);
  assert(child && !child.isDestroyed());
  fs.writeFileSync(path.join(out, 'detached-viewer.png'), (await child.webContents.capturePage()).toPNG());
  await evaluate("document.getElementById('returnViewer').click()");
  await waitFor(() => evaluate("CanvasFrameWorkspace.getState().mode === 'embedded'"), 'return viewer', 10000);
  console.log('Detached viewer and return passed.');

  session.defaultSession.on('will-download', (_event, item) => {
    item.setSavePath(path.join(out, path.basename(item.getFilename())));
    item.once('done', (_event, state) => downloads.push({ file: item.getSavePath(), state }));
  });
  async function exportFile(code, extension) {
    const before = downloads.length;
    await evaluate(code);
    await waitFor(() => downloads.length > before, extension + ' export');
    const result = downloads.at(-1);
    assert.equal(result.state, 'completed');
    assert.equal(path.extname(result.file).toLowerCase(), extension);
    assert(fs.statSync(result.file).size > 100);
    console.log(extension + ' saved through the native download handler.');
    return result.file;
  }
  const stl = await exportFile("document.getElementById('partSelect').value='0'; document.getElementById('partSelect').dispatchEvent(new Event('change')); document.getElementById('dlpart').click()", '.stl');
  const stlBytes = fs.readFileSync(stl);
  assert.equal(stlBytes.length, 84 + 50 * stlBytes.readUInt32LE(80));
  const step = await exportFile("document.getElementById('downloadSTEPPart').click()", '.step');
  assert(fs.readFileSync(step, 'utf8').startsWith('ISO-10303-21;'));
  const mf = await exportFile("document.getElementById('exportFormat').value='3mf'; document.getElementById('exportFormat').dispatchEvent(new Event('change')); document.getElementById('frameJointTest').click()", '.3mf');
  assert.equal(fs.readFileSync(mf).readUInt32LE(0), 0x04034b50);
  await waitFor(() => evaluate("document.getElementById('exportStatus').textContent.startsWith('Saved:')"), 'saved status', 5000);
  fs.writeFileSync(path.join(out, 'builder.png'), (await contents.capturePage()).toPNG());
  const report = { version: '3.42.0', runtime: process.versions.electron, tested_platform: process.platform,
    viewer_ready: true, detach_and_return: true, native_export_handler: true,
    renderer_node_access: false, reinforced_only: true,
    exports: downloads.map(d => ({ file: path.basename(d.file), bytes: fs.statSync(d.file).size })),
    windows_launch_tested: false, errors };
  assert.equal(errors.length, 0, JSON.stringify(errors));
  fs.writeFileSync(path.resolve(out, '../Desktop_Runtime_Checks.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
  finish();
}

app.on('browser-window-created', (_event, window) => {
  if (main) return;
  main = window;
  window.webContents.on('render-process-gone', (_event, details) => finish(new Error(JSON.stringify(details))));
  window.webContents.on('console-message', (...args) => {
    const details = args[1];
    const level = typeof details === 'object' ? details.level : args[1];
    const message = typeof details === 'object' ? details.message : args[2];
    if ((level === 'error' || level === 3) && !/GPU|WebGL|SharedImage|GL_INVALID|ContextResult/.test(message)) errors.push(message);
  });
  window.webContents.once('did-finish-load', () => run(window).catch(finish));
});
require('../app/main.cjs');
