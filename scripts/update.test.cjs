'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {compare,validateManifest,allowedUrl,verifyPayload,validatePE}=require('../app/update-core.cjs');
const {UpdateCheck}=require('../app/update-check.cjs');
const asset={name:'Frame_Builder_3.51.7_Windows_x64.exe',kind:'windows-portable-exe',size:23456789,sha256:'a'.repeat(64),url:'https://github.com/TechSavage1989/Frame-Builder/releases/download/v3.51.7/Frame_Builder_3.51.7_Windows_x64.exe'};
const manifest={appId:'com.techsavage3d.canvasframe',product:'Frame Builder',version:'3.51.7',asset,notes:['Fixes and updater']};
test('versions are numeric, not lexical',()=>{assert.equal(compare('3.51.7','3.51.6'),1);assert.equal(compare('3.52.0','3.51.99'),1);assert.equal(compare('3.51.6','3.51.6'),0);assert.throws(()=>compare('banana','3.51.6'));});
test('strict manifest identity and version verification',()=>{assert.equal(validateManifest(manifest,'3.51.6','v3.51.7').available,true);assert.equal(validateManifest(manifest,'3.51.7','v3.51.7').available,false);for(const patch of [{appId:'wrong'},{version:'3.51.8'},{asset:{...asset,kind:'zip'}},{asset:{...asset,sha256:'oops'}},{asset:{...asset,size:0}},{asset:{...asset,url:'https://evil.example/a.exe'}}])assert.throws(()=>validateManifest({...manifest,...patch},'3.51.6','v3.51.7'));});
test('download allowlist rejects arbitrary urls and protocols',()=>{allowedUrl(asset.url,'asset');for(const u of ['http://github.com/TechSavage1989/Frame-Builder/releases/download/v3.51.7/x.exe','https://evil.com/x.exe','https://github.com/TechSavage1989/Oops/releases/download/v3.51.7/a.exe','https://bob:pass@github.com/TechSavage1989/Frame-Builder/releases/download/v3.51.7/x.exe'])assert.throws(()=>allowedUrl(u,'asset'));});
test('negative hash checks and PE identity',()=>{assert.throws(()=>verifyPayload(Buffer.from('wrong'),asset));const h=Buffer.alloc(512);h.write('MZ');h.writeUInt32LE(128,60);h.write('PE\0\0',128);h.writeUInt16LE(0x8664,132);assert.equal(validatePE(h),true);h.writeUInt16LE(0x14c,132);assert.equal(validatePE(h),true);h.writeUInt16LE(0xAA64,132);assert.throws(()=>validatePE(h));});
test('offline and 429 never produce up-to-date and back off',async()=>{let now=120000;const states=[];const c=new UpdateCheck({installed:'3.51.6',clock:()=>now,onState:s=>states.push(s),fetcher:async()=>{throw Object.assign(Error('offline'),{status:429,retryAfter:'120'})}});const a=await c.check();assert.equal(a.state,'error');assert.equal(c.nextAllowed,240000);now+=60000;const b=await c.check();assert.equal(b.state,'cooldown');assert.equal(states.filter(x=>x.state==='checking').length,1);});
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

