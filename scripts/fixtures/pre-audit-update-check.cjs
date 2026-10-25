'use strict';
const https = require('node:https');
const { validateManifest, allowedUrl, REPO } = require('./update-core.cjs');
const API = `https://api.github.com/repos/${REPO}/releases/latest`;
const REDIRECT_HOSTS = new Set([
  'github.com',
  'release-assets.githubusercontent.com',
  'objects.githubusercontent.com',
]);

function safeFetchUrl(value) {
  const u = new URL(value);
  if (u.protocol !== 'https:' || u.username || u.password || u.port ||
      !(['api.github.com', ...REDIRECT_HOSTS].includes(u.hostname))) {
    throw Error('Untrusted update endpoint');
  }
  return u;
}

function fetchJson(url, etag, depth = 0, transport = https) {
  if (depth > 3) return Promise.reject(Error('Too many update redirects'));
  let u;
  try { u = safeFetchUrl(url); }
  catch (error) { return Promise.reject(error); }

  return new Promise((resolve, reject) => {
    const req = transport.get(u, {
      headers: {
        'User-Agent': 'Frame-Builder-Updater',
        Accept: 'application/vnd.github+json',
        ...(etag ? { 'If-None-Match': etag } : {}),
      },
    }, response => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
        response.resume();
        let location;
        try { location = safeFetchUrl(new URL(response.headers.location || '', u).href).href; }
        catch (error) { reject(error); return; }
        fetchJson(location, null, depth + 1, transport).then(resolve, reject);
        return;
      }
      if (response.statusCode === 304) {
        response.resume();
        resolve({ notModified: true, etag: response.headers.etag });
        return;
      }
      if (response.statusCode !== 200) {
        response.resume();
        reject(Object.assign(Error('GitHub update HTTP ' + response.statusCode), {
          status: response.statusCode,
          retryAfter: response.headers['retry-after'],
          rateLimitReset: response.headers['x-ratelimit-reset'],
        }));
        return;
      }
      const chunks = [];
      let size = 0;
      response.on('data', piece => {
        size += piece.length;
        if (size > 1024 * 1024) {
          req.destroy(Error('Update response too large'));
          return;
        }
        chunks.push(piece);
      });
      response.once('error', reject);
      response.once('end', () => {
        try {
          resolve({ data: JSON.parse(Buffer.concat(chunks).toString('utf8')), etag: response.headers.etag });
        } catch (error) { reject(error); }
      });
    });
    req.setTimeout(12000, () => req.destroy(Error('Update request timed out')));
    req.once('error', reject);
  });
}

function retryDelay(error, now, failureCount) {
  let delay = Math.min(3600000, 60000 * 2 ** Math.min(5, failureCount - 1));
  if (![403, 429, 503].includes(error.status)) return delay;
  const rawRetry = String(error.retryAfter || '');
  const seconds = /^\d+$/.test(rawRetry) ? Number(rawRetry) : NaN;
  const retryDate = Number.isNaN(seconds) ? Date.parse(rawRetry) : NaN;
  if (Number.isFinite(seconds)) delay = Math.max(delay, seconds * 1000);
  else if (Number.isFinite(retryDate)) delay = Math.max(delay, retryDate - now);
  const reset = Number(error.rateLimitReset);
  if (Number.isSafeInteger(reset) && reset > 0) {
    delay = Math.max(delay, reset * 1000 - now + 1000);
  }
  return Math.max(60000, Math.min(24 * 3600000, delay));
}

class UpdateCheck {
  constructor({ installed, onState, fetcher = fetchJson, clock = () => Date.now() }) {
    this.installed = installed;
    this.onState = onState;
    this.fetcher = fetcher;
    this.clock = clock;
    this.inflight = null;
    this.lastAt = 0;
    this.nextAllowed = 0;
    this.etag = null;
    this.last = null;
    this.failCount = 0;
  }

  async check(manual = false) {
    const now = this.clock();
    if (this.inflight) return this.inflight;
    if (now < this.nextAllowed || (manual && this.lastAt && now - this.lastAt < 60000)) {
      return this.last || { state: 'cooldown' };
    }
    this.lastAt = now;
    this.onState({ state: 'checking' });
    this.inflight = (async () => {
      try {
        const response = await this.fetcher(allowedUrl(API, 'api'), this.etag);
        this.etag = response.etag || this.etag;
        if (response.notModified) {
          if (!this.last || !['available', 'current'].includes(this.last.state)) {
            throw Error('No cached update result');
          }
          this.last = { ...this.last, checkedAt: now };
          this.onState(this.last);
          return this.last;
        }
        const release = response.data;
        if (!release || release.draft || release.prerelease ||
            !/^v\d+\.\d+\.\d+$/.test(release.tag_name)) {
          throw Error('No valid stable release');
        }
        const manifestAsset = release.assets?.find(a => a.name === 'update-manifest.json');
        if (!manifestAsset) throw Error('Release has no update manifest');
        const manifestURL = new URL(manifestAsset.browser_download_url);
        if (manifestURL.protocol !== 'https:' || manifestURL.hostname !== 'github.com' ||
            manifestURL.pathname !== `/${REPO}/releases/download/${release.tag_name}/update-manifest.json`) {
          throw Error('Untrusted manifest asset URL');
        }
        const { data } = await this.fetcher(manifestAsset.browser_download_url, null);
        const info = validateManifest(data, this.installed, release.tag_name);
        if (!release.assets.some(a => a.name === info.asset.name && a.size === info.asset.size &&
              a.browser_download_url === info.asset.url)) {
          throw Error('Release executable metadata mismatch');
        }
        this.failCount = 0;
        this.nextAllowed = 0;
        this.last = { state: info.available ? 'available' : 'current', info, checkedAt: now };
        this.onState(this.last);
        return this.last;
      } catch (error) {
        this.failCount += 1;
        this.nextAllowed = now + retryDelay(error, now, this.failCount);
        this.last = {
          state: 'error',
          message: 'Update check unavailable: ' + error.message,
          retryAfter: this.nextAllowed,
        };
        this.onState(this.last);
        return this.last;
      } finally {
        this.inflight = null;
      }
    })();
    return this.inflight;
  }
}
module.exports = { UpdateCheck, fetchJson, retryDelay, safeFetchUrl };
