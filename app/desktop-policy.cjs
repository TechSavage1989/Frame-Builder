'use strict';
const path = require('node:path');

function safeFilename(name) {
  const base = String(name || 'Canvas_Frame_Export.zip').split(/[\\/]/).pop();
  return base.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/g, '') || 'Canvas_Frame_Export.zip';
}

function fileFilters(name) {
  const ext = path.extname(name).slice(1).toLowerCase();
  const labels = { zip: 'ZIP archive', stl: 'STL model', step: 'STEP model', stp: 'STEP model',
    '3mf': '3MF print project', scad: 'OpenSCAD source', json: 'JSON settings', svg: 'SVG drawing' };
  return labels[ext] ? [{ name: labels[ext], extensions: [ext] }, { name: 'All files', extensions: ['*'] }]
    : [{ name: 'All files', extensions: ['*'] }];
}

function windowPreferences(preload) {
  return { preload, nodeIntegration: false, contextIsolation: true, sandbox: true,
    webSecurity: true, allowRunningInsecureContent: false };
}

module.exports = { safeFilename, fileFilters, windowPreferences };
