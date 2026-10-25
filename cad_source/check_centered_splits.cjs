/* Bed-size regression: centered assembly, paired joints, valid printable solids.
 * Run: node check_centered_splits.cjs path_to_3_50_4_Source */
'use strict';
const fs=require('node:fs'),path=require('node:path'),A=require('node:assert/strict'),crypto=require('node:crypto');
const F=require('./export_stl.cjs').load(),STEP=require('./step_export.js');
const old=process.argv[2]?require(path.resolve(process.argv[2],'export_stl.cjs')).load():null;
const root=path.resolve(__dirname,'..'),hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const report={version:'3.51.0',baseline:'3.50.4',physicalPrintTested:false,planning:[],detailed:[],legacy:[],negativeTests:[],errors:[]};
function volume(s){let v=0;for(const p of s.polygons){const a=p.vertices[0].arr();for(let i=1;i<p.vertices.length-1;i++){const b=p.vertices[i].arr(),c=p.vertices[i+1].arr();v+=(a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]))/6;}}return Math.abs(v);}
function bbox(s){const v=s.polygons.flatMap(p=>p.vertices.map(v=>v.arr()));return {min:[0,1,2].map(a=>Math.min(...v.map(p=>p[a]))),max:[0,1,2].map(a=>Math.max(...v.map(p=>p[a])))};}
function pairs(o){
 const pairs=new Map();for(let i=0;i<o.layout.cells.length;i++)for(const j of F.borderlessJoints(o,o.layout.cells[i])){
  const key=j.axis+':'+j.at.map(n=>n.toFixed(5)).join(',');if(!pairs.has(key))pairs.set(key,[]);pairs.get(key).push({...j,i});
 }
 for(const p of pairs.values()){A.equal(p.length,2);A.equal(p.filter(j=>j.kind==='male').length,1);A.equal(p.filter(j=>j.kind==='female').length,1);A.notEqual(p[0].i,p[1].i);A.equal(p[0].height,p[1].height);}
 A.equal(pairs.size,o.frameJointCount);return pairs.size;
}
function planning(){
 const sizes=[[80,80],[101.6,152.4],[127,177.8],[203.2,254],[228.6,304.8],[279.4,355.6],[304.8,406.4],[406.4,508],[457.2,609.6],[317.4,241.9],[600,800],[1000,1000]];
 for(const [w,h] of sizes)for(const bed of [180,220,256,300])for(const standType of ['none','breakaway']){
  const input={frameStyle:'borderless',w,h,bedX:bed,bedY:bed,standType,printedPanel:true};let o;
  try{o=F.derive(input);}catch(e){
   A(/easel cannot fit|maximum of 64|No safe frame division|No supported|Panel cannot be divided/.test(e.message),e.message);
   report.planning.push({w,h,bed,standType,status:'safely_rejected',reason:e.message});continue;
  }
  A.equal(o.ow/2,o.frameCenter.x);A.equal(o.oh/2,o.frameCenter.y);A.equal(o.hangerLocations[0].at[0],o.ow/2);A.equal(o.hangerLocations[1].at[1],o.oh/2);
  A.equal(o.hangerLocations[0].entryInset_mm,22);A.equal(o.hangerLocations[1].entryInset_mm,22);A.equal(o.t,3);
  for(const c of o.layout.cells)A(F.bedRotation(c.dx,c.dy,o)!==null);
  report.planning.push({w,h,bed,standType,status:'passed',frameSections:o.count,panelTiles:o.panelCount,matchedJoints:pairs(o),center:o.frameCenter,parking:o.standParking?.rotationDegrees??(o.includeStand?'established':null)});
 }
 console.log('PLANNING',report.planning.length,'configurations');
}
function measureCrossbar(o,solids,axis){
 const normal=1-axis,M=axis?o.oh:o.ow,N=normal?o.oh:o.ow;
 for(const fraction of [.27,.37,.63,.73]){
  const at=M*fraction,z=o.d-o.backThickness+1;
  const min=axis===0?[at,o.rearRail+1,z]:[o.rearRail+1,at,z];
  const size=axis===0?[.25,N-2*(o.rearRail+1),.4]:[N-2*(o.rearRail+1),.25,.4];
  const slab=F.evaluate(F.box(...min,...size)),chunks=solids.map(s=>s.intersect(slab)).filter(s=>volume(s)>1e-7);
  if(!chunks.length)continue;
  const bb=chunks.map(bbox),low=Math.min(...bb.map(b=>b.min[normal])),high=Math.max(...bb.map(b=>b.max[normal]));
  if(Math.abs(low-(N-o.crossWidth)/2)<2e-5&&Math.abs(high-(N+o.crossWidth)/2)<2e-5)return {center_mm:(low+high)/2,width_mm:high-low,sampleAt_mm:at};
 }
 throw Error('Could not verify centered crossbar in actual assembly');
}
function detailed(){
 const cases=[...[180,220,256,300].map(b=>({w:203.2,h:254,bedX:b,bedY:b})),
  {w:279.4,h:355.6,bedX:180,bedY:180},{w:304.8,h:406.4,bedX:180,bedY:180},
  {w:406.4,h:508,bedX:180,bedY:180},{w:457.2,h:609.6,bedX:220,bedY:220},
  {w:317.4,h:241.9,bedX:180,bedY:180,displayOrientation:'landscape'},
  {w:203.2,h:254,bedX:180,bedY:220,displayOrientation:'landscape'},
  {w:203.2,h:254,bedX:256,bedY:256,customMargins:true,marginLeft:8,marginRight:5,marginFront:20,marginBack:4},
  {w:127,h:177.8,bedX:180,bedY:180,t:12,borderlessBack:5,kc:.35},
  {w:127,h:177.8,bedX:180,bedY:180,kc:.04,borderlessRim:2.4,pc:.75,borderlessOverlap:.6},
  {w:80,h:80,bedX:180,bedY:180,standType:'none'}];
 for(const input of cases){
  console.log('DETAIL',JSON.stringify(input));
  const m=F.make({frameStyle:'borderless',printedPanel:true,...input}),o=m.params,cache=new WeakMap(),parts=[],solids=[],boxes=[];
  const oldm=old?(()=>{try{return old.make({frameStyle:'borderless',printedPanel:true,...input});}catch(_){return null;}})():null;
  let unchanged=true;
  for(const p of m.parts){
   const mesh=F.mesh(p.spec,cache),pm=F.printMesh(mesh,o,p),b=F.bounds(pm),top=STEP.topology(mesh);F.validatePanelFront(p,mesh,o);
   A(b.min.every(n=>Math.abs(n)<1e-5));A(b.size[0]<=o.usableX+1e-5&&b.size[1]<=o.usableY+1e-5);A(top.volume>0);
   const oldp=oldm?.parts.find(j=>j.name===p.name);if(!oldp||hash(oldp.spec)!==hash(p.spec))unchanged=false;
   parts.push({name:p.name,type:p.type,printSize:b.size,triangles:mesh.faces.length,closedConnectedCADShell:true,healed:top.repaired,volume:top.volume});
   if(p.type==='frame'){
    const solid=F.evaluate(p.displaySpec||p.spec,cache);solids.push(solid);boxes.push(bbox(solid));
    const ex=F.previewOffset(p,o,28),c=p.displayCell||p.cell,expected=[Math.abs(c.x+c.w/2-o.ow/2)<.1?0:Math.sign(c.x+c.w/2-o.ow/2)*28,Math.abs(c.y+c.h/2-o.oh/2)<.1?0:Math.sign(c.y+c.h/2-o.oh/2)*28,0];
    A.equal(JSON.stringify(ex),JSON.stringify(expected));A.equal(JSON.stringify(F.previewOffset(p,o,0)),'[0,0,0]');
    if(o.includeStand){A(Math.abs(p.cell.x+p.cell.w+p.displayCell.x-o.ow)<1e-6);A(Math.abs(p.cell.y+p.cell.h+p.displayCell.y-o.oh)<1e-6);}
   }
  }
  let testedPairs=0,maxOverlap=0;
  for(let i=0;i<solids.length;i++)for(let j=i+1;j<solids.length;j++){
   if(boxes[i].min.some((n,k)=>n>boxes[j].max[k]+1e-6||boxes[i].max[k]<boxes[j].min[k]-1e-6))continue;
   const v=volume(solids[i].intersect(solids[j]));maxOverlap=Math.max(maxOverlap,v);A(v<1e-4,'Overlapping frame sections '+v);testedPairs++;
  }
  const crossbars={vertical:measureCrossbar(o,solids,1),horizontal:measureCrossbar(o,solids,0)};
  const footprint=boxes.reduce((a,b)=>({min:a.min.map((n,i)=>Math.min(n,b.min[i])),max:a.max.map((n,i)=>Math.max(n,b.max[i]))}),{min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]});
  A(Math.abs(footprint.min[0])<1e-5&&Math.abs(footprint.min[1])<1e-5);A(Math.abs(footprint.max[0]-o.ow)<1e-5&&Math.abs(footprint.max[1]-o.oh)<1e-5);
  report.detailed.push({input,frameSections:o.count,panelTiles:o.panelCount,matchedJointPairs:pairs(o),parts,intersectingBoundsPairsChecked:testedPairs,maxFrameOverlap_mm3:maxOverlap,crossbars,assembledFrameBounds:footprint,printGeometrySameAs3504:unchanged});
  fs.writeFileSync(path.join(root,'Validation/Centered_Split_Checks.json'),JSON.stringify(report,null,2));
 }
}
function negative(){
 const o=F.derive({frameStyle:'borderless',bedX:180,bedY:180}),bad=JSON.parse(JSON.stringify(o.layout));bad.cells.pop();A.throws(()=>F.borderlessValidateLayout(o,bad),/Unsafe frame division/);report.negativeTests.push('Missing matching receiver/section is rejected');
 const altered={...o,hangerLocations:[{...o.hangerLocations[0],at:[o.ow/2+1,o.hangerLocations[0].at[1]]},o.hangerLocations[1]]};A.throws(()=>F.borderlessValidateLayout(altered,o.layout),/not centered/);report.negativeTests.push('Off-center hanger axes are rejected');
 const j=o.frameConnectors[0],conflict={...o,hangerLocations:[{at:j.at,angle:j.axis==='x'?90:0}]};A.throws(()=>F.borderlessValidateLayout(conflict,o.layout),/shared hanger/);report.negativeTests.push('Receiver envelope crossing a connector is rejected');
}
try{
 planning();detailed();negative();
 if(old)for(const style of ['original','solid','light'])for(const stand of ['none','rigid','fold']){
  const p={frameStyle:style,standType:stand,printedPanel:true},a=old.make(p),b=F.make(p);A.equal(hash(a),hash(b));report.legacy.push({style,stand,completeGeometrySpecificationUnchanged:true});
 }
 report.summary={planned:report.planning.length,accepted:report.planning.filter(c=>c.status==='passed').length,safelyRejected:report.planning.filter(c=>c.status==='safely_rejected').length,detailedConfigurations:report.detailed.length,closedPrintableParts:report.detailed.reduce((s,c)=>s+c.parts.length,0),legacyCombinationsUnchanged:report.legacy.length};
 console.log('PASS',JSON.stringify(report.summary));
}catch(e){report.errors.push(e.stack);console.error(e.stack);process.exitCode=1;}
finally{fs.writeFileSync(path.join(root,'Validation/Centered_Split_Checks.json'),JSON.stringify(report,null,2));}
