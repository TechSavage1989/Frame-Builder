'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { safeFilename, fileFilters, windowPreferences } = require('../app/desktop-policy.cjs');
const root = path.resolve(__dirname, '..');
const { EventEmitter } = require('node:events');

test('export filenames cannot supply a destination path', () => {
  assert.equal(safeFilename('../../panel.stl'), 'panel.stl');
  assert.equal(safeFilename('C:\\elsewhere\\panel.3mf'), 'panel.3mf');
  assert.equal(safeFilename('frame<>:"|?*.zip'), 'frame_______.zip');
  assert.equal(safeFilename(''), 'Canvas_Frame_Export.zip');
  for (const ext of ['stl', 'step', '3mf', 'zip']) assert.equal(fileFilters('part.' + ext)[0].extensions[0], ext);
});

test('viewer windows do not expose Node or disable isolation', () => {
  const p = windowPreferences('preload.cjs');
  assert.equal(p.nodeIntegration, false);
  assert.equal(p.contextIsolation, true);
  assert.equal(p.sandbox, true);
  assert.equal(p.webSecurity, true);
});

test('the complete offline builder is packaged with the desktop app', () => {
  const html = fs.readFileSync(path.join(root, 'app/index.html'), 'utf8');
  assert(html.includes('V347_FULL_HEIGHT_FRAME'));
  assert(html.includes('V3510_ADAPTIVE_EASEL_CLOSED_PROFILES'));
  for (const control of ['easelThickness','matchEaselBase','sectionMode','twoPartDirection','hangerThickness', 'sacrificialTabThickness', 'sacrificialTabWidth']) assert(html.includes('id="' + control + '"'));
  assert(html.includes("op:'cylinder'"));
  assert(html.includes("op:'curve_prism'"));
  assert(html.includes('thin_base_local_reinforcement'));
  assert(html.includes('shared_upper_centerline'));
  assert(html.includes('wallHangerInsetsByOrientation'));
  assert(html.includes('<option value="borderless">Front Snap Borderless</option>'));
  assert(html.includes('id="borderlessSettings"'));
  assert(html.includes('V347_LATCH_SEATING_ALLOWANCE'));
  assert(html.includes('id="displayOrientation"'));
  assert(html.includes('function standMountPose('));
  assert(html.includes('function compactHanger('));
  assert(html.includes('const BambuTemplate'));
  assert(html.includes('id="bambuTemplateFile"'));
  assert(html.includes('<option value="project" selected>Multi-plate'));
  assert(html.includes('const BambuBaseProject'));
  assert(html.includes('Bambu Lab X1 Carbon 0.4 nozzle'));
  assert(html.includes('id="resetBambuTemplate"'));
  assert(!html.includes("filament_colour:['#00AE42']"));
  assert(html.includes('const FrameV3'));
  assert(html.includes('function downloadStepSet'));
  assert(html.includes('function downloadArranged'));
  assert(html.includes('Choose where to save the exported file.'));
  assert(!/\b(?:src|href)=["']https?:\/\//i.test(html));
  assert(!html.includes('id="structure"'));
  for (const [, source] of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(source);
});

test('all desktop JavaScript parses', () => {
  for (const name of ['main.cjs', 'preload.cjs', 'desktop-policy.cjs', 'desktop-ui.js', 'update-core.cjs', 'update-check.cjs', 'update-download.cjs']) {
    new vm.Script(fs.readFileSync(path.join(root, 'app', name), 'utf8'), { filename: name });
  }
});

test('desktop exports use the native chooser and report completion or cancellation', async () => {
  const session = new EventEmitter();
  session.setPermissionRequestHandler = handler => { session.permissions = handler; };
  session.setPermissionCheckHandler = handler => { session.check = handler; };
  session.webRequest = { onBeforeRequest(filter, handler) { session.network = { filter, handler }; } };
  const app = Object.assign(new EventEmitter(), { setName() {}, setPath() {}, setAppUserModelId() {},
    whenReady: () => Promise.resolve(), getPath: () => '/test/Downloads', getVersion: () => '3.51.7', isPackaged:false, quit() {} });
  const windows = [];
  class Window extends EventEmitter {
    constructor(options) {
      super(); this.options = options; this.sent = [];
      this.webContents = Object.assign(new EventEmitter(), {
        setWindowOpenHandler: handler => { this.open = handler; },
        isDestroyed: () => false,
        send: (name, value) => this.sent.push({ name, value })
      });
      windows.push(this);
    }
    loadFile(file) { this.file = file; }
    show() {}
    static getAllWindows() { return windows; }
  }
  const electron = { ipcMain:{handle(){}}, app, BrowserWindow: Window, session: { defaultSession: session },
    Menu: { buildFromTemplate: x => x, setApplicationMenu() {} }, dialog: { showErrorBox() {} } };
  const context = { setInterval:()=>0,clearInterval:()=>{}, __dirname: path.join(root, 'app'), process: { platform: 'win32' },
    require: id => id === 'electron' ? electron : id.startsWith('./') ? require(path.join(root,'app',id)) : require(id) };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'app/main.cjs'), 'utf8'), context);
  await new Promise(resolve => setImmediate(resolve));
  const window = windows[0];
  assert.equal(window.file, path.join(root, 'app/index.html'));
  assert.equal(window.open({ url: 'about:blank' }).action, 'allow');
  assert.equal(window.open({ url: 'https://example.com' }).action, 'deny');
  assert.equal(window.open({ url: 'file:///elsewhere/page.html' }).action, 'deny');

  function download(filename, savePath) {
    const item = Object.assign(new EventEmitter(), { getFilename: () => filename,
      getSavePath: () => savePath, setSaveDialogOptions: options => { item.options = options; } });
    session.emit('will-download', {}, item, window.webContents);
    return item;
  }
  const item = download('Frame_Joint_Test.3mf', '/chosen/Frame_Joint_Test.3mf');
  assert.equal(item.options.defaultPath, path.join('/test/Downloads', 'Frame_Joint_Test.3mf'));
  assert.equal(item.options.filters[0].extensions[0], '3mf');
  item.emit('done', {}, 'completed');
  assert.equal(window.sent.at(-1).value.state, 'completed');
  assert.equal(window.sent.at(-1).value.filename, 'Frame_Joint_Test.3mf');
  const cancelled = download('Frame.step', '');
  assert.equal(cancelled.options.defaultPath, '/chosen/Frame.step');
  cancelled.emit('done', {}, 'cancelled');
  assert.equal(window.sent.at(-1).value.state, 'cancelled');
});
