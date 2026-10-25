'use strict';
const {execFileSync,spawnSync}=require('node:child_process');
let reuse=null;
try{
  const parent=execFileSync('git',['rev-parse','HEAD^'],{encoding:'utf8'}).trim();
  const names=execFileSync('git',['diff','--name-only','HEAD^','HEAD'],{encoding:'utf8'}).trim().split('\n').filter(Boolean);
  const changed=names.some(p=>(p.startsWith('app/')&&p!=='app/update-install.ps1')||/^(browser|cad_source|assets)\//.test(p)||['package.json','package-lock.json'].includes(p));
  if(!changed){
    const repo=process.env.GITHUB_REPOSITORY;
    const runs=JSON.parse(execFileSync('gh',['api','repos/'+repo+'/actions/workflows/ci.yml/runs?head_sha='+parent+'&status=success&per_page=10'],{encoding:'utf8'}));
    if(runs.workflow_runs.some(r=>r.head_sha===parent&&r.conclusion==='success'))reuse=parent;
  }
}catch{/* Without proof, run the complete wall-clock suite again. */}
console.log(reuse?'Reuse unchanged production timer validation from '+reuse:'Run full production window/timer suite');
const args=['node_modules/electron/cli.js','scripts/native-integration.cjs'];
if(reuse)args.push('--reuse-validated-timers');
const result=spawnSync(process.execPath,args,{stdio:'inherit',env:{...process.env,FRAME_TIMERS_VALIDATED_COMMIT:reuse||''}});
process.exit(result.status??1);
