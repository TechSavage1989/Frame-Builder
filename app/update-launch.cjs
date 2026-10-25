'use strict';
const path = require('node:path');
const fs = require('node:fs');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const execute = promisify(execFile);
// Start-Process gives the helper its own Windows lifetime. The bootstrap exits
// before the GUI closes, and no helper handle points into the portable unpack.
async function launchWindowsHelper(helper, jobFile, storage) {
  if (process.platform !== 'win32') throw Error('Windows installer required');
  const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const stem = path.basename(helper, '.ps1');
  const stdoutLog = path.join(storage, stem + '.out.log');
  const stderrLog = path.join(storage, stem + '.log');
  for (const file of [stdoutLog, stderrLog]) fs.writeFileSync(file, '', { flag: 'wx', mode: 0o600 });
  const code = `
$ErrorActionPreference='Stop'
$env:PSModulePath=[IO.Path]::Combine($PSHOME,'Modules')+[IO.Path]::PathSeparator+$env:PSModulePath
$a=@('-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',('"'+$env:FRAME_HELPER_FILE+'"'),'-JobFile',('"'+$env:FRAME_HELPER_JOB+'"'))
$p=Start-Process -FilePath $env:FRAME_HELPER_POWERSHELL -ArgumentList $a -WorkingDirectory $env:FRAME_HELPER_STORAGE -WindowStyle Hidden -RedirectStandardOutput $env:FRAME_HELPER_OUT -RedirectStandardError $env:FRAME_HELPER_ERR -PassThru
[Console]::WriteLine($p.Id)
`;
  const { stdout } = await execute(powershell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', code], {
    windowsHide: true, cwd: storage, timeout: 20000, maxBuffer: 16384, encoding: 'utf8',
    env: { ...process.env, FRAME_HELPER_FILE: helper, FRAME_HELPER_JOB: jobFile,
      FRAME_HELPER_STORAGE: storage, FRAME_HELPER_POWERSHELL: powershell,
      FRAME_HELPER_OUT: stdoutLog, FRAME_HELPER_ERR: stderrLog },
  });
  if (!/^\s*[1-9]\d*\s*$/.test(stdout)) throw Error('Windows did not return a valid installer process ID');
  const pid = Number(stdout.trim());
  if (!Number.isSafeInteger(pid)) throw Error('Invalid installer process ID');
  return { pid, helperLog: stderrLog };
}
module.exports = { launchWindowsHelper };
