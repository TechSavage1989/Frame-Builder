'use strict';
const assert=require('node:assert/strict');

// Run against a real browser/Electron renderer, including its actual Blob worker.
module.exports=async function previewIntegration(evaluate,waitFor){
 const checks=[];
 assert.equal(await evaluate('CanvasFrameViewer.getState().previewEngine'),'worker');
 await evaluate(`window.previewTest={width:$('w').value,style:$('frameStyle').value,Worker:window.Worker,ticks:0};
   $('frameStyle').value='light';$('w').value='220';update();
   previewTest.timer=setInterval(()=>{if(canvas.dataset.previewStatus==='updating')previewTest.ticks++;},16);`);
 assert.equal(await evaluate("$('download').disabled && canvas.getAttribute('aria-busy')==='true'"),true);
 // Wait until the first worker has started, then supersede it while it builds.
 await waitFor(()=>evaluate('previewBusy'),'active preview worker');
 await evaluate("$('w').value='205';$('w').dispatchEvent(new Event('input'))");
 await waitFor(()=>evaluate("CanvasFrameViewer.getState().status==='ready' && CanvasFrameViewer.getState().params.w===205"),'latest edit wins');
 const ticks=await evaluate('clearInterval(previewTest.timer);previewTest.ticks');
 assert(ticks>=3,'UI timers must keep running during worker generation');
 assert.equal(await evaluate("!$('download').disabled && canvas.getAttribute('aria-busy')==='false'"),true);
 checks.push({name:'background preview stays responsive, cancels stale builds and guards exports',ticks,passed:true});

 const coalesced=await evaluate(`previewTest.model=MODEL;previewTest.raw=RAW;previewTest.scene=SCENE;
   for(let i=1;i<=25;i++){$('explode').value=String(i);$('explode').dispatchEvent(new Event('input'));}
   SCENE===previewTest.scene;`);
 assert.equal(coalesced,true,'slider input should coalesce before the next animation frame');
 await waitFor(()=>evaluate('SCENE!==previewTest.scene'),'batched exploded view');
 assert.equal(await evaluate("MODEL===previewTest.model && RAW===previewTest.raw && $('explodeValue').textContent==='25 mm'"),true);
 checks.push({name:'exploded-view input coalesces without rebuilding geometry',passed:true});

 await evaluate("$('w').value='0';$('w').dispatchEvent(new Event('input'))");
 await waitFor(()=>evaluate("CanvasFrameViewer.getState().status==='invalid'"),'invalid dimensions');
 assert.equal(await evaluate("$('download').disabled && MODEL===previewTest.model && $('err').textContent.length>0"),true);
 await evaluate("$('w').value='205';update()");
 await waitFor(()=>evaluate("CanvasFrameViewer.getState().status==='ready'"),'valid dimensions restored');
 assert.equal(await evaluate("$('err').textContent==='' && !$('download').disabled"),true);
 checks.push({name:'invalid dimensions retain last valid model and recover cleanly',passed:true});

 const hashes=`Promise.all(RAW.map(async p=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',FrameV3.binarySTL(p.printMesh)))).join(',')))`;
 const workerHashes=await evaluate(hashes);
 await evaluate('window.Worker=undefined;update()');
 await waitFor(()=>evaluate("CanvasFrameViewer.getState().status==='ready'"),'worker-unavailable fallback');
 assert.equal(await evaluate('CanvasFrameViewer.getState().previewEngine'),'cooperative');
 assert.deepEqual(await evaluate(hashes),workerHashes,'fallback must export the same STL bytes');
 await evaluate("window.Worker=previewTest.Worker;$('w').value=previewTest.width;$('frameStyle').value=previewTest.style;delete window.previewTest;update()");
 await waitFor(()=>evaluate("CanvasFrameViewer.getState().status==='ready'"),'worker restored');
 assert.equal(await evaluate('CanvasFrameViewer.getState().previewEngine'),'worker');
 checks.push({name:'worker fallback preserves exact STL output and recovers',passed:true});
 return checks;
};
