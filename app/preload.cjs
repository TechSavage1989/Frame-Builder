'use strict';
const { contextBridge, ipcRenderer } = require('electron');

const updateAPI={
 checkUpdate:()=>ipcRenderer.invoke('frame:check-update'),
 downloadUpdate:()=>ipcRenderer.invoke('frame:download-update'),
 installUpdate:()=>ipcRenderer.invoke('frame:install-update'),
 openReleaseInfo:url=>ipcRenderer.invoke('frame:open-release',url),
 onUpdateStatus:callback=>{const fn=(_e,s)=>callback(s);ipcRenderer.on('frame:update-status',fn);return ()=>ipcRenderer.removeListener('frame:update-status',fn)}
};

contextBridge.exposeInMainWorld('CanvasFrameDesktop', Object.freeze({
  checkUpdate: updateAPI.checkUpdate,
  downloadUpdate: updateAPI.downloadUpdate,
  installUpdate: updateAPI.installUpdate,
  openReleaseInfo: updateAPI.openReleaseInfo,
  onUpdateStatus: updateAPI.onUpdateStatus,
  onExportStatus(callback) {
    if (typeof callback !== 'function') throw new TypeError('A callback is required.');
    const listener = (_event, value) => {
      if (!value || !['completed', 'cancelled', 'failed'].includes(value.state)) return;
      callback({ state: value.state, filename: String(value.filename || '') });
    };
    ipcRenderer.on('canvas-frame:export-status', listener);
    return () => ipcRenderer.removeListener('canvas-frame:export-status', listener);
  }
}));
