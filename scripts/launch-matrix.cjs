'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {spawn,execFileSync}=require('node:child_process');
if(process.platform!=='win32'||process.env.GITHUB_ACTIONS!=='true')throw Error('Isolated Windows CI only');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const root=path.resolve('validation/runtime');fs.mkdirSync(root,{recursive:true});
const source=path.resolve('validation/fixture/Frame_Builder_3.51.10_Windows_x64.exe');
const target=path.join(root,'Frame Probe.exe');fs.copyFileSync(source,target);
const storage=path.join(execFileSync('powershell.exe',['-NoProfile','-Command',"[Environment]::GetFolderPath([Environment+SpecialFolder]::ApplicationData)"],{encoding:'utf8'}).trim(),'Canvas Frame Builder','updates');fs.mkdirSync(storage,{recursive:true});
const id=crypto.randomBytes(12).toString('hex'),health=path.join(storage,'health-'+id+'.txt');
const appProcess=spawn(target,['--inspect=127.0.0.1:19395'],{stdio:'ignore',env:{...process.env,FRAME_BUILDER_HEALTH_FILE:health,FRAME_BUILDER_HEALTH_TOKEN:crypto.randomBytes(24).toString('hex')}});
async function waitFor(fn,ms=45000){const end=Date.now()+ms;while(Date.now()<end){const r=await fn();if(r)return r;await delay(100)}throw Error('Probe timed out')}
(async()=>{
 await waitFor(()=>fs.existsSync(health));
 const endpoint=await waitFor(async()=>{try{return (await(await fetch('http://127.0.0.1:19395/json/list')).json())[0]}catch{return null}});
 const ws=new WebSocket(endpoint.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});
 let serial=0;const pending=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data),p=pending.get(m.id);if(p){pending.delete(m.id);p(m)}};
 const ev=expression=>new Promise(resolve=>{const id=++serial;pending.set(id,resolve);ws.send(JSON.stringify({id,method:'Runtime.evaluate',params:{expression,returnByValue:true,awaitPromise:true}}))}).then(m=>{if(m.error||m.result?.exceptionDetails)throw Error(JSON.stringify(m));return m.result?.result?.value});
 console.log('Main process:',await ev("({version:process.mainModule.require('electron').app.getVersion(),pid:process.pid,main:process.mainModule.filename})"));
 const results=[];
 for(const variant of [{name:'legacy-detached-ignore',detached:true,file:false},{name:'current-detached-file',detached:true,file:true},{name:'attached-file',detached:false,file:true}]){
  const input={source,target,storage,...variant};
  const job=await ev(`(()=>{const q=${JSON.stringify(input)};const req=process.mainModule.require.bind(process.mainModule),fs=req('node:fs'),path=req('node:path'),crypto=req('node:crypto');const id=crypto.randomBytes(12).toString('hex');const sha=crypto.createHash('sha256').update(fs.readFileSync(q.source)).digest('hex');const payload=path.join(q.storage,'update-'+sha+'.exe');fs.copyFileSync(q.source,payload);const job={appId:'com.techsavage3d.canvasframe',id,target:q.target,storage:q.storage,payload,version:'3.51.10',sha256:sha,oldSha256:sha,healthToken:crypto.randomBytes(24).toString('hex'),parentPid:process.pid,stage:path.join(path.dirname(q.target),'.frame-builder-update-'+id)};const jf=path.join(q.storage,'install-'+id+'.json'),helper=path.join(q.storage,'helper-'+id+'.ps1'),log=path.join(q.storage,'helper-'+id+'.log');fs.writeFileSync(jf,JSON.stringify(job));fs.writeFileSync(helper,fs.readFileSync(path.join(req('electron').app.getAppPath(),'app','update-install.ps1')));let fd;try{if(q.file)fd=fs.openSync(log,'wx');global.__probe=req('node:child_process').spawn(path.join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe'),['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',helper,'-JobFile',jf],{detached:q.detached,windowsHide:true,stdio:q.file?['ignore',fd,fd]:'ignore'});global.__probeError=null;global.__probe.on('error',e=>global.__probeError=e.message);global.__probe.unref()}finally{if(fd!==undefined)fs.closeSync(fd)}return {id,pid:global.__probe.pid,stage:job.stage,log}})()`);
  let outcome;
  try{outcome=await waitFor(async()=>{const state=await ev('({code:global.__probe.exitCode,error:global.__probeError})');return fs.existsSync(path.join(storage,'ready-'+job.id+'.json'))?{ready:true,...state}:state.code!==null||state.error?{ready:false,...state}:null},20000)}catch(e){outcome={ready:false,error:e.message}}
  fs.writeFileSync(path.join(storage,'abort-'+job.id),'');
  await delay(1400);
  const text=fs.existsSync(job.log)?fs.readFileSync(job.log,'utf8'):null;
  results.push({variant:variant.name,...outcome,output:text});console.log(JSON.stringify(results.at(-1)));
 }
 fs.writeFileSync(path.join(root,'launch-matrix.json'),JSON.stringify(results,null,2));
 ws.close();execFileSync('powershell.exe',['-NoProfile','-Command',`(Get-Process -Id ${JSON.parse(fs.readFileSync(health,'utf8')).pid}).CloseMainWindow()|Out-Null`]);
 if(!results.some(x=>x.ready))process.exit(1);
})().catch(e=>{console.error(e);appProcess.kill();process.exit(1)});
