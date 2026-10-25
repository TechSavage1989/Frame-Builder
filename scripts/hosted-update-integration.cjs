'use strict';
// Hosted Windows-only release verification. Never packaged with the app.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawn,execFileSync}=require('node:child_process');
const assert=require('node:assert/strict');
const {fetchJson,UpdateCheck}=require('../app/update-check.cjs');
const {validateManifest,REPO,APP_ID}=require('../app/update-core.cjs');
const {downloadVerified}=require('../app/update-download.cjs');
const {verifyWindowsIdentity}=require('../app/update-windows.cjs');
const {hashFile,isRunning}=require('../app/update-housekeeping.cjs');
if(process.platform!=='win32'||process.env.GITHUB_ACTIONS!=='true')throw Error('Run only in an isolated GitHub Windows runner');
const current=require('../package.json').version,previous=process.env.PREVIOUS_VERSION;
if(!/^\d+\.\d+\.\d+$/.test(previous||''))throw Error('Set PREVIOUS_VERSION to an existing release');
const mode=process.argv[2]||'direct',out=path.resolve('validation/runtime');
fs.mkdirSync(out,{recursive:true});
const ps=(code,env={})=>execFileSync('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-Command',"[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false);"+code],{encoding:'utf8',windowsHide:true,env:{...process.env,...env},timeout:30000}).trim();
const roaming=ps("[Environment]::GetFolderPath([Environment+SpecialFolder]::ApplicationData)");
const storage=path.join(roaming,'Canvas Frame Builder','updates');
fs.mkdirSync(storage,{recursive:true});
const testRoot=path.resolve('validation/runtime/install-'+mode);
fs.mkdirSync(testRoot,{recursive:true});
const target=path.join(testRoot,mode==='direct'?'User Named Främé.exe':'User Named Frame.exe');
const shortcut=path.join(testRoot,'Frame Builder.lnk');
const checks=[];
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function waitFor(fn,label,ms=120000){
  const end=Date.now()+ms;
  while(Date.now()<end){const value=await fn();if(value)return value;await delay(100)}
  throw Error('Timed out: '+label);
}
function receiptRequest(){
  const id=crypto.randomBytes(12).toString('hex');
  return {file:path.join(storage,'health-'+id+'.txt'),token:crypto.randomBytes(24).toString('hex')};
}
function receipt(file,token,version){
  try{const r=JSON.parse(fs.readFileSync(file,'utf8'));return r.token===token&&r.version===version&&r.rendererReady&&r.windowVisible?r:null}catch{return null}
}
async function closePid(pid,waitUnlock=true){
  ps("$p=Get-Process -Id ([int]$env:FRAME_TEST_PID) -ErrorAction SilentlyContinue;if($p){$p.CloseMainWindow()|Out-Null}",{FRAME_TEST_PID:String(pid)});
  await waitFor(()=>!isRunning(pid),'application close',30000);
  if(waitUnlock)await waitFor(()=>ps("try{$f=[IO.File]::Open($env:FRAME_TEST_TARGET,'Open','ReadWrite','None');$f.Dispose();'ready'}catch{'locked'}",{FRAME_TEST_TARGET:target})==='ready','portable launcher file unlock',30000);
}
function runningFrame(){
  const json=ps("Get-Process -Name 'Frame Builder' -ErrorAction SilentlyContinue | Where-Object {$_.MainWindowHandle -ne 0} | Select-Object -First 1 -Property Id | ConvertTo-Json -Compress;exit 0");
  return json?JSON.parse(json).Id:null;
}
async function launch(version,debugPort){
  fs.rmSync(path.join(storage,'check-cache.json'),{force:true});
  const h=receiptRequest();
  const nativeModules=path.join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','Modules');
  const p=spawn(target,debugPort?['--remote-debugging-port='+debugPort,'--remote-debugging-address=127.0.0.1']:[],
    {stdio:'ignore',env:{...process.env,PSModulePath:nativeModules+';'+(process.env.PSModulePath||''),FRAME_BUILDER_HEALTH_FILE:h.file,FRAME_BUILDER_HEALTH_TOKEN:h.token}});
  const r=await waitFor(()=>receipt(h.file,h.token,version),'visible '+version+' window');
  fs.rmSync(h.file,{force:true});
  return {p,receipt:r};
}
async function release(version){
  const tag='v'+version;
  const url='https://github.com/'+REPO+'/releases/download/'+tag+'/update-manifest.json';
  const {data}=await fetchJson(url,null);
  const info=validateManifest(data,previous,tag);
  const file=await downloadVerified(info.asset,storage);
  await verifyWindowsIdentity(file,version);
  return {info,file};
}
async function waitCleanup(job){
  await waitFor(()=>!fs.existsSync(job.stage)&&!fs.existsSync(path.join(storage,'helper-'+job.id+'.ps1')),'post-helper cleanup',40000);
}
async function transaction(oldVersion,newRelease,{interrupt=false,holdLock=false}={}){
  const old=await launch(oldVersion);
  const id=crypto.randomBytes(12).toString('hex'),token=crypto.randomBytes(24).toString('hex');
  const job={appId:APP_ID,id,target,storage,payload:newRelease.file,version:current,
    sha256:newRelease.info.asset.sha256,oldSha256:await hashFile(target),healthToken:token,parentPid:old.receipt.pid,
    stage:path.join(path.dirname(target),'.frame-builder-update-'+id)};
  const jobFile=path.join(storage,'install-'+id+'.json'),helper=path.join(storage,'helper-'+id+'.ps1');
  fs.writeFileSync(jobFile,JSON.stringify(job));fs.copyFileSync(path.resolve('app/update-install.ps1'),helper);
  let lock;
  const lockReady=path.join(testRoot,'lock-ready'),releaseLock=path.join(testRoot,'release-lock');
  if(holdLock){
    for(const f of [lockReady,releaseLock])fs.rmSync(f,{force:true});
    lock=spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command',
      "$s=[IO.File]::Open($env:FRAME_LOCK_TARGET,'Open','Read','Read');[IO.File]::WriteAllText($env:FRAME_LOCK_READY,'locked');try{while(-not(Test-Path -LiteralPath $env:FRAME_RELEASE_LOCK)){Start-Sleep -Milliseconds 100}}finally{$s.Dispose()}"],
      {stdio:'ignore',windowsHide:true,env:{...process.env,FRAME_LOCK_TARGET:target,FRAME_LOCK_READY:lockReady,FRAME_RELEASE_LOCK:releaseLock}});
    await waitFor(()=>fs.existsSync(lockReady),'native executable lock',15000);
  }
  const installer=spawn('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',helper,'-JobFile',jobFile],{stdio:['ignore','pipe','pipe'],windowsHide:true});
  let helperStderr='',helperExit=null;installer.stderr.on('data',x=>helperStderr+=x);installer.stdout.resume();installer.on('exit',code=>helperExit=code);
  const ready=path.join(storage,'ready-'+id+'.json');
  const resultFile=path.join(storage,'result-'+id+'.json');
  await waitFor(()=>{
    if(fs.existsSync(resultFile)){const r=JSON.parse(fs.readFileSync(resultFile,'utf8'));throw Error('Installer preflight failed: '+r.message+' '+helperStderr)}
    if(helperExit!==null)throw Error('Installer exited before ready: '+helperExit+' '+helperStderr);
    return fs.existsSync(ready)
  },'installer preflight');
  await closePid(old.receipt.pid,false);
  if(holdLock){
    await delay(2500);assert.equal(await hashFile(target),job.oldSha256);
    fs.writeFileSync(releaseLock,'release');
    await new Promise(resolve=>lock.once('exit',resolve));
    checks.push({name:'actual native file lock delays replacement until released',passed:true});
  }
  const health=path.join(storage,'health-'+id+'.txt');
  const healthy=await waitFor(()=>receipt(health,token,current),'new responsive window');
  if(interrupt){
    ps("Stop-Process -Id ([int]$env:FRAME_TEST_PID) -Force",{FRAME_TEST_PID:String(healthy.pid)});
  }
  const result=await waitFor(()=>{try{return JSON.parse(fs.readFileSync(resultFile,'utf8'))}catch{return !interrupt&&!fs.existsSync(jobFile)&&!fs.existsSync(job.stage)&&isRunning(healthy.pid)?{state:'success',cleanupObserved:true}:null}},'installer result',150000);
  await waitFor(()=>!isRunning(installer.pid),'helper exit',15000);
  if(interrupt){
    assert.equal(result.state,'rolled-back',JSON.stringify(result));
    assert.equal(await hashFile(target),job.oldSha256);
    await waitFor(()=>runningFrame(),'previous version restarted',60000);
    await waitCleanup(job);
    await closePid(runningFrame());
    checks.push({name:'interrupted new window restores and restarts exact previous executable',passed:true});
  }else{
    assert.equal(result.state,'success',JSON.stringify(result));
    assert.equal(await hashFile(target),job.sha256);
    await waitCleanup(job);
    assert.equal(await hashFile(path.join(storage,'rollback.exe')),job.oldSha256);
    await closePid(healthy.pid);
    checks.push({name:'download, digest, target-volume staging, visible relaunch and deferred cleanup',passed:true});
  }
  return job;
}
async function connect(port){
  const targetInfo=await waitFor(async()=>{
    try{return (await (await fetch('http://127.0.0.1:'+port+'/json/list')).json()).find(x=>x.type==='page'&&x.url.includes('index.html'))}catch{return null}
  },'native renderer debugger');
  const socket=new WebSocket(targetInfo.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true})});
  let serial=0;const pending=new Map();
  socket.addEventListener('message',e=>{
    const m=JSON.parse(e.data);if(!m.id)return;const p=pending.get(m.id);if(!p)return;pending.delete(m.id);
    if(m.error)p.reject(Error(JSON.stringify(m.error)));else p.resolve(m.result);
  });
  const send=(method,params={})=>new Promise((resolve,reject)=>{
    const id=++serial;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));
  });
  const evaluate=async expression=>{
    const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
    if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result?.value;
  };
  return {socket,evaluate};
}
async function uiTest(oldRelease,newRelease){
  fs.copyFileSync(oldRelease.file,target);
  const port=19371;
  const old=await launch(previous,port);
  const client=await connect(port),ev=client.evaluate;
  const marker=crypto.randomBytes(12).toString('hex');
  await ev("localStorage.setItem('frame-update-preservation-test',"+JSON.stringify(marker)+");document.getElementById('exportFormat').value='stl';document.getElementById('exportFormat').dispatchEvent(new Event('change'))");
  await waitFor(async()=>String(await ev("document.getElementById('frame-update-banner').textContent")).includes('Available '+current),'actual stable feed banner',60000);
  checks.push({name:'previous portable app discovers actual stable release from configured feed',passed:true});
  await ev("document.querySelector('#frame-update-banner button:last-child') && Array.from(document.querySelectorAll('#frame-update-banner button')).find(x=>x.textContent==='Download').click()");
  await waitFor(async()=>String(await ev("document.getElementById('frame-update-banner').textContent")).includes('is ready to install'),'actual download and verification',120000);
  await ev("exportBusy=true;Array.from(document.querySelectorAll('#frame-update-banner button')).find(x=>x.textContent==='Install and restart').click()");
  await waitFor(async()=>String(await ev("document.getElementById('frame-update-banner').textContent")).includes('Finish the active model or export'),'active operation protection',10000);
  assert(isRunning(old.receipt.pid));await ev('exportBusy=false');
  checks.push({name:'actual install control refuses to restart during active export',passed:true});
  await ev("Array.from(document.querySelectorAll('#frame-update-banner button')).find(x=>x.textContent==='Install and restart').click()");
  // Invoke only the standard native button in this exact process.
  execFileSync('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.resolve('scripts/confirm-install-dialog.ps1'),'-ProcessIdValue',String(old.receipt.pid)],{encoding:'utf8',windowsHide:true,timeout:30000});
  const jobFile=await waitFor(()=>fs.readdirSync(storage).find(n=>/^install-[a-f0-9]{24}\.json$/.test(n)),'actual app-created install job');
  const job=JSON.parse(fs.readFileSync(path.join(storage,jobFile),'utf8'));
  client.socket.close();
  const h=await waitFor(()=>receipt(path.join(storage,'health-'+job.id+'.txt'),job.healthToken,current),'actual installed visible app');
  const result=await waitFor(()=>{try{return JSON.parse(fs.readFileSync(path.join(storage,'result-'+job.id+'.json'),'utf8'))}catch{return !fs.existsSync(path.join(storage,jobFile))&&!fs.existsSync(job.stage)&&isRunning(h.pid)?{state:'success',cleanupObserved:true}:null}},'actual installed result');
  assert.equal(result.state,'success',JSON.stringify(result));
  await waitCleanup(job);assert.equal(await hashFile(target),newRelease.info.asset.sha256);
  assert.equal(await hashFile(path.join(storage,'rollback.exe')),oldRelease.info.asset.sha256);
  await closePid(h.pid);
  const fresh=await launch(current,port+1),next=await connect(port+1);
  assert.equal(await next.evaluate("localStorage.getItem('frame-update-preservation-test')"),marker);
  assert.equal(await next.evaluate("document.getElementById('exportFormat').value"),'stl');
  const bounds=JSON.parse(fs.readFileSync(path.join(roaming,'Canvas Frame Builder','window-state.json'),'utf8'));
  assert.equal(await next.evaluate('window.outerWidth'),bounds.width);
  assert.equal(await next.evaluate('window.outerHeight'),bounds.height);
  const linkTarget=ps("$s=New-Object -ComObject WScript.Shell;$s.CreateShortcut($env:FRAME_TEST_SHORTCUT).TargetPath",{FRAME_TEST_SHORTCUT:shortcut});
  assert.equal(linkTarget.toLowerCase(),target.toLowerCase());
  next.socket.close();await closePid(fresh.receipt.pid);
  checks.push({name:'real previous-to-new UI installation preserves settings, window size, custom filename and shortcut target',passed:true});
}
(async()=>{
  const oldRelease=await release(previous),newRelease=await release(current);
  fs.copyFileSync(oldRelease.file,target);
  fs.writeFileSync(path.join(roaming,'Canvas Frame Builder','window-state.json'),JSON.stringify({x:40,y:30,width:1000,height:760}));
  ps("$s=New-Object -ComObject WScript.Shell;$l=$s.CreateShortcut($env:FRAME_TEST_SHORTCUT);$l.TargetPath=$env:FRAME_TEST_TARGET;$l.Save()",{FRAME_TEST_SHORTCUT:shortcut,FRAME_TEST_TARGET:target});
  if(mode==='direct'){
    const encodingProbe=path.join(testRoot,'encoding-probe.json');
    const expected=path.join(testRoot,'Främé.exe');
    fs.writeFileSync(encodingProbe,JSON.stringify({target:expected}),'utf8');
    const oldRead=ps("$j=Get-Content -LiteralPath $env:FRAME_ENCODING_PROBE -Raw|ConvertFrom-Json;[string]($j.target -ceq $env:FRAME_ENCODING_EXPECTED)",{FRAME_ENCODING_PROBE:encodingProbe,FRAME_ENCODING_EXPECTED:expected});
    const correctRead=ps("$j=Get-Content -LiteralPath $env:FRAME_ENCODING_PROBE -Encoding UTF8 -Raw|ConvertFrom-Json;[string]($j.target -ceq $env:FRAME_ENCODING_EXPECTED)",{FRAME_ENCODING_PROBE:encodingProbe,FRAME_ENCODING_EXPECTED:expected});
    assert.equal(oldRead,'False');assert.equal(correctRead,'True');
    checks.push({name:'Windows PowerShell encoding negative control and UTF-8 correction',passed:true});
    await transaction(previous,newRelease,{holdLock:true});
    checks.push({name:'accented custom executable filename survives installation',filename:path.basename(target),passed:true});
    // Download is intentionally cleaned after success. Reacquire and revalidate it.
    const next=await release(current);
    fs.copyFileSync(oldRelease.file,target);
    await transaction(previous,next,{interrupt:true});
    checks.push({name:'cross-volume download to target staging',crossVolume:path.parse(storage).root.toLowerCase()!==path.parse(target).root.toLowerCase(),passed:true});
  }else if(mode==='ui'){
    const checker=new UpdateCheck({installed:previous});
    const deadline=Date.now()+5*60000;
    let feed;
    while(Date.now()<deadline){
      feed=await checker.check();
      if(feed.state==='available'&&feed.info.latestVersion===current)break;
      console.log('Waiting for public stable feed:',JSON.stringify(feed));
      const pause=Math.max(60000,checker.nextAllowed-Date.now()+50);
      if(Date.now()+pause>=deadline)throw Error('Public stable feed not ready within verification window: '+JSON.stringify(feed));
      await delay(pause);
    }
    assert.equal(feed.state,'available',JSON.stringify(feed));assert.equal(feed.info.latestVersion,current);
    await uiTest(oldRelease,newRelease);
  }else throw Error('Unknown verification mode');
  assert(!fs.readdirSync(testRoot).some(n=>n.startsWith('.frame-builder-update-')));
  fs.writeFileSync(path.join(out,'hosted-update-'+mode+'.json'),JSON.stringify({version:current,previous,platform:process.platform,mode,checks,passed:true},null,2));
  console.log(JSON.stringify(checks));
})().catch(error=>{
  fs.writeFileSync(path.join(out,'hosted-update-'+mode+'.json'),JSON.stringify({version:current,previous,mode,checks,passed:false,error:error.stack},null,2));
  console.error(error.stack);process.exit(1);
});
