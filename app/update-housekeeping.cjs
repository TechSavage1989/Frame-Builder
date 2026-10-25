'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
async function hashFile(file) {
  const hash = crypto.createHash('sha256');
  for await (const piece of fs.createReadStream(file)) hash.update(piece);
  return hash.digest('hex');
}
function isRunning(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; }
}
async function finishInstallJobs(storage) {
  fs.mkdirSync(storage, { recursive: true });
  let message = null;
  for (const name of fs.readdirSync(storage)) {
    if (!/^install-[a-f0-9]{24}\.json$/.test(name)) continue;
    const jobFile = path.join(storage, name);
    try {
      const job = JSON.parse(fs.readFileSync(jobFile, 'utf8'));
      const token = name.slice(8, -5);
      if (job.appId !== 'com.techsavage3d.canvasframe' || job.id !== token || path.resolve(job.storage) !== path.resolve(storage)) continue;
      const statusFile = path.join(storage, 'result-' + token + '.json');
      if (!fs.existsSync(statusFile)) continue;
      const result = JSON.parse(fs.readFileSync(statusFile, 'utf8'));
      if (result.id !== token || isRunning(result.helperPid)) continue;
      const stage = path.join(path.dirname(job.target), '.frame-builder-update-' + token);
      if (path.resolve(job.stage) !== path.resolve(stage)) continue;
      if (result.state === 'success') {
        if (await hashFile(job.target) !== job.sha256) continue;
        const prior = path.join(stage, 'previous.exe');
        if (fs.existsSync(prior)) {
          if (await hashFile(prior) !== job.oldSha256) continue;
          const pending = path.join(storage, 'rollback.pending.exe');
          fs.copyFileSync(prior, pending);
          if (await hashFile(pending) !== job.oldSha256) throw Error('Rollback copy verification failed');
          fs.renameSync(pending, path.join(storage, 'rollback.exe'));
        }
        // Only the health-confirmed executable is eligible for cleanup.
        message = { state: 'installed', version: job.version };
      } else if (result.state === 'rolled-back' || result.state === 'failed') {
        if (await hashFile(job.target) !== job.oldSha256) continue;
        message = { state: 'install-error', message: result.message || 'The update failed. The previous version was restored.' };
      } else continue; // Preserve failed transactions requiring manual recovery.
      fs.rmSync(stage, { recursive: true, force: true });
      const payload = path.join(storage, 'update-' + job.sha256 + '.exe');
      if (result.state === 'success' && job.payload === payload) fs.rmSync(payload, { force: true });
      for (const owned of [jobFile, statusFile, path.join(storage, 'ready-' + token + '.json'), path.join(storage, 'health-' + token + '.txt'), path.join(storage, 'helper-' + token + '.ps1'), path.join(storage, 'abort-' + token)]) {
        fs.rmSync(owned, { force: true });
      }
    } catch { /* Retain evidence if an incomplete transaction cannot be safely cleaned. */ }
  }
  // Only names owned by this updater, never user exports or arbitrary EXEs.
  const cutoff = Date.now() - 7 * 86400000;
  for (const name of fs.readdirSync(storage)) {
    if (!/^update-[a-f0-9]{64}\.exe(?:\.pending-[a-f0-9]{12})?$/.test(name)) continue;
    const file = path.join(storage, name);
    if (fs.statSync(file).mtimeMs < cutoff) fs.rmSync(file, { force: true });
  }
  return message;
}
module.exports = { finishInstallJobs, hashFile, isRunning };
