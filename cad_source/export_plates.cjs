/* Optional exporter. The standalone browser needs no Node installation.
 * node export_plates.cjs Parameters.json output_folder [all|frame|panel] [portable|project] [Bambu_Project.3mf]
 * portable: profile-free plate files; project: saved Bambu settings required for multiple plates. */
'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm');
const {exportSet}=require('./export_stl.cjs');
const BambuTemplate=require('./bambu_template.js');
const FrameBedSafety=require('./bed_safety.js');
const BambuBaseProject=require('./bambu_base_project.js');
async function writePlates(raw,model,output,gap=3,scope='all',packaging='portable',template=null){
 if(!template)template=BambuBaseProject;
 if(!['project','portable'].includes(packaging))throw Error('3MF packaging must be project or portable.');
 const context={console,module:{exports:{}},BambuTemplate,FrameBedSafety,Blob,TextEncoder,TextDecoder,setTimeout,Uint8Array};vm.createContext(context);
 const app=fs.readFileSync(path.join(__dirname,'app.js'),'utf8');
 vm.runInContext(fs.readFileSync(path.join(__dirname,'plate_layout.js'),'utf8')+'\n'+app.slice(app.indexOf('function crc32('),app.indexOf('function readme('))+'\nthis.P=FramePlates;this.Z=zip;',context);
 const plateApp=fs.readFileSync(path.join(__dirname,'plate_app.js'),'utf8');
 vm.runInContext(plateApp.slice(plateApp.indexOf('function plateInstructions('),plateApp.indexOf('async function arrangedFiles('))+'\nthis.instructions=plateInstructions;',context);
 const selected=raw.filter(p=>!p.bundledIn).filter(p=>scope==='frame'?['frame','frameKey','faceplate','foot'].includes(p.type):scope==='panel'?['panel','panelKey'].includes(p.type):true);
 const plan=await context.P.pack(selected,model.params,{gap,safety:FrameBedSafety.resolve(model.params,BambuTemplate.validate(template))});fs.mkdirSync(output,{recursive:true});
 const choice=BambuTemplate.resolvePackaging(packaging,template,plan.bed);packaging=choice.packaging;
 const write=async(file,source)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,Buffer.from(await context.Z(source).arrayBuffer()));};
 const single=plan.plates.length===1;
 if(single||packaging==='project')await write(path.join(output,'All_Plates.3mf'),packaging==='project'?context.P.projectFiles(plan,template):context.P.packageFiles(plan,plan.plates[0]));
 else for(const plate of plan.plates)await write(path.join(output,context.P.plateFile(plate)),context.P.packageFiles(plan,plate));
 fs.mkdirSync(path.join(output,'Plate_Maps'),{recursive:true});
 for(const plate of plan.plates)fs.writeFileSync(path.join(output,'Plate_Maps',String(plate.number).padStart(2,'0')+'_'+plate.setName+'.svg'),context.P.svg(plan,plate));
 const report=context.P.manifest(plan);report.packaging=single?'single_plate_3mf':packaging==='project'?'Bambu_multiplate_saved_settings':'grouped_single_plate_3mf';
 report.requestedPackaging=choice.requested;if(choice.reason){report.packagingReason=choice.reason;report.savedProjectBed=choice.templateBed;}
 if(single||packaging==='project')report.plates=report.plates.map(p=>({...p,file:'All_Plates.3mf',projectPlate:p.plate}));
 if(!single&&packaging==='project'){const info=BambuTemplate.validate(template);report.profileSource={name:template.name,printer:info.printer,process:info.process,filaments:info.filaments};}
 fs.writeFileSync(path.join(output,'Layout_Manifest.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(output,'READ_ME.txt'),context.instructions(plan,packaging,template));return report;
}
module.exports={writePlates};
if(require.main===module)(async()=>{try{
 const [source,output,scope='all',packaging='portable',templatePath]=process.argv.slice(2);if(!source||!output)throw Error('Usage: node export_plates.cjs Parameters.json output_folder [all|frame|panel] [portable|project] [Bambu_Project.3mf]');
 const template=templatePath?await BambuTemplate.read(fs.readFileSync(templatePath),path.basename(templatePath)):null;
 const input=JSON.parse(fs.readFileSync(source,'utf8')),result=exportSet(input,output),report=await writePlates(result.raw,result.model,path.join(output,'Print_Plates'),input.partSpacing??3,scope,packaging,template);console.log(JSON.stringify({parts:report.partCount,plates:report.plateCount,output}));
}catch(e){console.error(e.stack||e.message);process.exitCode=1;}})();
