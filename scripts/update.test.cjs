'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {compare,validateManifest,allowedUrl,verifyPayload,validatePE}=require('../app/update-core.cjs');
const {UpdateCheck}=require('../app/update-check.cjs');
const asset={name:'Frame_Builder_3.51.7_Windows_x64.exe',kind:'windows-portable-exe',size:23456789,sha256:'a'.repeat(64),url:'https://github.com/TechSavage1989/Frame-Builder/releases/download/v3.51.7/Frame_Builder_3.51.7_Windows_x64.exe'};
const manifest={appId:'com.techsavage3d.canvasframe',product:'Frame Builder',version:'3.51.7',asset,notes:['Fixes and updater']};
test('versions are numeric, not lexical',()=>{assert.equal(compare('3.51.7','3.51.6'),1);assert.equal(compare('3.52.0','3.51.99'),1);assert.equal(compare('3.51.6','3.51.6'),0);assert.throws(()=>compare('banana','3.51.6'));});
test('strict manifest identity and version verification',()=>{assert.equal(validateManifest(manifest,'3.51.6','v3.51.7').available,true);assert.equal(validateManifest(manifest,'3.51.7','v3.51.7').available,false);for(const patch of [{appId:'wrong'},{version:'3.51.8'},{asset:{...asset,kind:'zip'}},{asset:{...asset,sha256:'oops'}},{asset:{...asset,size:0}},{asset:{...asset,url:'https://evil.example/a.exe'}}])assert.throws(()=>validateManifest({...manifest,...patch},'3.51.6','v3.51.7'));});
test('download allowlist rejects arbitrary urls and protocols',()=>{allowedUrl(asset.url,'asset');for(const u of ['http://github.com/TechSavage1989/Frame-Builder/releases/download/v3.51.7/x.exe','https://evil.com/x.exe','https://github.com/TechSavage1989/Oops/releases/download/v3.51.7/a.exe','https://bob:pass@github.com/TechSavage1989/Frame-Builder/releases/download/v3.51.7/x.exe'])assert.throws(()=>allowedUrl(u,'asset'));});
test('negative hash checks and PE identity',()=>{assert.throws(()=>verifyPayload(Buffer.from('wrong'),asset));const h=Buffer.alloc(512);h.write('MZ');h.writeUInt32LE(128,60);h.write('PE\0\0',128);h.writeUInt16LE(0x8664,132);assert.equal(validatePE(h),true);h.writeUInt16LE(0x14c,132);assert.throws(()=>validatePE(h));});
test('offline and 429 never produce up-to-date and back off',async()=>{let now=120000;const states=[];const c=new UpdateCheck({installed:'3.51.6',clock:()=>now,onState:s=>states.push(s),fetcher:async()=>{throw Object.assign(Error('offline'),{status:429,retryAfter:'120'})}});const a=await c.check();assert.equal(a.state,'error');assert.equal(c.nextAllowed,240000);now+=60000;const b=await c.check();assert.equal(b.state,'error');assert.equal(states.filter(x=>x.state==='checking').length,1);});
test('ETag result cached, single-flight and version manifest checked',async()=>{let time=120000,calls=0;const history=[];const release={tag_name:'v3.51.7',assets:[{name:'update-manifest.json',browser_download_url:'https://github.com/TechSavage1989/Frame-Builder/releases/download/v3.51.7/update-manifest.json'},{name:asset.name,size:asset.size,browser_download_url:asset.url}]};const checker=new UpdateCheck({installed:'3.51.6',clock:()=>time,onState:s=>history.push(s),fetcher:async(url,etag)=>{calls++;if(url.endsWith('/latest'))return etag?{notModified:true,etag:'W/123'}:{data:release,etag:'W/123'};return {data:manifest};}});
 const [a,b]=await Promise.all([checker.check(),checker.check()]);assert.equal(a.state,'available');assert.equal(b.state,'available');assert.equal(calls,2);time+=300000;assert.equal((await checker.check()).state,'available');assert.equal(calls,3);});

