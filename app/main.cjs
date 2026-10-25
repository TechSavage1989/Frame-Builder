'use strict';
const { app, BrowserWindow, Menu, session, dialog, ipcMain, net, screen } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { UpdateCheck } = require('./update-check.cjs');
const { bindUpdateSchedule } = require('./update-scheduler.cjs');
const { downloadVerified } = require('./update-download.cjs');
const { verifyWindowsIdentity } = require('./update-windows.cjs');
const { finishInstallJobs, hashFile } = require('./update-housekeeping.cjs');
const { safeFilename, fileFilters, windowPreferences } = require('./desktop-policy.cjs');
const { APP_ID, releaseUrl } = require('./update-core.cjs');
const preload = path.join(__dirname, 'preload.cjs');
let mainWindow, updater, verifiedUpdate, stopSchedule, housekeepingTimer;
let lastExportDirectory, updatePhase = 'idle', downloadPromise, installPromise;
let presentation = null, healthTimer = null;
const activeDownloads = new Set();
app.setName('Frame Builder');
app.setPath('userData', path.join(app.getPath('appData'), 'Canvas Frame Builder'));
app.setAppUserModelId(APP_ID);
const storage = () => path.join(app.getPath('userData'), 'updates');
function reportUpdate(state) {
  presentation = state;
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('frame:update-status', state);
}
function reportCheck(state) {
  if (updatePhase === 'idle') reportUpdate(state);
}
async function operationBusy() {
  if (activeDownloads.size || !mainWindow || mainWindow.isDestroyed()) return true;
  try {
    return await mainWindow.webContents.executeJavaScript(
      "(typeof exportBusy !== 'undefined' && exportBusy) || !window.CanvasFrameViewer || CanvasFrameViewer.getState().status !== 'ready'", true);
  } catch { return true; }
}
async function downloadUpdate() {
  if (downloadPromise) return downloadPromise;
  if (updatePhase === 'installing') throw Error('Installation is already being prepared');
  const info = updater?.cached?.info;
  if (!info?.available) throw Error('Check online for an available release first');
  updatePhase = 'downloading';
  downloadPromise = (async () => {
    try {
      const file = await downloadVerified(info.asset, storage(), percent => reportUpdate({ state: 'downloading', percent }));
      await verifyWindowsIdentity(file, info.latestVersion);
      verifiedUpdate = { file, asset: info.asset, version: info.latestVersion };
      updatePhase = 'downloaded';
      reportUpdate({ state: 'downloaded', version: info.latestVersion, installedVersion: app.getVersion() });
      return true;
    } catch (error) {
      updatePhase = 'idle';
      reportUpdate({ state: 'download-error', message: error.message, info });
      throw error;
    } finally { downloadPromise = null; }
  })();
  return downloadPromise;
}
async function waitForHelper(file, id, child, resultFile) {
  const until = Date.now() + 45000;
  let spawnError;
  child.once('error', error => { spawnError = error; });
  while (Date.now() < until) {
    if (spawnError) throw Error('Could not start the installer: ' + spawnError.message);
    if (fs.existsSync(resultFile)) {
      const result = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
      if (result.id === id && result.state !== 'success') throw Error(result.message);
    }
    if (fs.existsSync(file)) {
      const ready = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (ready.id === id && ready.helperPid === child.pid) return;
    }
    if (child.exitCode !== null) throw Error('Installer exited before preparation completed');
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw Error('Installer preparation timed out. Frame Builder remains open.');
}
async function installUpdate() {
  if (installPromise) return installPromise;
  if (!verifiedUpdate || updatePhase !== 'downloaded') throw Error('Download and verify an update first');
  installPromise = (async () => {
    let job;
    try {
      if (await operationBusy()) throw Error('Finish the active model or export before restarting');
      const result = await dialog.showMessageBox(mainWindow, {
        type: 'warning', buttons: ['Cancel', 'Install and restart'], defaultId: 0, cancelId: 0,
        message: 'Save your work before installing.',
      });
      if (result.response !== 1) return false;
      if (process.platform !== 'win32' || !app.isPackaged || !process.env.PORTABLE_EXECUTABLE_FILE) throw Error('Use the packaged Windows portable application to install updates');
      if (await operationBusy()) throw Error('Finish the active model or export before restarting');
      updatePhase = 'installing'; reportUpdate({ state: 'installing' });
      const target = path.resolve(process.env.PORTABLE_EXECUTABLE_FILE);
      const folder = storage(); fs.mkdirSync(folder, { recursive: true });
      const id = crypto.randomBytes(12).toString('hex');
      job = { appId: APP_ID, id, target, storage: folder, payload: verifiedUpdate.file,
        version: verifiedUpdate.version, sha256: verifiedUpdate.asset.sha256,
        oldSha256: await hashFile(target), healthToken: crypto.randomBytes(24).toString('hex'),
        parentPid: process.pid, stage: path.join(path.dirname(target), '.frame-builder-update-' + id) };
      const jobFile = path.join(folder, 'install-' + id + '.json');
      const helper = path.join(folder, 'helper-' + id + '.ps1');
      const log = path.join(folder, 'install.log');
      if (fs.existsSync(log) && fs.statSync(log).size > 1000000) fs.writeFileSync(log, '');
      fs.writeFileSync(jobFile, JSON.stringify(job), { mode: 0o600, flag: 'wx' });
      fs.copyFileSync(path.join(__dirname, 'update-install.ps1'), helper, fs.constants.COPYFILE_EXCL);
      const child = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', helper, '-JobFile', jobFile],
        { detached: true, stdio: 'ignore', windowsHide: true });
      child.unref();
      await waitForHelper(path.join(folder, 'ready-' + id + '.json'), id, child, path.join(folder, 'result-' + id + '.json'));
      if (await operationBusy()) throw Error('A model or export started during preparation. Finish it before restarting.');
      app.quit();
      return true;
    } catch (error) {
      if (job) fs.writeFileSync(path.join(job.storage, 'abort-' + job.id), '');
      updatePhase = 'downloaded';
      reportUpdate({ state: 'install-error', message: error.message, version: verifiedUpdate?.version, retry: true });
      throw error;
    } finally { installPromise = null; }
  })();
  return installPromise;
}
function registerUpdater() {
  updater = new UpdateCheck({ installed: app.getVersion(), onState: reportCheck, cacheFile: path.join(storage(), 'check-cache.json') });
  const local = (event, action) => {
    if (event.sender !== mainWindow?.webContents) throw Error('Updates can only be controlled from the main window');
    return action();
  };
  ipcMain.handle('frame:check-update', event => local(event, () => updater.check(true)));
  ipcMain.handle('frame:download-update', event => local(event, downloadUpdate));
  ipcMain.handle('frame:install-update', event => local(event, installUpdate));
  ipcMain.handle('frame:get-update-status', event => local(event, () => presentation));
  ipcMain.handle('frame:open-release', (event, url) => local(event, async () => {
    const tag = typeof url === 'string' ? url.split('/').pop() : '';
    if (!/^v\d+\.\d+\.\d+$/.test(tag) || !releaseUrl(url, tag)) return false;
    await require('electron').shell.openExternal(url); return true;
  }));
}
function sendExportStatus(contents, status) {
  if (contents && !contents.isDestroyed()) contents.send('canvas-frame:export-status', status);
}
function attachNavigationRules(contents) {
  contents.on('will-navigate', event => event.preventDefault());
  contents.on('will-redirect', event => event.preventDefault());
  contents.on('will-attach-webview', event => event.preventDefault());
  contents.setWindowOpenHandler(({ url }) => url !== 'about:blank' ? { action: 'deny' } : {
    action: 'allow', overrideBrowserWindowOptions: {
      title: 'Canvas Frame | 3D viewer', width: 1100, height: 800,
      backgroundColor: '#eef2f4', autoHideMenuBar: true, icon: path.join(__dirname, '../assets/icon.png'),
      webPreferences: windowPreferences(preload),
    },
  });
  contents.on('did-create-window', child => { attachNavigationRules(child.webContents); child.setMenu(null); });
}
function configureDownloads() {
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (_details, callback) => callback({ cancel: true }));
  session.defaultSession.on('will-download', (_event, item, contents) => {
    activeDownloads.add(item);
    const filename = safeFilename(item.getFilename());
    item.setSaveDialogOptions({ title: 'Save frame export', defaultPath: path.join(lastExportDirectory || app.getPath('downloads'), filename), filters: fileFilters(filename) });
    item.once('done', (_event, state) => {
      activeDownloads.delete(item);
      if (state === 'completed') {
        lastExportDirectory = path.dirname(item.getSavePath());
        sendExportStatus(contents, { state, filename: path.basename(item.getSavePath()) });
      } else sendExportStatus(contents, { state: state === 'cancelled' ? 'cancelled' : 'failed', filename });
    });
  });
}
async function writeWindowHealth() {
  if (!mainWindow || mainWindow.isDestroyed() || !mainWindow.isVisible()) return false;
  const rawFile = process.env.FRAME_BUILDER_HEALTH_FILE;
  const token = process.env.FRAME_BUILDER_HEALTH_TOKEN;
  if (!rawFile || !token || !/^[a-f0-9]{48}$/.test(token)) return false;
  const file = path.resolve(rawFile);
  if (path.dirname(file) !== path.resolve(storage()) || !/^health-[a-f0-9]{24}\.txt$/.test(path.basename(file))) return false;
  try {
    const ready = await mainWindow.webContents.executeJavaScript(
      "Boolean(document.readyState === 'complete' && window.CanvasFrameViewer && CanvasFrameViewer.getState().status === 'ready' && document.getElementById('frameStyle'))", true);
    if (!ready || !mainWindow || mainWindow.isDestroyed() || !mainWindow.isVisible()) return false;
    fs.writeFileSync(file, JSON.stringify({ token, version: app.getVersion(), pid: process.pid, windowVisible: true, rendererReady: true }), { flag: 'wx', mode: 0o600 });
    return true;
  } catch (error) { return error.code === 'EEXIST'; }
}
function loadWindowState() {
  try {
    const s = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'window-state.json'), 'utf8'));
    if (!Number.isFinite(s.width) || !Number.isFinite(s.height) || s.width < 760 || s.height < 600) return {};
    const intersects = screen.getAllDisplays().some(d => s.x < d.workArea.x + d.workArea.width && s.x + s.width > d.workArea.x && s.y < d.workArea.y + d.workArea.height && s.y + s.height > d.workArea.y);
    return intersects ? s : { width: Math.min(s.width, 2000), height: Math.min(s.height, 1400) };
  } catch { return {}; }
}
function createWindow() {
  const saved = loadWindowState();
  mainWindow = new BrowserWindow({ title: 'Frame Builder', width: 1440, height: 960, minWidth: 760, minHeight: 600,
    ...saved, backgroundColor: '#eef2f4', show: false, icon: path.join(__dirname, '../assets/icon.png'), webPreferences: windowPreferences(preload) });
  attachNavigationRules(mainWindow.webContents);
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.on('close', () => {
    if (mainWindow.isMinimized()) return;
    try {
      fs.mkdirSync(app.getPath('userData'), { recursive: true });
      fs.writeFileSync(path.join(app.getPath('userData'), 'window-state.json'), JSON.stringify(mainWindow.getNormalBounds()));
    } catch {}
  });
  mainWindow.on('closed', () => { mainWindow = null; clearInterval(healthTimer); });
  mainWindow.webContents.on('did-finish-load', () => {
    if (!mainWindow.isVisible()) mainWindow.show();
    if (presentation) reportUpdate(presentation);
    if (process.env.FRAME_BUILDER_HEALTH_FILE) {
      healthTimer = setInterval(async () => { if (await writeWindowHealth()) clearInterval(healthTimer); }, 500);
    }
  });
  mainWindow.webContents.on('did-fail-load', (_event, code, description) => {
    if (code !== -3) dialog.showErrorBox('Frame Builder', 'The application could not load. ' + description);
  });
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  if (app.isPackaged) stopSchedule = bindUpdateSchedule({ window: mainWindow, checker: updater, online: () => net.isOnline() });
}
async function housekeeping() {
  const status = await finishInstallJobs(storage());
  if (status && updatePhase === 'idle') reportUpdate(status);
}
const primaryInstance = app.requestSingleInstanceLock();
if (!primaryInstance) app.quit();
app.on('second-instance', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show(); mainWindow.focus();
  }
});
if (primaryInstance) app.whenReady().then(() => {
  configureDownloads(); registerUpdater();
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'File', submenu: [{ role: 'close' }, { role: 'quit' }] },
    { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: 'Help', submenu: [{ label: 'Check for updates', click: () => updater.check(true) }] },
    { label: 'View', submenu: [{ role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }] },
  ]));
  createWindow();
  housekeeping().catch(() => {});
  housekeepingTimer = setInterval(() => housekeeping().catch(() => {}), 2500);
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('before-quit', () => { stopSchedule?.(); clearInterval(healthTimer); clearInterval(housekeepingTimer); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
// Main-process-only integration hooks. Nothing here is exposed to web content.
module.exports = { getWindow: () => mainWindow, getUpdater: () => updater, downloadUpdate, installUpdate, operationBusy, writeWindowHealth };
