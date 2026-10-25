'use strict';
const { execFile } = require('node:child_process');
function verifyWindowsIdentity(file, expectedVersion) {
  if (process.platform !== 'win32') return Promise.resolve();
  const command = "$ErrorActionPreference='Stop'; $v=(Get-Item -LiteralPath $env:FRAME_VERIFY_FILE).VersionInfo; if($v.ProductName -cne 'Frame Builder'){throw 'Wrong executable product'}; if($v.ProductVersion -notmatch ('^'+[regex]::Escape($env:FRAME_VERIFY_VERSION)+'(?:\\.0)?$')){throw 'Wrong executable version'}";
  return new Promise((resolve, reject) => {
    execFile('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command],
      { env: { ...process.env, FRAME_VERIFY_FILE: file, FRAME_VERIFY_VERSION: expectedVersion }, windowsHide: true, timeout: 20000 },
      error => error ? reject(Error('Update Windows identity/version verification failed')) : resolve());
  });
}
module.exports = { verifyWindowsIdentity };
