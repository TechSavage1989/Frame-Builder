'use strict';
const { app, BrowserWindow, Menu, session, dialog } = require('electron');
const path = require('node:path');
const {ipcMain}=require('electron');
const {UpdateCheck}=require('./update-check.cjs');
const {downloadVerified}=require('./update-download.cjs');
const fs=require('node:fs');const crypto=require('node:crypto');const {spawn}=require('node:child_process');
const { safeFilename, fileFilters, windowPreferences } = require('./desktop-policy.cjs');

const APP_ID = 'com.techsavage3d.canvasframe';
const preload = path.join(__dirname, 'preload.cjs');
let mainWindow;
let lastExportDirectory;
let updater;let verifiedUpdate;let updateTimer;let lastFocusCheck=0;
function reportUpdate(s){
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('frame:update-status', s);
}
async function hashFile(file) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
function initUpdater(){updater=new UpdateCheck({installed:app.getVersion(),onState:reportUpdate});
 ipcMain.handle('frame:check-update',()=>updater.check(true));
 ipcMain.handle('frame:open-release', async (_e, url) => {
  try {
    const target = new URL(url);
    if (target.origin !== 'https://github.com' ||
        !/^\/TechSavage1989\/Frame-Builder\/releases\/tag\/v\d+\.\d+\.\d+$/.test(target.pathname) ||
        target.search || target.hash) return false;
    await require('electron').shell.openExternal(target.href);
    return true;
  } catch (_) { return false; }
});
 ipcMain.handle('frame:download-update',async()=>{
  const state=updater.last;if(state?.state!=='available')throw Error('No verified release available');
  const info=state.info;const storage=path.join(app.getPath('userData'),'updates');
  const file=await downloadVerified(info.asset,storage,percent=>reportUpdate({state:'downloading',percent}));
  verifiedUpdate={file,asset:info.asset,version:info.latestVersion};reportUpdate({state:'downloaded',version:info.latestVersion});return true;
 });
 ipcMain.handle('frame:install-update',async()=>{
  if(!verifiedUpdate)throw Error('Download and verify an update first');
  let busy=true;try{busy=await mainWindow.webContents.executeJavaScript('typeof exportBusy !== "undefined" && exportBusy',true)}catch{}
  if(busy)throw Error('Finish active exports before restarting');
  const result=await dialog.showMessageBox(mainWindow,{type:'warning',buttons:['Cancel','Install and restart'],defaultId:0,cancelId:0,message:'Save your work before installing',detail:'Frame Builder will close and restart after installing the verified download. One previous version is kept for rollback.'});
  if(result.response!==1)return false;
  if(process.platform!=='win32')throw Error('The installer is available only on Windows');
  const exe=path.resolve(process.env.PORTABLE_EXECUTABLE_FILE||process.execPath);
  const storage=path.join(app.getPath('userData'),'updates');fs.mkdirSync(storage,{recursive:true});
  const health=path.join(storage,'health-'+crypto.randomBytes(12).toString('hex')+'.txt');const token=crypto.randomBytes(24).toString('hex');
  const script=path.join(storage,'install-helper.ps1');fs.writeFileSync(script,fs.readFileSync(path.join(__dirname,'update-install.ps1')),{mode:0o600});const log=path.join(storage,'install.log');
  const oldHash=await hashFile(exe);
  const args=['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script,'-Target',exe,'-Payload',verifiedUpdate.file,'-Sha256',verifiedUpdate.asset.sha256,'-ExpectedVersion',verifiedUpdate.version,'-OldSha256',oldHash,'-HealthFile',health,'-HealthToken',token,'-ParentPid',String(process.pid),'-LogFile',log];
  const proc=spawn('powershell.exe',args,{detached:true,stdio:'ignore',windowsHide:true});proc.unref();
  app.quit();return true;
 });
 updateTimer=setInterval(()=>{if(mainWindow&&!mainWindow.isDestroyed()&&mainWindow.isFocused())updater.check(false)},5*60*1000);
 if(app.isPackaged)updater.check(false);
}
app.on('before-quit',()=>{if(updateTimer)clearInterval(updateTimer);});

app.setName('Frame Builder');
// Preserve the prior Electron user-data location across the application rename.
app.setPath('userData',path.join(app.getPath('appData'),'Canvas Frame Builder'));
app.setAppUserModelId(APP_ID);

function sendExportStatus(contents, status) {
  if (contents && !contents.isDestroyed()) contents.send('canvas-frame:export-status', status);
}

function attachNavigationRules(contents) {
  contents.on('will-navigate', event => event.preventDefault());
  contents.on('will-redirect', event => event.preventDefault());
  contents.on('will-attach-webview', event => event.preventDefault());
  contents.setWindowOpenHandler(({ url }) => {
    if (url !== 'about:blank') return { action: 'deny' };
    return { action: 'allow', overrideBrowserWindowOptions: {
      title: 'Canvas Frame | 3D viewer', width: 1100, height: 800,
      backgroundColor: '#eef2f4', autoHideMenuBar: true,
      icon: path.join(__dirname, '../assets/icon.png'),
      webPreferences: windowPreferences(preload)
    } };
  });
  contents.on('did-create-window', child => {
    attachNavigationRules(child.webContents);
    child.setMenu(null);
  });
}

function configureDownloads() {
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.webRequest.onBeforeRequest(
    { urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] },
    (_details, callback) => callback({ cancel: true })
  );
  session.defaultSession.on('will-download', (_event, item, contents) => {
    const filename = safeFilename(item.getFilename());
    item.setSaveDialogOptions({
      title: 'Save frame export',
      defaultPath: path.join(lastExportDirectory || app.getPath('downloads'), filename),
      filters: fileFilters(filename)
    });
    item.once('done', (_event, state) => {
      if (state === 'completed') {
        lastExportDirectory = path.dirname(item.getSavePath());
        sendExportStatus(contents, { state, filename: path.basename(item.getSavePath()) });
      } else {
        sendExportStatus(contents, { state: state === 'cancelled' ? 'cancelled' : 'failed', filename });
      }
    });
  });
}

