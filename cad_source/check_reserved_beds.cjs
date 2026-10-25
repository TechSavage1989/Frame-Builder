/* Reserved-area unit and placement checks. No slicer/toolhead simulation. */
'use strict';
const A=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const Safety=require('./bed_safety.js'),B=require('./bambu_template.js'),base=require('./bambu_base_project.js'),P=require('./plate_layout.js'),F=require('./export_stl.cjs').load();
const checks=[],info=B.validate(base),o={bedX:256,bedY:256,usableX:250,usableY:250,margin:3,margins:{left:3,right:3,front:3,back:3}},safe=Safety.resolve(o,info);
const box=(w,h,z=3)=>F.mesh({op:'box',min:[0,0,0],size:[w,h,z]}),raw=(n,w,h,type='test')=>({name:n,type,printMesh:box(w,h)});
(async()=>{
 A.equal(safe.frontReserved_mm,20);A.equal(safe.toolpathPadding_mm,7.1);A.equal(safe.brimSkirtAllowance_mm,5.1);
 A(safe.regions.some(r=>r.rect.maxX===28&&r.rect.maxY===28));A(safe.regions.some(r=>r.rect.maxX===8&&r.rect.maxY===256));checks.push('Default X1C floor, saved cutter region, front line strip and saved brim are combined');
 const zero=Safety.resolve({...o,margin:0,reservedFront:0,bedSafetyProfile:'custom'},info);A.equal(zero.frontReserved_mm,20);A(zero.regions.some(r=>r.label==='X1C cutter clearance'));checks.push('Zero margins, custom selector and zero strip do not disable matched X1C safeguards');
 const custom=Safety.resolve({bedX:310,bedY:310},info);A.equal(custom.profileMatched,false);A.equal(custom.regions.length,0);A.equal(custom.brimSkirtAllowance_mm,0);checks.push('Different bed does not inherit false X1C profile settings');
 const multi={...info,config:{...info.config,bed_exclude_area:['0x0','28x0','28x28','0x28','100x100','125x100','125x125','100x125']}};const ms=Safety.resolve(o,multi);A(ms.regions.some(r=>r.rect.x===100&&r.rect.y===100));
 A.throws(()=>Safety.polygons(['0x0','1x0','1x1'],'bed_exclude_area'),/complete/);A.throws(()=>Safety.resolve({...o,bedSafetyProfile:'x1c',bedX:310},info),/256/);checks.push('Every exclusion quad is honored; malformed regions and mismatched explicit X1C are rejected');
 const more=Safety.resolve({...o,extraBrim:9,reservedFront:30,exclusionClearance:3},info);A.equal(more.toolpathPadding_mm,12);A.equal(more.frontReserved_mm,30);checks.push('Additional brim and calibration reserves increase protection');
 for(const [tag,s] of [['default',safe],['second_quad',ms],['extra',more]]){
  const plan=await P.pack([raw('frame',100,90,'frame'),raw('panel',110,110,'panel'),raw('stand',44,63,'foot'),raw('fit',18,36)],o,{safety:s,gap:3});A(P.validate(plan));A.equal(plan.partCount,4);A(plan.gap>=2*s.brimSkirtAllowance_mm+1);for(const plate of plan.plates)for(const e of plate.entries)Safety.validateEntry(e,s);checks.push(tag+' layout validates all frame/panel/stand/test footprints with added brim separation');
 }
 await A.rejects(()=>P.pack([raw('Too_large_for_protected_X1C',230,230)],o,{safety:safe}),/cannot|does not|safe|fit/i);checks.push('Unplaceable part rejected instead of scaling or crossing a reserve');
 // Bottom footprint is safe, but the elevated portion protrudes over cutter.
 const overhead={name:'Elevated_connector',x:30,y:32,width:20,depth:20,mesh:{vertices:[[0,0,0],[10,0,0],[10,10,0],[-10,-10,10],[-5,-10,10],[-5,-5,10]],faces:[[0,1,2],[3,4,5]]}};
 A.throws(()=>Safety.validateEntry(overhead,safe),/overlaps/);checks.push('Elevated connector overhang is checked, not only bed-contact face');
 const plan=await P.pack([raw('single',40,40)],o,{safety:safe});const files=new Map(P.projectFiles(plan,base));for(const [name,text]of base.files)A.equal(files.get(name),text);A(files.has('Metadata/project_settings.config'));checks.push('Single-plate project retains exact printer/start-G-code/profile settings');
 A.throws(()=>P.packageFiles({...plan,bed:{...plan.bed,safety:null}},plan.plates[0]),/safety|reserv/i);checks.push('Writer rejects a plan missing its safety contract');
 const e=plan.plates[0].entries[0],bad={...plan,plates:[{...plan.plates[0],entries:[{...e,x:1,y:1}]}]};A.throws(()=>P.projectFiles(bad,base),/outside|overlaps|margin/i);checks.push('Final native writer rejects a manipulated unsafe placement');
 const text=P.svg(plan,plan.plates[0]);A(text.includes('X1C cutter clearance')&&text.includes('Calibration / priming'));checks.push('Plate preview includes forbidden areas and clearance outlines');
 const skirtInfo={...info,config:{...info.config,brim_type:'no_brim',skirt_loops:2,skirt_distance:2,nozzle_diameter:'0.4'}};const skirt=Safety.resolve(o,skirtInfo);A.equal(skirt.skirtEnvelope,'plate_bounding_rectangle');A.equal(skirt.skirtAllowance_mm,3.2);
 const skirtPlan=await P.pack([raw('skirt_a',70,40),raw('skirt_b',40,60)],o,{safety:skirt});for(const plate of skirtPlan.plates)Safety.validatePlate(plate.entries,skirt);checks.push('Enabled skirts protect the complete plate-wide bounding envelope, not only individual silhouettes');
 const report={version:'3.51.0',checks,passed:checks.length,defaultSafety:safe,physicalPrintTested:false,bambuStudioSliced:false};fs.writeFileSync(path.join(__dirname,'../Validation/Reserved_Bed_Checks.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
})().catch(e=>{console.error(e.stack);process.exitCode=1});
