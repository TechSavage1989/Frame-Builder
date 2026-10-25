'use strict';
const assert=require('assert');
const F=require('./frame_geometry.js');
const styles=['original','solid','light','borderless'];
const report={version:'3.51.1',passed:true,styles:{}};
for(const style of styles){
 const rows=[];
 const base={frameStyle:style,w:203.2,h:254,t:3,b:12,ov:2,pc:.35,kc:.16,rg:.2,printedPanel:false,standType:'none',includeStand:false,margin:3,customMargins:false};
 // All four styles expose and honor manual 1/2/4 choices on a bed where they fit.
 const one=F.derive({...base,bedX:300,bedY:300,sectionMode:'1',twoPartDirection:'auto'});
 assert.strictEqual(one.count,1);
 for(const dir of ['horizontal','vertical']){
   const o=F.derive({...base,bedX:300,bedY:300,sectionMode:'2',twoPartDirection:dir});
   assert.strictEqual(o.count,2);assert.strictEqual(dir==='horizontal'?o.ny:o.nx,2);
   rows.push({bed:300,mode:'2',direction:dir,count:o.count,grid:[o.nx,o.ny]});
 }
 const four=F.derive({...base,bedX:300,bedY:300,sectionMode:'4',twoPartDirection:'auto'});
 assert.strictEqual(four.count,4);assert.strictEqual(four.nx,2);assert.strictEqual(four.ny,2);
 // Automatic remains the fewest valid layout for each tested bed.
 for(const bed of [180,220,256,300]){
   const auto=F.derive({...base,bedX:bed,bedY:bed,sectionMode:'auto',twoPartDirection:'auto'});
   let validCounts=[];
   for(const mode of ['1','2','4']){
     try{validCounts.push(F.derive({...base,bedX:bed,bedY:bed,sectionMode:mode,twoPartDirection:'auto'}).count);}catch(_){ }
   }
   assert(validCounts.length>0,style+' has no tested manual layout at '+bed);
   assert.strictEqual(auto.count,Math.min(...validCounts),style+' auto must choose fewest valid tested section count');
   rows.push({bed,mode:'auto',count:auto.count,grid:[auto.nx,auto.ny],validManualCounts:validCounts});
 }
 report.styles[style]=rows;
}
console.log(JSON.stringify(report,null,2));
