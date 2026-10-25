'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawn,execFileSync}=require('node:child_process');
if(process.platform!=='win32'||process.env.GITHUB_ACTIONS!=='true')throw Error('CI Windows probe only');
const ps=code=>execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',code],{encoding:'utf8',windowsHide:true}).trim();
const root=path.resolve('validation/runtime');fs.mkdirSync(root,{recursive:true});
const source=path.resolve(process.env.INSTALLER_PROBE_EXE);
const roaming=ps("[Environment]::GetFolderPath([Environment+SpecialFolder]::ApplicationData)");
const storage=path.join(roaming,'Canvas Frame Builder','updates');fs.mkdirSync(storage,{recursive:true});
const target=path.join(root,'Främé probe.exe');fs.copyFileSync(source,target);
const sha=crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex');
const payload=path.join(storage,'update-'+sha+'.exe');fs.copyFileSync(source,payload);
const id=crypto.randomBytes(12).toString('hex');
const job={appId:'com.techsavage3d.canvasframe',id,target,storage,payload,version:'3.51.7',sha256:sha,oldSha256:sha,
  healthToken:crypto.randomBytes(24).toString('hex'),parentPid:process.pid,stage:path.join(root,'.frame-builder-update-'+id)};
const jf=path.join(storage,'install-'+id+'.json'),helper=path.join(storage,'helper-'+id+'.ps1');
fs.writeFileSync(jf,JSON.stringify(job));fs.copyFileSync('app/update-install.ps1',helper);
const child=spawn('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',helper,'-JobFile',jf],{windowsHide:true});
let stdout='',stderr='',exitCode=null;
child.stdout.on('data',x=>stdout+=x);child.stderr.on('data',x=>stderr+=x);child.on('exit',c=>exitCode=c);
const delay=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const end=Date.now()+45000;
 let ready=false,result=null;
 while(Date.now()<end){
  if(fs.existsSync(path.join(storage,'ready-'+id+'.json'))){ready=true;break}
  if(fs.existsSync(path.join(storage,'result-'+id+'.json'))){result=JSON.parse(fs.readFileSync(path.join(storage,'result-'+id+'.json'),'utf8'));break}
  if(exitCode!==null)break;
  await delay(100);
 }
 fs.writeFileSync(path.join(storage,'abort-'+id),'');
 if(ready){for(let i=0;i<100&&exitCode===null;i++)await delay(100)}
 if(fs.existsSync(path.join(storage,'result-'+id+'.json')))result=JSON.parse(fs.readFileSync(path.join(storage,'result-'+id+'.json'),'utf8'));
 const report={ready,exitCode,result,stdout,stderr,log:fs.existsSync(path.join(storage,'install.log'))?fs.readFileSync(path.join(storage,'install.log'),'utf8'):null};
 fs.writeFileSync(path.join(root,'installer-preflight-probe.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify(report,null,2));
 if(exitCode===null)child.kill();
 if(!ready)process.exit(1);else process.exit(0);
})().catch(e=>{console.error(e);process.exit(1)});
