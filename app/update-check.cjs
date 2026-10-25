'use strict';
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');
const { validateManifest, allowedUrl, REPO, API } = require('./update-core.cjs');
const REDIRECT_HOSTS = new Set(['github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com']);
function safeFetchUrl(value) {
  const u = new URL(value);
  if (u.protocol !== 'https:' || u.username || u.password || u.port || u.hash ||
      !(['api.github.com', ...REDIRECT_HOSTS].includes(u.hostname))) throw Error('Untrusted update endpoint');
  return u;
}
function fetchJson(url, etag, depth = 0, transport = https) {
  if (depth > 3) return Promise.reject(Error('Too many update redirects'));
  let u;
  try { u = safeFetchUrl(url); } catch (error) { return Promise.reject(error); }
  return new Promise((resolve, reject) => {
    let req;
    const deadline = setTimeout(() => req?.destroy(Error('Update request timed out')), 15000);
    const done = (fn, result) => { clearTimeout(deadline); fn(result); };
    req = transport.get(u, { headers: {
      'User-Agent': 'Frame-Builder-Updater',
      Accept: u.hostname === 'api.github.com' ? 'application/vnd.github+json' : 'application/json',
      ...(etag ? { 'If-None-Match': etag } : {}),
    } }, response => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
        response.resume();
        let location;
        try { location = safeFetchUrl(new URL(response.headers.location || '', u).href).href; }
        catch (error) { done(reject, error); return; }
        clearTimeout(deadline);
        fetchJson(location, null, depth + 1, transport).then(resolve, reject);
        return;
      }
      if (response.statusCode === 304) {
        response.resume(); done(resolve, { notModified: true, etag: response.headers.etag }); return;
      }
      if (response.statusCode !== 200) {
        response.resume();
        done(reject, Object.assign(Error('GitHub update HTTP ' + response.statusCode), {
          status: response.statusCode, retryAfter: response.headers['retry-after'],
          rateLimitReset: response.headers['x-ratelimit-reset'],
        }));
        return;
      }
      const chunks = [];
      let size = 0;
      response.on('data', piece => {
        size += piece.length;
        if (size > 1024 * 1024) { req.destroy(Error('Update response too large')); return; }
        chunks.push(piece);
      });
      response.once('error', error => done(reject, error));
      response.once('aborted', () => done(reject, Error('Update response interrupted')));
      response.once('end', () => {
        try { done(resolve, { data: JSON.parse(Buffer.concat(chunks).toString('utf8')), etag: response.headers.etag }); }
        catch (error) { done(reject, error); }
      });
    });
    req.setTimeout(12000, () => req.destroy(Error('Update request timed out')));
    req.once('error', error => done(reject, error));
  });
}
function retryDelay(error, now, failureCount) {
  let delay = Math.min(3600000, 60000 * 2 ** Math.min(6, failureCount - 1));
  if (![403, 429, 503].includes(error.status)) return delay;
  const raw = String(error.retryAfter || '');
  const seconds = /^\d+$/.test(raw) ? Number(raw) : NaN;
  const date = Number.isNaN(seconds) ? Date.parse(raw) : NaN;
  if (Number.isFinite(seconds)) delay = Math.max(delay, seconds * 1000);
  else if (Number.isFinite(date)) delay = Math.max(delay, date - now);
  const reset = Number(error.rateLimitReset);
  if (Number.isSafeInteger(reset) && reset > 0) delay = Math.max(delay, reset * 1000 - now + 1000);
  return Math.max(60000, Math.min(7 * 86400000, delay));
}
class UpdateCheck {
  constructor({ installed, onState = () => {}, fetcher = fetchJson, clock = Date.now, cacheFile = null }) {
    Object.assign(this, { installed, onState, fetcher, clock, cacheFile });
    this.inflight = null; this.lastAt = 0; this.nextAllowed = 0;
    this.etag = null; this.last = null; this.cached = null; this.failCount = 0;
    if (cacheFile) {
      try {
        const saved = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
        if (saved.manifest) {
          const info = validateManifest(saved.manifest, installed, saved.tag);
          this.cached = { state: info.available ? 'available' : 'current', info, checkedAt: saved.checkedAt };
          this.manifest = saved.manifest; this.tag = saved.tag;
          this.etag = typeof saved.etag === 'string' ? saved.etag : null;
        }
        this.lastAt = Number(saved.lastAt) || 0;
        this.nextAllowed = Math.min(Number(saved.nextAllowed) || 0, clock() + 7 * 86400000);
        this.failCount = Math.min(Number(saved.failCount) || 0, 8);
      } catch { /* A missing or invalid cache never establishes online status. */ }
    }
  }
  persist() {
    if (!this.cacheFile) return;
    try {
      fs.mkdirSync(path.dirname(this.cacheFile), { recursive: true });
      const temp = this.cacheFile + '.tmp';
      fs.writeFileSync(temp, JSON.stringify({
        manifest: this.manifest, tag: this.tag, etag: this.etag, checkedAt: this.cached?.checkedAt,
        lastAt: this.lastAt, nextAllowed: this.nextAllowed, failCount: this.failCount,
      }), { mode: 0o600 });
      fs.renameSync(temp, this.cacheFile);
    } catch { /* Network checks still work if the cache cannot be written. */ }
  }
  async check(manual = false) {
    const now = this.clock();
    if (this.inflight) return this.inflight;
    if (now < this.nextAllowed || (manual && this.lastAt && now - this.lastAt < 60000)) {
      const state = { state: 'cooldown', retryAfter: Math.max(this.nextAllowed, this.lastAt + 60000),
        cachedInfo: this.cached?.info, checkedAt: this.cached?.checkedAt, manual };
      if (manual) this.onState(state);
      return state;
    }
    this.lastAt = now;
    this.onState({ state: 'checking', manual });
    this.inflight = (async () => {
      try {
        const response = await this.fetcher(allowedUrl(API, 'api'), this.etag);
        let result;
        if (response.notModified) {
          if (!this.cached) throw Error('No cached update result');
          result = { ...this.cached, checkedAt: now };
        } else {
          const release = response.data;
          if (!release || release.draft || release.prerelease || !/^v\d+\.\d+\.\d+$/.test(release.tag_name)) throw Error('No valid stable release');
          const asset = release.assets?.find(a => a.name === 'update-manifest.json');
          const expected = 'https://github.com/' + REPO + '/releases/download/' + release.tag_name + '/update-manifest.json';
          if (!asset || asset.browser_download_url !== expected) throw Error('Untrusted or missing manifest asset URL');
          const { data } = await this.fetcher(allowedUrl(expected, 'asset'), null);
          const info = validateManifest(data, this.installed, release.tag_name);
          if (!release.assets.some(a => a.name === info.asset.name && a.size === info.asset.size && a.browser_download_url === info.asset.url)) throw Error('Release executable metadata mismatch');
          this.manifest = data; this.tag = release.tag_name;
          result = { state: info.available ? 'available' : 'current', info, checkedAt: now };
        }
        // Commit the ETag only with a usable manifest. Keep that cache across failures.
        this.etag = response.etag || this.etag;
        this.failCount = 0; this.nextAllowed = 0;
        this.cached = result;
        this.last = { ...result, manual };
        this.persist(); this.onState(this.last); return this.last;
      } catch (error) {
        this.failCount++;
        this.nextAllowed = now + retryDelay(error, now, this.failCount);
        this.last = { state: 'error', message: 'Update check unavailable: ' + error.message,
          retryAfter: this.nextAllowed, cachedInfo: this.cached?.info, checkedAt: this.cached?.checkedAt, manual };
        this.persist(); this.onState(this.last); return this.last;
      } finally { this.inflight = null; }
    })();
    return this.inflight;
  }
}
module.exports = { UpdateCheck, fetchJson, retryDelay, safeFetchUrl };
