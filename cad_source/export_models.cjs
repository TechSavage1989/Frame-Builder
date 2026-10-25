/* Optional local exporter using the same solid STEP writer as the browser.
 * Usage: node export_models.cjs Parameters.json output_folder [model|fit-test|frame-test|panel-test|stand-test|border-stand-test|first-print]
 * Requires Node 18 or newer. No external Node dependencies.
 */
'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm');
const {exportSet,load}=require('./export_stl.cjs');
const {writePlates}=require('./export_plates.cjs');
const STEP=require('./step_export.js');
function writeSTEP(raw,model,out){
 const parts=raw.map(p=>({...p,topology:STEP.topology(p.mesh)}));fs.mkdirSync(path.join(out,'STEP','Parts'),{recursive:true});
 for(const p of parts.filter(p=>!p.bundledIn))fs.writeFileSync(path.join(out,'STEP','Parts',p.name+'_Print_Orientation.step'),STEP.write([{...p,transform:STEP.printTransform(p)}],p.name));
 if(!('panel' in model))return;
 const dir=path.join(out,'STEP','Assemblies');fs.mkdirSync(dir,{recursive:true});
 const F=load(),frame=parts.filter(p=>['frame','frameKey','faceplate'].includes(p.type)).map(p=>p.displaySpec?{...p,topology:STEP.topology(F.mesh(p.displaySpec))}:p),panel=parts.filter(p=>p.type==='panel'||p.type==='panelKey');
 fs.writeFileSync(path.join(dir,'Frame_Assembly.step'),STEP.write(frame,'Frame_Assembly'));
 if(panel.length){fs.writeFileSync(path.join(dir,'UV_Base_Assembly.step'),STEP.write(panel,'UV_Base_Assembly'));fs.writeFileSync(path.join(dir,'Frame_and_UV_Base_Assembly.step'),STEP.write([...frame,...panel],'Frame_and_UV_Base_Assembly'));}
 const pose=p=>{const v=F.frameShelfPoint(p,model.params);return [v[0],-v[2],v[1]];};
 const stands=parts.filter(p=>p.type==='foot').map(p=>{let m=F.mesh(p.displaySpec);return {...p,topology:STEP.topology(m),transform:v=>pose(v.map((n,i)=>n+p.displayOffset[i]))};});
 if(stands.length)fs.writeFileSync(path.join(dir,'Shelf_Display_Assembly.step'),STEP.write([...frame,...panel].map(p=>({...p,transform:pose})).concat(stands),'Shelf_Display_Assembly'));
}
async function exportModels(input,out,mode='model'){
 const template=input.bambuTemplatePath?await require('./bambu_template.js').read(fs.readFileSync(input.bambuTemplatePath),path.basename(input.bambuTemplatePath)):null;
 if(template)input={...input,sectionTemplateInfo:require('./bambu_template.js').validate(template)};
 const set=exportSet(input,out,mode==='first-print'?'fit-test':mode);
 writeSTEP(set.raw,set.model,out);
 const plates=await writePlates(set.raw,set.model,path.join(out,'Print_Plates'),input.partSpacing??3,'all',input.platePackaging||'portable',template);
 return {parts:set.raw.filter(p=>!p.bundledIn).length,plates:plates.plateCount,params:{depth:set.model.params.d,structure:set.model.params.structure,nx:set.model.params.nx,ny:set.model.params.ny},out};
}
module.exports={exportModels,writeSTEP};
if(require.main===module)(async()=>{try{const [params,out,mode='model']=process.argv.slice(2);if(!params||!out)throw Error('Usage: node export_models.cjs Parameters.json output_folder [mode]');console.log(JSON.stringify(await exportModels(JSON.parse(fs.readFileSync(params,'utf8')),out,mode)));}catch(e){console.error(e.stack);process.exitCode=1;}})();
