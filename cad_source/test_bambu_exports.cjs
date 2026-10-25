'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),zlib=require('node:zlib');
const BambuTemplate=require('./bambu_template.js'),P=require('./plate_layout.js');
const settings={printer_settings_id:'Test printer 0.4 nozzle',print_settings_id:'Test 0.20 mm process',filament_settings_id:['Test PETG','Test PLA'],filament_colour:['#123456','#ABCDEF'],filament_type:['PETG','PLA'],nozzle_diameter:['0.4'],printable_area:['0x0','256x0','256x256','0x256'],layer_height:'0.2'};
const application='BambuStudio-02.06.00.51';
const fixtureFiles=[['3D/3dmodel.model','<model><metadata name="Application">'+application+'</metadata><resources>DO_NOT_COPY_TEMPLATE_OBJECT</resources></model>'],['Metadata/project_settings.config',JSON.stringify(settings,null,2)],['Metadata/filament_settings_1.config','{"name":"Test PETG","from":"user","filament_type":["PETG"]}'],['Metadata/machine_settings_1.config','{"name":"Test printer 0.4 nozzle","from":"user"}'],['Metadata/print_setting_1.config','{"name":"Test 0.20 mm process","from":"user"}'],['Metadata/model_settings.config','DO_NOT_COPY_OBJECT_OVERRIDES'],['Metadata/plate_1.gcode','DO_NOT_COPY_GCODE']];
function crc(bytes){let c=0xffffffff;for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;}
function zipFixture(files,{deflate=false,zip64=false}={}){
 const local=[],central=[];let at=0;
 for(const [name,text]of files){const n=Buffer.from(name),data=Buffer.from(text),packed=deflate?zlib.deflateRawSync(data):data,head=Buffer.alloc(30),dir=Buffer.alloc(46),extra=Buffer.alloc(zip64?28:0),checksum=crc(data);
  head.writeUInt32LE(0x04034b50);head.writeUInt16LE(20,4);head.writeUInt16LE(deflate?8:0,8);head.writeUInt32LE(checksum,14);head.writeUInt32LE(packed.length,18);head.writeUInt32LE(data.length,22);head.writeUInt16LE(n.length,26);
  dir.writeUInt32LE(0x02014b50);dir.writeUInt16LE(zip64?45:20,6);dir.writeUInt16LE(deflate?8:0,10);dir.writeUInt32LE(checksum,16);dir.writeUInt32LE(zip64?0xffffffff:packed.length,20);dir.writeUInt32LE(zip64?0xffffffff:data.length,24);dir.writeUInt16LE(n.length,28);dir.writeUInt16LE(extra.length,30);dir.writeUInt32LE(zip64?0xffffffff:at,42);
  if(zip64){extra.writeUInt16LE(1);extra.writeUInt16LE(24,2);extra.writeBigUInt64LE(BigInt(data.length),4);extra.writeBigUInt64LE(BigInt(packed.length),12);extra.writeBigUInt64LE(BigInt(at),20);}
  local.push(head,n,packed);central.push(dir,n,extra);at+=head.length+n.length+packed.length;
 }
 const cd=Buffer.concat(central),end=Buffer.alloc(22),tail=[];
 if(zip64){const z=Buffer.alloc(56),locator=Buffer.alloc(20);z.writeUInt32LE(0x06064b50);z.writeBigUInt64LE(44n,4);z.writeUInt16LE(45,12);z.writeUInt16LE(45,14);z.writeBigUInt64LE(BigInt(files.length),24);z.writeBigUInt64LE(BigInt(files.length),32);z.writeBigUInt64LE(BigInt(cd.length),40);z.writeBigUInt64LE(BigInt(at),48);locator.writeUInt32LE(0x07064b50);locator.writeBigUInt64LE(BigInt(at+cd.length),8);locator.writeUInt32LE(1,16);tail.push(z,locator);}
 end.writeUInt32LE(0x06054b50);end.writeUInt16LE(zip64?65535:files.length,8);end.writeUInt16LE(zip64?65535:files.length,10);end.writeUInt32LE(zip64?0xffffffff:cd.length,12);end.writeUInt32LE(zip64?0xffffffff:at,16);
 return Buffer.concat([...local,cd,...tail,end]);
}
function testPlan(){const mesh={vertices:[[0,0,0],[5,0,0],[0,5,0],[0,0,2]],faces:[[0,2,1],[0,1,3],[0,3,2],[1,2,3]]};return{version:'3.51.0',units:'mm',bed:{width:256,depth:256,usableWidth:241.8,usableDepth:241.8,margins:{left:7.1,right:7.1,front:7.1,back:7.1},safety:require('./bed_safety.js').resolve({bedX:256,bedY:256},BambuTemplate.validate(require('./bambu_base_project.js')))},gap:3,resolution:.5,partCount:3,plates:[1,2,3].map((number,index)=>({number,label:'Test plate '+number,count:1,setPlate:1,setPlateCount:1,entries:[{name:'Test_'+number,type:'test',index,x:50,y:50,z:0,width:5,depth:5,height:2,angle:0,sourceRotation:0,mesh}]}))};}
async function run(){const checks=[];let template;
 for(const [label,options]of [['stored',{}],['deflated',{deflate:true}],['ZIP64',{zip64:true,deflate:true}]]){
  template=await BambuTemplate.read(zipFixture(fixtureFiles,options),'Test_Settings.3mf');assert.deepEqual(BambuTemplate.validate(template).config,settings);assert.equal(template.files.length,4);assert.equal(template.application,application);checks.push(label+' settings import');
 }
 const corrupt=zipFixture(fixtureFiles);corrupt[30+Buffer.byteLength(fixtureFiles[0][0])+2]^=1;
 await assert.rejects(()=>BambuTemplate.read(corrupt),/integrity/);
 await assert.rejects(()=>BambuTemplate.read(zipFixture(fixtureFiles.slice(0,1))),/project settings/);
 await assert.rejects(()=>BambuTemplate.read(zipFixture([...fixtureFiles,fixtureFiles[1]])),/duplicate/);
 await assert.rejects(()=>BambuTemplate.read(zipFixture(fixtureFiles).subarray(0,120)),/complete/);
 await assert.rejects(()=>BambuTemplate.read(zipFixture(fixtureFiles.map(([name,text])=>[name,name==='Metadata/project_settings.config'?'{}':text]))),/printer, process/);
 checks.push('corrupt, duplicate, incomplete and profile-free input rejected');
 const plan=testPlan();
 assert.throws(()=>P.projectFiles(plan),/Import a Bambu/);
 assert.throws(()=>P.projectFiles({...plan,bed:{...plan.bed,width:180}},template),/Match the bed/);
 checks.push('direct native project writer blocks missing settings and mismatched printer beds');
 const before=JSON.stringify(template);
 assert.equal(BambuTemplate.resolvePackaging('project',template,{width:256,depth:256}).packaging,'project');
 for(const bed of [{width:310,depth:310},{width:310,depth:256},{width:256,depth:310}]){
  const choice=BambuTemplate.resolvePackaging('project',template,bed);
  assert.equal(choice.packaging,'portable');assert.equal(choice.reason,'template_bed_mismatch');
  assert.deepEqual(choice.templateBed,{width:256,depth:256});
 }
 assert.equal(BambuTemplate.resolvePackaging('portable',null,{width:310,depth:310}).packaging,'portable');
 assert.equal(JSON.stringify(template),before);
 checks.push('custom and rectangular beds select separate profile-free plates without changing saved settings');
 const matchingSettings={...settings,printable_area:['0x0','310x0','310x310','0x310']};
 const matching=await BambuTemplate.read(zipFixture(fixtureFiles.map(([name,text])=>[name,name==='Metadata/project_settings.config'?JSON.stringify(matchingSettings):text])));
 assert.equal(BambuTemplate.resolvePackaging('project',matching,{width:310,depth:310}).packaging,'project');
 checks.push('a matching custom-bed template selects native multi-plate export');
 const files=P.projectFiles(plan,template),native=new Map(files),layout=JSON.parse(native.get('Metadata/Canvas_Frame_Layout.json'));
 for(const [name,text]of template.files)assert.equal(native.get(name),text);
 assert.equal(layout.plateCount,3);assert.deepEqual(layout.profileSource.filaments,settings.filament_settings_id);
 assert.deepEqual(layout.project.plates.map(p=>p.origin),[[0,0,0],[307.2,0,0],[0,-307.2,0]]);
 assert.equal((native.get('Metadata/model_settings.config').match(/<plate>/g)||[]).length,3);
 assert(!files.some(([,text])=>/DO_NOT_COPY/.test(text)));
 assert(!native.has('Metadata/slice_info.config'));
 assert(native.get('3D/3dmodel.model').includes(application));
 checks.push('native project preserves all supplied profiles and plate origins; excludes original objects and toolpaths');
 for(const plate of plan.plates){const single=new Map(P.packageFiles(plan,plate));assert(![...single.keys()].some(n=>n.endsWith('.config')));assert(!single.get('3D/3dmodel.model').includes('BambuStudio-'));assert(!single.get('3D/3dmodel.model').includes('filament_settings_id'));}
 checks.push('every portable plate has no printer, process, filament or native project settings');
 const app=fs.readFileSync(path.join(__dirname,'app.js'),'utf8'),ctx={Blob,TextEncoder,Uint8Array};vm.createContext(ctx);vm.runInContext(app.slice(app.indexOf('function crc32('),app.indexOf('function readme('))+'\nthis.zipWriter=zip;',ctx);
 const roundTrip=await BambuTemplate.read(await ctx.zipWriter(files).arrayBuffer(),'Round_Trip.3mf');assert.deepEqual(roundTrip.files,template.files);checks.push('browser ZIP writer round-trip retains exact settings');
 const original=await BambuTemplate.read(fs.readFileSync(path.join(__dirname,'../Templates/Default.3mf')),'Default.3mf'),base=require('./bambu_base_project.js');
 assert.equal(base.application,original.application);assert.deepEqual(base.files,original.files);
 assert.deepEqual(base.plateDefaults,{filament_map_mode:'Auto For Flush'});
 const defaultInfo=BambuTemplate.validate(base);assert.deepEqual(defaultInfo.bed,{width:256,depth:256});
 assert.equal(defaultInfo.printer,'Bambu Lab X1 Carbon 0.4 nozzle');
 const nativeBase=new Map(P.projectFiles({...plan,bed:{...plan.bed,width:256,depth:256,usableWidth:250,usableDepth:250}},base));
 assert.equal(nativeBase.get('Metadata/project_settings.config'),original.files.find(([n])=>n==='Metadata/project_settings.config')[1]);
 assert(nativeBase.get('3D/3dmodel.model').includes('BambuStudio-02.08.04.57'));
 for(const [key,value]of Object.entries(base.plateDefaults))assert.equal(nativeBase.get('Metadata/model_settings.config').split('key="'+key+'" value="'+value+'"').length-1,3);
 checks.push('built-in Default.3mf settings match the supplied empty Bambu project exactly');
 checks.push('native X1 Carbon export preserves all project fields and the original application version');
 checks.push('each native plate preserves the base project filament-to-nozzle mapping');
 const cliOut=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'frame-cli-custom-'));
 try{
  const mesh={vertices:[[0,0,0],[300,0,0],[300,300,0],[0,300,0],[0,0,1],[300,0,1],[300,300,1],[0,300,1]],faces:[[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],[1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,0,4],[3,4,7]]};
  const params={bedX:310,bedY:310,usableX:304,usableY:304,margins:{left:3,right:3,front:3,back:3}};
  const report=await require('./export_plates.cjs').writePlates([1,2].map(i=>({name:'Test_'+i,type:'panel',printMesh:mesh})),{params},cliOut,3,'all','project',base);
  assert.equal(report.packaging,'grouped_single_plate_3mf');assert.equal(report.packagingReason,'template_bed_mismatch');assert.equal(report.plateCount,2);
  assert(!fs.existsSync(path.join(cliOut,'All_Plates.3mf')));
  for(const plate of report.plates)await assert.rejects(()=>BambuTemplate.read(fs.readFileSync(path.join(cliOut,plate.file))),/Bambu Studio/);
  checks.push('command-line custom-bed project export writes every plate without injecting mismatched profiles');
 }finally{fs.rmSync(cliOut,{recursive:true,force:true});}
 const report={version:'3.51.0',checks,defaultProject:{name:base.name,printer:defaultInfo.printer,process:defaultInfo.process,filaments:defaultInfo.filaments,bed:defaultInfo.bed,settingsFields:Object.keys(defaultInfo.config).length},summary:{checks:checks.length,errors:0},bambu_studio_launch_tested:false};fs.writeFileSync(path.join(__dirname,'../Validation/Bambu_Export_Checks.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
module.exports={fixtureFiles,zipFixture,settings,testPlan};
if(require.main===module)run().catch(e=>{console.error(e);process.exitCode=1;});
