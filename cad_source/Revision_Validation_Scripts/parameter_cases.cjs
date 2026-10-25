const fs=require('fs'),path=require('path');
const W=process.argv[2]?path.resolve(process.argv[2]):path.resolve(__dirname,'../../..');
const F=require(path.join(W,'Canvas_Frame_v3_50_8/Source/export_stl.cjs')).load();
const cases=[];
for(const H of [1.2,1.6,2.4,3.2,4,5])for(const bias of [0,.5,.6]){
 const o=F.derive({frameStyle:'borderless',hangerThickness:H,borderlessBase:Math.min(H,1.6),latchSpringBias:bias});
 cases.push({H,bias,base:o.borderlessBase,params:o,stand:F.borderlessStandLocal(o),seated:F.borderlessStandLocal(o,'seated')});
}
fs.writeFileSync(W+'/parameter_cases.json',JSON.stringify(cases));
for(const bed of [180,220,256,300]){
 const p={frameStyle:'borderless',printedPanel:true,bedX:bed,bedY:bed};
 fs.writeFileSync(W+'/full_'+bed+'.json',JSON.stringify(F.make(p)));
}
fs.writeFileSync(W+'/full_thick_hanger.json',JSON.stringify(F.make({frameStyle:'borderless',hangerThickness:5,borderlessBack:3.2,printedPanel:false,bedX:300,bedY:300})));