test('a failed check preserves the validated ETag result for the next 304', async () => {
  let now=100000, count=0;
  const release={tag_name:'v3.51.7',assets:[{name:'update-manifest.json',browser_download_url:'https://github.com/TechSavage1989/Frame-Builder/releases/download/v3.51.7/update-manifest.json'},{name:asset.name,size:asset.size,browser_download_url:asset.url}]};
  const fetcher=async(url,etag)=>{
    if(!url.endsWith('/latest'))return {data:manifest};
    count++;
    if(count===1)return {data:release,etag:'"known"'};
    if(count===2)throw Error('offline');
    assert.equal(etag,'"known"');return {notModified:true,etag:'"known"'};
  };
  // Negative control: the exact repository candidate loses the cache on error.
  const vm=require('node:vm');
  const m={exports:{}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'fixtures/pre-audit-update-check.cjs'),'utf8'),{
    module:m,require:id=>id==='./update-core.cjs'?require('../app/update-core.cjs'):require(id),Buffer,URL,
  });
  const broken=new m.exports.UpdateCheck({installed:'3.51.6',clock:()=>now,onState:()=>{},fetcher});
  assert.equal((await broken.check()).state,'available');now+=300000;
  assert.equal((await broken.check()).state,'error');now+=300000;
  assert.equal((await broken.check()).state,'error');
  count=0;
  const fixed=new UpdateCheck({installed:'3.51.6',clock:()=>now,fetcher});
  assert.equal((await fixed.check()).state,'available');now+=300000;
  assert.equal((await fixed.check()).state,'error');now+=300000;
  assert.equal((await fixed.check()).state,'available');
});
test('validated disk cache survives restart and binds to installed version',async()=>{
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'frame-cache-'));
  const cacheFile=path.join(folder,'cache.json');let now=100000;
  const release={tag_name:'v3.51.7',assets:[{name:'update-manifest.json',browser_download_url:'https://github.com/TechSavage1989/Frame-Builder/releases/download/v3.51.7/update-manifest.json'},{name:asset.name,size:asset.size,browser_download_url:asset.url}]};
  try{
    const first=new UpdateCheck({installed:'3.51.6',clock:()=>now,cacheFile,fetcher:async url=>url.endsWith('/latest')?{data:release,etag:'cached'}:{data:manifest}});
    await first.check();now+=300000;
    const second=new UpdateCheck({installed:'3.51.7',clock:()=>now,cacheFile,fetcher:async(_url,etag)=>{assert.equal(etag,'cached');return {notModified:true};}});
    assert.equal(second.last,null);assert.equal((await second.check()).state,'current');
    assert.equal(second.cached.info.installedVersion,'3.51.7');
  }finally{fs.rmSync(folder,{recursive:true,force:true})}
});
test('failed manifest fetch never commits the release ETag',async()=>{
  const release={tag_name:'v3.51.7',assets:[{name:'update-manifest.json',browser_download_url:'https://github.com/TechSavage1989/Frame-Builder/releases/download/v3.51.7/update-manifest.json'}]};
  const c=new UpdateCheck({installed:'3.51.6',fetcher:async url=>url.endsWith('/latest')?{data:release,etag:'unusable'}:Promise.reject(Error('network failed'))});
  assert.equal((await c.check()).state,'error');assert.equal(c.etag,null);
});
test('manifest rejects stale asset filenames, prerelease versions and fake additional links',()=>{
  assert.throws(()=>validateManifest({...manifest,version:'3.51.7-beta'},'3.51.6','v3.51.7'));
  assert.throws(()=>validateManifest({...manifest,asset:{...asset,name:'Frame_Builder_3.51.6_Windows_x64.exe'}},'3.51.6','v3.51.7'));
  const readMore='https://github.com/TechSavage1989/Frame-Builder/releases/tag/v3.51.7';
  assert.equal(validateManifest({...manifest,readMore},'3.51.6','v3.51.7').readMore,null);
  assert.equal(validateManifest({...manifest,hasMoreNotes:true,readMore},'3.51.6','v3.51.7').readMore,readMore);
  assert.equal(validateManifest({...manifest,hasMoreNotes:true,readMore:readMore+'?redirect=evil'},'3.51.6','v3.51.7').readMore,null);
});
test('main-process scheduler checks unfocused windows and unbinds on close using real timers',async()=>{
  const {bindUpdateSchedule,INTERVAL_MS,FOCUS_MS}=require('../app/update-scheduler.cjs');
  assert.equal(INTERVAL_MS,300000);assert.equal(FOCUS_MS,120000);
  const win=new EventEmitter();win.isDestroyed=()=>false;win.isFocused=()=>false;
  let count=0,online=true;
  const checker={lastAt:Date.now(),check(){count++;this.lastAt=Date.now()}};
  bindUpdateSchedule({window:win,checker,online:()=>online,interval:30,focusAge:10});
  assert.equal(count,1);await new Promise(r=>setTimeout(r,80));
  assert(count>=3);online=false;const n=count;
  await new Promise(r=>setTimeout(r,60));assert.equal(count,n);
  online=true;win.emit('focus');assert.equal(count,n+1);
  win.emit('closed');const done=count;
  await new Promise(r=>setTimeout(r,60));assert.equal(count,done);
});
test('only committed app-owned transactions are cleaned after helper exit',async()=>{
  const {finishInstallJobs,hashFile}=require('../app/update-housekeeping.cjs');
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'frame-cleanup-'));
  const storage=path.join(folder,'profile','updates'),id='b'.repeat(24);
  const target=path.join(folder,'My custom launcher.exe'),stage=path.join(folder,'.frame-builder-update-'+id);
  fs.mkdirSync(storage,{recursive:true});fs.mkdirSync(stage);
  fs.writeFileSync(target,'new');fs.writeFileSync(path.join(stage,'previous.exe'),'old');
  const sha256=await hashFile(target),oldSha256=await hashFile(path.join(stage,'previous.exe'));
  const payload=path.join(storage,'update-'+sha256+'.exe');fs.writeFileSync(payload,'new');
  const job={appId:'com.techsavage3d.canvasframe',id,target,storage,stage,payload,version:'3.51.7',sha256,oldSha256};
  const jf=path.join(storage,'install-'+id+'.json'),rf=path.join(storage,'result-'+id+'.json');
  fs.writeFileSync(jf,JSON.stringify(job));
  fs.writeFileSync(path.join(storage,'my-export.stl'),'keep');
  const helperLog=path.join(storage,'helper-'+id+'.log');fs.writeFileSync(helperLog,'installer output');
  const helperOut=path.join(storage,'helper-'+id+'.out.log');fs.writeFileSync(helperOut,'installer output');
  fs.writeFileSync(rf,JSON.stringify({id,state:'success',helperPid:process.pid}));
  try{
    assert.equal(await finishInstallJobs(storage),null);assert(fs.existsSync(stage));assert(fs.existsSync(helperLog));
    fs.writeFileSync(rf,JSON.stringify({id,state:'success',helperPid:-1}));
    assert.equal((await finishInstallJobs(storage)).state,'installed');
    assert(!fs.existsSync(stage));assert(!fs.existsSync(payload));assert(!fs.existsSync(jf));assert(!fs.existsSync(helperLog));assert(!fs.existsSync(helperOut));
    assert.equal(fs.readFileSync(path.join(storage,'rollback.exe'),'utf8'),'old');
    assert.equal(fs.readFileSync(path.join(storage,'my-export.stl'),'utf8'),'keep');
    assert.equal(fs.readFileSync(target,'utf8'),'new');
  }finally{fs.rmSync(folder,{recursive:true,force:true})}
});