const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { fetchJson, retryDelay } = require('../app/update-check.cjs');
const { streamAsset, checkDownloadedFile } = require('../app/update-download.cjs');
const os = require('node:os'), fs = require('node:fs'), path = require('node:path');

function stubHTTPS(specifications) {
  let calls = 0;
  return {
    get(_url, options, onResponse) {
      calls += 1;
      const spec = specifications[calls - 1];
      if (!spec) throw Error('Unexpected request #' + calls);
      const request = new EventEmitter();
      request.setTimeout = (_timeout, callback) => {
        if (spec.timeout) process.nextTick(callback);
      };
      request.destroy = err => { if (err) process.nextTick(() => request.emit('error', err)); };
      process.nextTick(() => {
        if (spec.timeout) return;
        const body = new PassThrough();
        body.statusCode = spec.status || 200;
        body.headers = spec.headers || {};
        onResponse(body);
        body.end(spec.body || '');
      });
      return request;
    },
    get calls() { return calls; },
  };
}

test('timeout is rejected as a normal error instead of raising an uncaught ReferenceError', async () => {
  const transport = stubHTTPS([{ timeout: true }]);
  await assert.rejects(fetchJson('https://api.github.com/repos/TechSavage1989/Frame-Builder/releases/latest', null, 0, transport),
    /Update request timed out/);
});

test('untrusted update redirect is rejected before following it', async () => {
  const transport = stubHTTPS([{ status: 302, headers: { location: 'https://evil.example/manifest.json' } }]);
  await assert.rejects(fetchJson('https://api.github.com/repos/TechSavage1989/Frame-Builder/releases/latest', null, 0, transport),
    /Untrusted update endpoint/);
  assert.equal(transport.calls, 1);
});

test('GitHub rate limit reset and Retry-After HTTP-date extend backoff', () => {
  const now = Date.UTC(2026, 9, 25, 2);
  const error = Object.assign(Error('limited'), { status: 403, rateLimitReset: String(Math.ceil((now + 180000) / 1000)) });
  assert(retryDelay(error, now, 1) >= 180000);
  error.rateLimitReset = undefined;
  error.retryAfter = new Date(now + 240000).toUTCString();
  assert(retryDelay(error, now, 1) >= 240000);
});

test('manifest cannot request asset from a different release tag', () => {
  const wrongTag = { ...asset, url: asset.url.replace('/v3.51.7/', '/v3.51.6/') };
  assert.throws(() => validateManifest({ ...manifest, asset: wrongTag }, '3.51.6', 'v3.51.7'),
    /Asset release or name mismatch/);
});

test('streaming download rejects truncated, oversized, corrupted and non-PE payloads', async () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'frame-builder-download-test-'));
  const small = Buffer.alloc(512);
  small.write('MZ'); small.writeUInt32LE(128, 60); small.write('PE\0\0', 128); small.writeUInt16LE(0x8664, 132);
  const sha = crypto.createHash('sha256').update(small).digest('hex');
  const record = { ...asset, size: small.length, sha256: sha };
  try {
    const valid = path.join(folder, 'valid.exe');
    await streamAsset(asset.url, valid, record, undefined, stubHTTPS([{ body: small }]));
    assert.equal(await checkDownloadedFile(valid, record), valid);
    for (const [name, payload, expected] of [
      ['truncated.exe', small.subarray(0, 480), /Invalid update size/],
      ['oversized.exe', Buffer.concat([small, small]), /Download exceeded declared size/],
      ['corrupt.exe', Buffer.alloc(512), /Invalid update SHA-256/],
    ]) {
      await assert.rejects(streamAsset(asset.url, path.join(folder, name), record, undefined,
        stubHTTPS([{ body: payload }])), expected);
    }
  } finally { fs.rmSync(folder, { recursive: true, force: true }); }
});
