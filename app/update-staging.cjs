'use strict';
const fs = require('node:fs');
const path = require('node:path');
function stageName(id) {
  if (!/^[a-f0-9]{24}$/.test(id)) throw Error('Invalid update transaction ID');
  return '.frame-builder-update-' + id;
}
function volumeRoot(directory) {
  let current = fs.realpathSync(directory);
  const device = fs.statSync(current).dev;
  for (;;) {
    const parent = path.dirname(current);
    if (parent === current || fs.statSync(parent).dev !== device) return current;
    current = parent;
  }
}
function stagePath(target, storage, id, desktop) {
  const name = stageName(id);
  const desktopPath = desktop && fs.existsSync(desktop) ? fs.realpathSync(desktop) : null;
  const onDesktop = directory => desktopPath && (fs.realpathSync(directory) === desktopPath ||
    fs.realpathSync(directory).startsWith(desktopPath + path.sep));
  // stat follows redirected folders/junctions. Drive letters alone do not
  // establish that the replacement and its destination share a volume.
  if (fs.statSync(path.dirname(target)).dev === fs.statSync(storage).dev && !onDesktop(storage)) {
    return path.join(storage, name);
  }
  // Another-volume portable app still needs a same-volume atomic swap.
  // Keep this transient, hidden directory at the volume root, off the Desktop.
  const root = volumeRoot(path.dirname(target));
  if (onDesktop(root)) throw Error('Cannot prepare an update outside the Desktop on this volume. Move the app to a local folder or replace the EXE manually.');
  return path.join(root, name);
}
function isOwnedStage(job) {
  const name = stageName(job.id);
  const stage = path.resolve(job.stage);
  const candidates = [path.join(job.storage, name),
    path.join(path.dirname(job.target), name)]; // Finish pre-3.51.18 transactions.
  if (candidates.some(p => path.resolve(p) === stage)) return true;
  return stage === path.join(volumeRoot(path.dirname(job.target)), name);
}
module.exports = { stagePath, isOwnedStage, volumeRoot };