// The portable launcher may forward startup arguments differently from the
// unpacked EXE. Accept a health request by environment variable or CLI.
// Only a genuinely visible application window can acknowledge success.
let windowHealthWritten=false;
function writeWindowHealth() {
  if (windowHealthWritten || !mainWindow || mainWindow.isDestroyed()) return;
  const ix=process.argv.indexOf('--frame-update-health-file');
  const jx=process.argv.indexOf('--frame-update-health-token');
  const rawFile=process.env.FRAME_BUILDER_HEALTH_FILE || (ix>=0?process.argv[ix+1]:null);
  const token=process.env.FRAME_BUILDER_HEALTH_TOKEN || (jx>=0?process.argv[jx+1]:null);
  if (!rawFile || !token || !mainWindow.isVisible()) return;
  const file=path.resolve(rawFile),storage=path.resolve(app.getPath('userData'),'updates');
  if (!file.startsWith(storage+path.sep) ||
      !/^health-[a-f0-9]{24}\.txt$/.test(path.basename(file)) ||
      !/^[a-f0-9]{48}$/.test(token)) return;
  try {
    fs.writeFileSync(file, JSON.stringify({token,version:app.getVersion(),
      pid:process.pid,windowVisible:true}),{flag:'wx',mode:0o600});
    windowHealthWritten=true;
  } catch (_) { /* Install helper owns timeout and rollback. */ }
}
function createWindow() {
  windowHealthWritten=false;
  mainWindow = new BrowserWindow({
    title: 'Frame Builder', width: 1440, height: 960, minWidth: 760, minHeight: 600,
    backgroundColor: '#eef2f4', show: false,
    icon: path.join(__dirname, '../assets/icon.png'),
    webPreferences: windowPreferences(preload)
  });
  attachNavigationRules(mainWindow.webContents);
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    writeWindowHealth();
  });
  mainWindow.on('focus', () => {
    const now = Date.now();
    if (updater && now - updater.lastAt >= 2 * 60 * 1000 &&
        now - lastFocusCheck >= 2 * 60 * 1000) {
      lastFocusCheck = now;
      updater.check(false);
    }
  });
  mainWindow.on('closed', () => { mainWindow = null; });
  mainWindow.webContents.on('did-finish-load', () => {
    // Virtualized Windows sessions may not emit ready-to-show after a successful
    // page load; show the actual window before checking its health receipt.
    if (!mainWindow.isVisible()) mainWindow.show();
    writeWindowHealth();
    if (updater?.last) reportUpdate(updater.last);
  });
  mainWindow.webContents.on('did-fail-load', (_event, code, description) => {
    if (code === -3) return;
    dialog.showErrorBox('Canvas Frame Builder', 'The application could not load. ' + description);
  });
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(() => {
  configureDownloads();
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'File', submenu: [{ role: 'close' }, { role: 'quit' }] },
    { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' },
      { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: 'Help', submenu: [{ label: 'Check for updates', click:()=>updater?.check(true) }] },
    { label: 'View', submenu: [{ role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
      { type: 'separator' }, { role: 'togglefullscreen' }] }
  ]));
  createWindow();
  initUpdater();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
