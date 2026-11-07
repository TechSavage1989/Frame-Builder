'use strict';
// Development-only: supply Playwright; optionally set PLAYWRIGHT_CHROMIUM_EXECUTABLE.
const assert=require('node:assert/strict'),fs=require('node:fs');
const path=require('node:path'),{execFileSync}=require('node:child_process');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
const root=path.resolve(__dirname,'..'),baselineRef=process.argv[2]||'v3.51.15';
fs.mkdirSync(path.join(root,'validation/runtime/baseline'),{recursive:true});
for(const name of ['index.html','desktop-ui.js'])fs.writeFileSync(path.join(root,'validation/runtime/baseline',name),execFileSync('git',['show',baselineRef+':app/'+name],{cwd:root,maxBuffer:2*1024*1024}));
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||undefined,headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader']});
 const results={};
 for(const [name,file] of [['baseline','validation/runtime/baseline/index.html'],['updated','app/index.html']]){
  const page=await browser.newPage({viewport:{width:1440,height:960}});const errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.goto('file://'+root+'/'+file);
  await page.waitForFunction(()=>CanvasFrameViewer.getState().status==='ready',null,{timeout:120000});
  results[name]=[];
  for(const [style,w,h] of [['original',203.2,254],['solid',203.2,254],['light',203.2,254],['borderless',203.2,254],['light',457.2,609.6]]){
   await page.evaluate(({style,w,h})=>{
    window.gaps=[];window.lastTick=performance.now();window.monitor=setInterval(()=>{const now=performance.now();gaps.push(now-lastTick);lastTick=now;},16);window.started=performance.now();
    $('frameStyle').value=style;$('w').value=w;$('h').value=h;update();
   },{style,w,h});
   await page.waitForFunction(()=>CanvasFrameViewer.getState().status==='ready',null,{timeout:120000});
   const result=await page.evaluate(async()=>{
    clearInterval(monitor);const state=CanvasFrameViewer.getState();
    const meshes=await Promise.all(CanvasFrameViewer.getMeshes().map(async p=>({name:p.name,hash:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',FrameV3.binarySTL(p.printMesh)))).map(b=>b.toString(16).padStart(2,'0')).join(''),size:p.printBounds.size})));
    return {style:state.params.frameStyle,w:state.params.w,h:state.params.h,engine:state.previewEngine||'main-thread',elapsedMs:Math.round(performance.now()-started),maxUiGapMs:Math.round(Math.max(...gaps)),triangles:state.triangles,meshes};
   });results[name].push(result);console.log(name,JSON.stringify({...result,meshes:result.meshes.length}));
  }
  assert.deepEqual(errors,[]);await page.close();
 }
 for(let i=0;i<results.baseline.length;i++){assert.deepEqual(results.updated[i].meshes,results.baseline[i].meshes);assert.equal(results.updated[i].triangles,results.baseline[i].triangles);}
 fs.writeFileSync(root+'/validation/runtime/preview-comparison.json',JSON.stringify(results,null,2));console.log('All five model and STL comparisons match.');await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
