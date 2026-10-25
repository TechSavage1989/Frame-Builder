/* Export millimetre STL parts and editable geometry for a parameter JSON file.
   Usage: node export_stl.cjs Parameters.json output_folder
   No external Node packages are required. */
'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm');
function load(){
 const context={module:{exports:{}},TextEncoder,TextDecoder,console};vm.createContext(context);
 vm.runInContext(fs.readFileSync(path.join(__dirname,'csg_core.js'),'utf8')+'\n'+fs.readFileSync(path.join(__dirname,'bed_safety.js'),'utf8')+'\n'+fs.readFileSync(path.join(__dirname,'frame_geometry.js'),'utf8'),context);
 return context.module.exports;
}
function exportSet(input,output,mode='model'){
 if(!['model','fit-test','first-print','border-stand-test','stand-test','panel-test','frame-test','frame-joint-test'].includes(mode))throw Error('Unknown export mode: '+mode);
 const F=load(),model=mode==='border-stand-test'?F.borderlessTests(F.derive(input),'border_stand'):['fit-test','first-print'].includes(mode)?F.selectedFitTests(input):mode==='stand-test'?F.standFitTest(input):mode==='panel-test'?F.panelFitTest(input):mode==='frame-test'?F.fitTest(input):mode==='frame-joint-test'?F.frameJointFitTest(input):F.make(input),o=model.params,cache=new WeakMap();
 if(!model.parts.length)throw Error('The current model has no selected assembly connections to test.');
 const raw=model.parts.map(p=>{const m=F.mesh(p.spec,cache);F.validatePanelFront(p,m,o);const pm=F.printMesh(m,o,p);return {...p,mesh:m,bounds:F.bounds(m),printMesh:pm,printBounds:F.bounds(pm),rotation:pm.rotation};});
 fs.mkdirSync(path.join(output,'STL'),{recursive:true});
 for(const p of raw.filter(p=>!p.bundledIn))fs.writeFileSync(path.join(output,'STL',p.name+'.stl'),Buffer.from(F.binarySTL(p.printMesh)));
 const fields=['frameSpringsEnabled','easelThickness','matchEaselBase','sectionMode','twoPartDirection','bedSafetyProfile','reservedFront','exclusionClearance','extraBrim','borderlessRim','borderlessOverlap','borderlessBack','borderlessWall','borderlessBase','hangerThickness','sacrificialTabThickness','sacrificialTabWidth','borderlessCorner','latchArm','latchEngagement','latchSpringBias','borderlessStandAngle','w','h','t','b','ov','pc','kc','rg','retainerClearance','frameRampClearance','frameBaseRelief','bedX','bedY','margin','marginLeft','marginRight','marginFront','marginBack','panelJoint','panelCenterClearance','panelPostLength','printedPanel','panelSplit','customMargins','includeStand','displayOrientation','frameStyle','faceplateStyle','faceplateFit','standType','standHinge','structure','jointGrip','panelGrip'];
 fs.writeFileSync(path.join(output,'Parameters.json'),JSON.stringify(Object.fromEntries(fields.map(k=>[k,o[k]])),null,2));
 fs.writeFileSync(path.join(output,'Geometry_Specification.json'),JSON.stringify(model));
 const app=fs.readFileSync(path.join(__dirname,'app.js'),'utf8'),readme=app.slice(app.indexOf('function readme('),app.indexOf('function nameBase(')),manifest=app.slice(app.indexOf('function manifest('),app.indexOf('async function exportZip('));
 const ctx={o,raw,FrameV3:F,fmt:n=>Number(n.toFixed(3)).toString()};vm.createContext(ctx);vm.runInContext(readme+'\n'+manifest+'\nreport=readme(o,raw);list=manifest(o,raw);',ctx);
 if(mode==='model'){
  fs.writeFileSync(path.join(output,'READ_ME.txt'),ctx.report);
  fs.writeFileSync(path.join(output,'Print_List.json'),JSON.stringify(ctx.list,null,2));
 }else{
  const test={...model,testSelection:model.testSelection||{mode:'current_settings_only',frameJointTypes:model.parts.some(p=>/^Frame_/.test(p.name))?F.frameFitKinds(o).length:0,panelJointTypes:model.parts.some(p=>p.testGroup==='uv_joint')?1:0,standType:model.parts.some(p=>p.testGroup==='stand_mount')?o.standType:'none',reusePanelAsThicknessGauge:false,partCount:raw.length}};
  const guide=app.slice(app.indexOf('function fitTestPartsText('),app.indexOf('function updateAssemblyGuide('));
  const tctx={o,raw,test,FrameV3:F,fmt:n=>Number(n.toFixed(3)).toString()};vm.createContext(tctx);
  vm.runInContext(guide+'\nreport=fitGuide(o,test)+"\\n\\n"+fitTestPartsText(raw);',tctx);
  fs.writeFileSync(path.join(output,'PRINT_FIRST.txt'),tctx.report);
  fs.writeFileSync(path.join(output,'Print_List.json'),JSON.stringify({version:'3.51.6',units:'mm',scope:'fit_tests',...test.testSelection,parts:ctx.list.parts},null,2));
 }

 return {model,raw};
}
module.exports={load,exportSet};
if(require.main===module){
 try{const [source,output,mode]=process.argv.slice(2);if(!source||!output)throw Error('Usage: node export_stl.cjs Parameters.json output_folder [model|panel-test|frame-test]');
 const {model,raw}=exportSet(JSON.parse(fs.readFileSync(source,'utf8')),output,mode||'model');console.log('Exported '+raw.filter(p=>!p.bundledIn).length+' parts to '+output);
 }catch(e){console.error(e.message);process.exitCode=1;}
}
