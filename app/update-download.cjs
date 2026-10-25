'use strict';
const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const crypto = require('node:crypto');
const { pipeline } = require('node:stream/promises');
const { Transform } = require('node:stream');
const { validatePE, allowedUrl } = require('./update-core.cjs');
const TRUSTED_REDIRECT_HOSTS = new Set([
  'github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com',
]);
function checkRedirect(value) {
  const u = new URL(value);
  if (u.protocol !== 'https:' || !TRUSTED_REDIRECT_HOSTS.has(u.hostname) ||
      u.username || u.password || u.port) throw Error('Untrusted download host');
  return u;
}
function followDownload(url, depth = 0, transport = https) {
  if (depth > 3) return Promise.reject(Error('Too many download redirects'));
  let u;
  try { u = checkRedirect(url); } catch (error) { return Promise.reject(error); }
  return new Promise((resolve, reject) => {
    const req = transport.get(u, { headers: {
      'User-Agent': 'Frame-Builder-Updater', Accept: 'application/octet-stream',
    } }, response => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
        response.resume();
        try {
          followDownload(new URL(response.headers.location || '', u).href, depth + 1, transport).then(resolve, reject);
        } catch (error) { reject(error); }
        return;
      }
      if (response.statusCode !== 200) {
        response.resume(); reject(Error('Download HTTP ' + response.statusCode)); return;
      }
      resolve(response);
    });
    req.setTimeout(120000, () => req.destroy(Error('Download timed out')));
    req.once('error', reject);
  });
}
async function checkDownloadedFile(file, asset) {
  if (fs.statSync(file).size !== asset.size) throw Error('Invalid update size');
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  if (hash.digest('hex').toLowerCase() !== asset.sha256.toLowerCase()) throw Error('Invalid update SHA-256');
  const header = Buffer.alloc(4096);
  const fd = fs.openSync(file, 'r');
  try { fs.readSync(fd, header, 0, header.length, 0); validatePE(header); }
  finally { fs.closeSync(fd); }
  return file;
}
async function streamAsset(url, file, asset, onProgress, transport = https) {
  const response = await followDownload(url, 0, transport);
  let size = 0;
  const contentLimit = Math.min(asset.size, 800000000);
  const meter = new Transform({
    transform(chunk, _encoding, callback) {
      size += chunk.length;
      if (size > contentLimit) return callback(Error('Download exceeded declared size'));
      try { onProgress?.(Math.min(99, Math.floor(size * 100 / asset.size))); }
      catch (error) { return callback(error); }
      callback(null, chunk);
    },
  });
  await pipeline(response, meter, fs.createWriteStream(file, { flags: 'wx', mode: 0o600 }));
  return checkDownloadedFile(file, asset);
}
async function downloadVerified(asset, storage, onProgress) {
  allowedUrl(asset.url, 'asset');
  fs.mkdirSync(storage, { recursive: true });
  const target = path.join(storage, 'update-' + asset.sha256.toLowerCase() + '.exe');
  if (fs.existsSync(target)) {
    try { return await checkDownloadedFile(target, asset); }
    catch (_) { fs.rmSync(target, { force: true }); }
  }
  const pending = target + '.pending-' + crypto.randomBytes(6).toString('hex');
  try {
    await streamAsset(asset.url, pending, asset, onProgress);
    fs.renameSync(pending, target);
    return target;
  } catch (error) {
    fs.rmSync(pending, { force: true });
    throw error;
  }
}
module.exports = { downloadVerified, streamAsset, checkDownloadedFile, checkRedirect, followDownload };
