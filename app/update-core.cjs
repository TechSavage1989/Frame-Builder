'use strict';
const crypto = require('node:crypto');
const REPO = 'TechSavage1989/Frame-Builder';
const APP_ID = 'com.techsavage3d.canvasframe';
const VERSION = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/;
const SHA = /^[a-f0-9]{64}$/i;
const API = 'https://api.github.com/repos/' + REPO + '/releases/latest';
function version(v) {
  const text = String(v || '').replace(/^v/, '');
  if (!VERSION.test(text)) throw Error('Invalid version');
  const values = text.split('.').map(Number);
  if (!values.every(Number.isSafeInteger)) throw Error('Invalid version');
  return values;
}
function compare(a, b) {
  const x = version(a), y = version(b);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return Math.sign(x[i] - y[i]);
  return 0;
}
function allowedUrl(value, kind) {
  let u;
  try { u = new URL(value); } catch { throw Error('Invalid download URL'); }
  if (u.protocol !== 'https:' || u.username || u.password || u.port || u.search || u.hash) throw Error('Unsafe asset URL');
  if (kind === 'api') {
    if (u.href !== API) throw Error('Untrusted API endpoint');
  } else if (kind === 'asset') {
    if (u.hostname !== 'github.com' || !new RegExp('^/' + REPO + '/releases/download/v\\d+\\.\\d+\\.\\d+/[A-Za-z0-9_.-]+$').test(u.pathname)) throw Error('Untrusted release asset URL');
  } else throw Error('Unknown URL policy');
  return u.href;
}
function releaseUrl(value, tag) {
  return value === 'https://github.com/' + REPO + '/releases/tag/' + tag ? value : null;
}
function validateManifest(data, installed, tag) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw Error('Invalid manifest');
  if (data.appId !== APP_ID || data.product !== 'Frame Builder') throw Error('Wrong application');
  if (typeof data.version !== 'string' || !VERSION.test(data.version) || tag !== 'v' + data.version) throw Error('Release version mismatch');
  const name = 'Frame_Builder_' + data.version + '_Windows_x64.exe';
  if (data.asset?.name !== name || typeof data.asset.sha256 !== 'string' || !SHA.test(data.asset.sha256)) throw Error('Invalid asset metadata');
  const url = 'https://github.com/' + REPO + '/releases/download/' + tag + '/' + name;
  if (data.asset.url !== url) throw Error('Asset release or name mismatch');
  allowedUrl(url, 'asset');
  if (!Number.isSafeInteger(data.asset.size) || data.asset.size < 1_000_000 || data.asset.size > 800_000_000) throw Error('Invalid download size');
  if (data.asset.kind !== 'windows-portable-exe') throw Error('Unexpected package type');
  const notes = Array.isArray(data.notes) ? data.notes.filter(x => typeof x === 'string').slice(0, 12).map(x => x.slice(0, 180)) : [];
  return {
    installedVersion: installed, latestVersion: data.version,
    available: compare(data.version, installed) > 0,
    asset: Object.freeze({ name, url, kind: data.asset.kind, size: data.asset.size, sha256: data.asset.sha256.toLowerCase() }),
    notes: notes.slice(0, 3),
    readMore: data.hasMoreNotes === true || notes.length > 3 ? releaseUrl(data.readMore, tag) : null,
  };
}
function sha256(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }
function verifyPayload(contents, asset) {
  if (contents.length !== asset.size || sha256(contents).toLowerCase() !== asset.sha256.toLowerCase()) throw Error('Update package failed size or SHA-256 verification');
}
function validatePE(header) {
  if (!Buffer.isBuffer(header) || header.length < 512 || header.toString('ascii', 0, 2) !== 'MZ') throw Error('Not a Windows executable');
  const pos = header.readUInt32LE(60);
  if (pos < 64 || pos + 24 > header.length || header.toString('ascii', pos, pos + 4) !== 'PE\0\0') throw Error('Invalid Windows PE header');
  // The NSIS portable container can be x86 while its embedded Electron app is x64.
  // Exact manifest hash and Windows product/version metadata are also mandatory.
  if (![0x8664, 0x14c].includes(header.readUInt16LE(pos + 4))) throw Error('Unexpected Windows executable architecture');
  if (header.readUInt16LE(pos + 22) & 0x2000) throw Error('Update must be an executable, not a DLL');
  return true;
}
module.exports = { REPO, APP_ID, API, compare, allowedUrl, validateManifest, verifyPayload, sha256, validatePE, releaseUrl };
