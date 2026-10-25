'use strict';
// Development entry point, excluded from the portable application.
const {app,BrowserWindow,session}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {bindUpdateSchedule}=require('../app/update-scheduler.cjs');
const root=path.resolve(__dirname,'..'),out=path.join(root,'validation/runtime');
fs.mkdirSync(out,{recursive:true});
const errors=[],downloads=[],checks=[];
const delay=ms=>new Promise(r=>setTimeout(r,ms));
let main,controller;
const expiry=setTimeout(()=>finish(Error('Native integration timeout')),480000);
function finish(error){
  clearTimeout(expiry);
  const result={version:require('../package.json').version,platform:process.platform,electron:process.versions.electron,
    checks,errors,error:error?.stack||null};
  fs.writeFileSync(path.join(out,'native-integration.json'),JSON.stringify(result,null,2));
  if(error)console.error(error.stack);
  app.exit(error?1:0);
}
async function waitFor(fn,label,timeout=90000){
  const until=Date.now()+timeout;
  while(Date.now()<until){if(await fn())return;await delay(100)}
  throw Error('Timed out: '+label);
}
async function run(win){
  const evaluate=code=>win.webContents.executeJavaScript(code,true);
  await waitFor(()=>evaluate("Boolean(window.CanvasFrameViewer && CanvasFrameViewer.getState().status==='ready')"),'initial preview');
  assert(win.isVisible());assert.equal(await evaluate('typeof require'),'undefined');
  console.log('Native progress:',new Date().toISOString());checks.push({name:'visible responsive isolated window',passed:true});
  const updater=controller.getUpdater();
  let now=Date.now();
  updater.fetcher=async()=>{throw Object.assign(Error('network unavailable'),{status:429,retryAfter:'120'})};
  const failure=await updater.check(true);
  assert.equal(failure.state,'error');
  const cooldown=await updater.check(true);
  assert.equal(cooldown.state,'cooldown');assert(updater.nextAllowed>=now+120000);
  assert(!(await evaluate("document.getElementById('frame-update-banner').textContent")).includes('up to date'));
  console.log('Native progress:',new Date().toISOString());checks.push({name:'native IPC banner reports failed check and Retry-After cooldown',passed:true});
  // Restore no automatic network test state. Normal source runs have no packaged schedule.
  for(const style of ['original','solid','light','borderless']){
    await evaluate("document.getElementById('frameStyle').value="+JSON.stringify(style)+";document.getElementById('frameStyle').dispatchEvent(new Event('change'))");
    await waitFor(()=>evaluate("CanvasFrameViewer.getState().status==='ready' && CanvasFrameViewer.getState().params.frameStyle==="+JSON.stringify(style)),style+' geometry');
    const state=await evaluate('CanvasFrameViewer.getState()');
    assert(state.triangles>0);assert(state.parts>0);
    console.log('Native progress:',new Date().toISOString());checks.push({name:style+' native 3D preview',triangles:state.triangles,passed:true});
  }
  await evaluate("document.getElementById('frameSpringsEnabled').checked=false;document.getElementById('frameSpringsEnabled').dispatchEvent(new Event('change'))");
  await waitFor(()=>evaluate("CanvasFrameViewer.getState().status==='ready' && CanvasFrameViewer.getState().params.frameSpringsEnabled===false"),'springs disabled');
  assert.equal(await controller.operationBusy(),false);
  await evaluate('exportBusy=true');
  assert.equal(await controller.operationBusy(),true);
  await evaluate('exportBusy=false');
  console.log('Native progress:',new Date().toISOString());checks.push({name:'spring option and active-operation guard',passed:true});
  await evaluate("document.getElementById('detachViewer').click()");
  await waitFor(()=>evaluate("CanvasFrameWorkspace.getState().mode==='detached'"),'detached viewer',10000);
  assert(BrowserWindow.getAllWindows().some(w=>w!==win));
  await evaluate("document.getElementById('returnViewer').click()");
  await waitFor(()=>evaluate("CanvasFrameWorkspace.getState().mode==='embedded'"),'returned viewer',10000);
  console.log('Native progress:',new Date().toISOString());checks.push({name:'detached viewer and return',passed:true});
  session.defaultSession.on('will-download',(_e,item)=>{
    item.setSavePath(path.join(out,path.basename(item.getFilename())));
    item.once('done',(_e,state)=>downloads.push({file:item.getSavePath(),state}));
  });
  async function exportFile(code,ext){
    const n=downloads.length;await evaluate(code);
    await waitFor(()=>downloads.length>n,ext+' native export',120000);
    const file=downloads.at(-1);
    assert.equal(file.state,'completed');assert.equal(path.extname(file.file).toLowerCase(),ext);
    const data=fs.readFileSync(file.file);assert(data.length>100);
    if(ext==='.stl')assert.equal(data.length,84+50*data.readUInt32LE(80));
    if(ext==='.step')assert(data.toString('utf8').startsWith('ISO-10303-21;'));
    if(ext==='.3mf')assert.equal(data.readUInt32LE(0),0x04034b50);
    console.log('Native progress:',new Date().toISOString());checks.push({name:ext+' export through native download handler',bytes:data.length,passed:true});
  }
  await exportFile("document.getElementById('partSelect').value='0';document.getElementById('partSelect').dispatchEvent(new Event('change'));document.getElementById('dlpart').click()",'.stl');
  await exportFile("document.getElementById('downloadSTEPPart').click()",'.step');
  await exportFile("document.getElementById('exportFormat').value='3mf';document.getElementById('exportFormat').dispatchEvent(new Event('change'));document.getElementById('frameJointTest').click()",'.3mf');
  await waitFor(()=>evaluate("document.getElementById('exportStatus').textContent.startsWith('Saved:')"),'native save status');
  if(process.argv.includes('--reuse-validated-timers')&&/^[a-f0-9]{40}$/.test(process.env.FRAME_TIMERS_VALIDATED_COMMIT||'')){
    checks.push({name:'unchanged production timer validation reused',sourceCommit:process.env.FRAME_TIMERS_VALIDATED_COMMIT,passed:true});
    assert.equal(errors.length,0,JSON.stringify(errors));finish();return;
  }
  // This uses the actual five-minute and two-minute production values, actual
  // Electron windows, and wall-clock delays. It does not replace the clock.
  const events=[],start=Date.now();
  const checker={lastAt:0,check(){this.lastAt=Date.now();events.push(this.lastAt-start)}};
  const stop=bindUpdateSchedule({window:win,checker});
  assert.equal(events.length,1);
  const other=new BrowserWindow({width:300,height:200,show:true});
  await other.loadURL('about:blank');other.focus();
  await waitFor(()=>!win.isFocused(),'native blur',10000);
  await delay(Math.max(0,120700-(Date.now()-start)));
  win.focus();
  await waitFor(()=>events.length>=2,'two-minute focus return',10000);
  assert(events[1]>=120000&&events[1]<145000);
  other.show();other.focus();
  await waitFor(()=>!win.isFocused(),'native background window',10000);
  await waitFor(()=>events.length>=3,'real five-minute background timer',210000);
  assert(events[2]>=299000&&events[2]<325000);
  stop();other.close();
  console.log('Native progress:',new Date().toISOString());checks.push({name:'production two-minute focus and five-minute unfocused native timer',elapsedMilliseconds:events,passed:true});
  assert.equal(errors.length,0,JSON.stringify(errors));
  console.log(JSON.stringify(checks));finish();
}
app.on('browser-window-created',(_e,win)=>{
  if(main)return;main=win;
  win.webContents.on('render-process-gone',(_e,d)=>finish(Error('Renderer exited: '+JSON.stringify(d))));
  win.webContents.on('console-message',(_e,d)=>{
    const level=typeof d==='object'?d.level:null,message=typeof d==='object'?d.message:'';
    if(level==='error'&&!/GPU|WebGL|SharedImage|GL_INVALID|ContextResult/.test(message))errors.push(message);
  });
  win.webContents.once('did-finish-load',()=>run(win).catch(finish));
});
controller=require('../app/main.cjs');
