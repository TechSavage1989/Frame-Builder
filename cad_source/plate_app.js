/* Arranged 3MF downloads and the plate inspector. Export plans are immutable
 * snapshots of the meshes and spacing at click time, independent of the camera. */
const plateCache=new WeakMap();
let platePlan=null,plateRevision=0,plateTimer=0,plateWorking=false,plateScopeAtDisplay='all';
let bambuTemplate=BambuBaseProject;
const BambuTemplateKey='canvas-frame.bambu-template.v3',PlatePackagingKey='canvas-frame.plate-packaging.v4';
function readPlatePackaging(){return $('platePackaging')?.value==='project'?'project':'portable';}
function readBambuTemplate(){return bambuTemplate;}
function plateExportChoice(o=current||MODEL?.params){return BambuTemplate.resolvePackaging(readPlatePackaging(),readBambuTemplate(),{width:Number(o?.bedX??$('bedX').value),depth:Number(o?.bedY??$('bedY').value)});}
function readPlateSafety(o=current||MODEL?.params){
 const info=BambuTemplate.validate(readBambuTemplate());
 return FrameBedSafety.resolve({...o,bedSafetyProfile:$('bedSafetyProfile').value,reservedFront:Number($('reservedFront').value),exclusionClearance:Number($('exclusionClearance').value),extraBrim:Number($('extraBrim').value)},info);
}
function readPlateGap(){return $('partSpacing').value.trim()===''?NaN:Number($('partSpacing').value);}
function plateRaw(raw,scope){return raw.filter(p=>!p.bundledIn).filter(p=>scope==='frame'?['frame','frameKey','faceplate','foot'].includes(p.type):scope==='panel'?['panel','panelKey'].includes(p.type):true);}
function plateSnapshot(scope='all'){return {model:MODEL,raw:plateRaw(RAW,scope),plateGap:readPlateGap(),platePackaging:readPlatePackaging(),bambuTemplate:readBambuTemplate(),scope};}
function validPlateGap(){const n=readPlateGap();return Number.isFinite(n)&&n>=0&&n<=30;}
function setPlateButtons(){
 const ready=!!current&&!!MODEL&&!exportBusy&&canvas.dataset.previewStatus==='ready'&&validPlateGap();
 const completeReady=ready&&!(MODEL?.params.printedPanel&&MODEL?.params.panelLayout?.error);
 for(const id of ['downloadPlates','downloadPlatesExport'])$(id).disabled=!completeReady;
 if(!!current&&!!MODEL&&!exportBusy&&canvas.dataset.previewStatus==='ready')$('download').disabled=!completeReady;
 $('downloadPlatePanel').disabled=!ready||!MODEL?.params.panelCount;
 $('downloadPlateFrame').disabled=!ready;
 $('downloadCurrentPlate').disabled=!ready||!platePlan||plateWorking;
 $('plateScope').querySelector('option[value="panel"]').disabled=!MODEL?.params.panelCount;
}
function invalidatePlates(){
 plateRevision++;platePlan=null;plateWorking=false;clearTimeout(plateTimer);
 $('plateList').innerHTML='';$('plateCanvas').innerHTML='';$('plateSelect').innerHTML='';$('plateSelect').disabled=true;
 $('plateStatus').textContent=validPlateGap()?'Open Print plates to arrange the current model.':'Enter part spacing from 0 to 30 mm in Printer settings.';$('plateSummary').textContent=validPlateGap()?'Complete model sets include the selected 3MF export.':'Part spacing must be 0 to 30 mm.';
 setPlateButtons();
 if(!$('detailPlates').hidden&&!$('detailBody').hidden)plateTimer=setTimeout(ensurePlatePreview,450);
}
async function getPlatePlan(snapshot,progress,cancelled){
 const model=snapshot.model,raw=snapshot.raw.filter(p=>!p.bundledIn),gap=Number(snapshot.plateGap??3),safety=FrameBedSafety.resolve(model.params,BambuTemplate.validate(snapshot.bambuTemplate||readBambuTemplate())),key=gap+'|'+JSON.stringify(safety)+'|'+raw.map(p=>p.name).join('|');
 if((snapshot.scope||'all')==='all'&&model.params.printedPanel&&model.params.panelLayout?.error&&raw.some(p=>p.type!=='test'))throw Error('The UV base cannot be generated with these settings. Correct its dimensions or use the Frame and stand download.');
 let cache=plateCache.get(model);if(!cache){cache=new Map();plateCache.set(model,cache);}
 if(cache.has(key))return cache.get(key);
 const plan=await FramePlates.pack(raw,model.params,{gap,safety,progress,cancelled});
 cache.set(key,plan);return plan;
}
function drawPlatePreview(){
 if(!platePlan)return;const index=Math.max(0,Math.min(platePlan.plates.length-1,Number($('plateSelect').value)||0)),plate=platePlan.plates[index];
 $('plateCanvas').innerHTML=FramePlates.svg(platePlan,plate);
 $('plateList').innerHTML=plate.entries.map((p,i)=>'<li><span class="plateNumber">'+(i+1)+'</span><span>'+friendly(p.name)+'<small>'+[p.width,p.depth,p.height].map(fmt).join(' x ')+' mm</small></span></li>').join('');
 $('plateDescription').textContent=(plate.label||'Print plate')+' | '+plate.count+' part'+(plate.count===1?'':'s')+' | '+fmt(platePlan.bed.width)+' x '+fmt(platePlan.bed.depth)+' mm bed | '+fmt(platePlan.gap)+' mm part spacing | shaded zones are reserved';
 $('downloadCurrentPlate').textContent='Download plate '+plate.number+' (.3mf)';setPlateButtons();
}
async function ensurePlatePreview(){
 clearTimeout(plateTimer);
 if(!current||!MODEL||canvas.dataset.previewStatus!=='ready'){setPlateButtons();return;}
 if(!validPlateGap()){$('plateStatus').textContent='Enter part spacing from 0 to 30 mm in Printer settings.';setPlateButtons();return;}
 if($('plateScope').value==='panel'&&!MODEL.params.panelCount)$('plateScope').value='all';
 const revision=++plateRevision,scope=$('plateScope').value,snapshot=plateSnapshot(scope);plateWorking=true;setPlateButtons();
 try{
  const result=await getPlatePlan(snapshot,s=>{if(revision===plateRevision)$('plateStatus').textContent=s;},()=>revision!==plateRevision);
  if(revision!==plateRevision||snapshot.model!==MODEL)return;
  platePlan=result;plateScopeAtDisplay=scope;plateWorking=false;
  $('plateSelect').innerHTML=result.plates.map((p,i)=>'<option value="'+i+'">'+p.number+'. '+(p.label||'Print plate')+(p.setPlateCount>1?' '+p.setPlate+'/'+p.setPlateCount:'')+' | '+p.count+' parts</option>').join('');$('plateSelect').disabled=result.plates.length<2;
  $('plateStatus').textContent=result.partCount+' parts on '+result.plates.length+' plate'+(result.plates.length===1?'':'s')+'.';
  if(scope==='all')$('plateSummary').textContent=result.partCount+' parts arranged on '+result.plates.length+' print plate'+(result.plates.length===1?'':'s')+'.';
  drawPlatePreview();
 }catch(e){if(revision===plateRevision){plateWorking=false;platePlan=null;$('plateStatus').textContent=e.message;setPlateButtons();}}
}
function plateInstructions(plan,packaging='portable',template=null){
 const b=plan.bed,m=b.margins,isProject=packaging==='project';
 return `PRINT PLATES - MILLIMETRES
${plan.partCount} parts on ${plan.plates.length} plate(s).
Bed: ${b.width} x ${b.depth} mm. Usable: ${b.usableWidth} x ${b.usableDepth} mm.
Margins left / right / front / back: ${[m.left,m.right,m.front,m.back].join(' / ')} mm.
Minimum part spacing: ${plan.gap} mm (requested ${plan.requestedGap} mm).
Reserved-area clearance: ${b.safety.clearance_mm} mm. Brim/skirt allowance: ${b.safety.brimSkirtAllowance_mm} mm per part.
Protected zones: ${b.safety.regions.map(r=>r.label).join(', ')||'explicit bed margins only'}.
Reservation source: ${b.safety.source}. ${b.safety.notice}

${isProject?'Open All_Plates.3mf as a project in Bambu Studio. It loads the settings saved in '+template.name+'.\nImport a new settings project when changing printer, process or filament profiles.':'Open one named plate file at a time to keep your current slicer settings. Print all numbered plates in each matching set.'}

${plan.plates.map(p=>'Plate '+p.number+': '+p.label+(p.setPlateCount>1?' ('+p.setPlate+'/'+p.setPlateCount+')':'')+' | '+p.count+' parts').join('\n')}

SLICER SETTINGS
${isProject?'Verify the imported printer, bed, nozzle, filament and process profiles.':'Select your printer, bed, nozzle, filament and process profiles before opening a plate.'}
Keep 100% scale and the imported positions and orientations.
Print every UV face directly on PEI. Keep fold-flat supports unfolded for printing.
Turn supports off and print by layer.
The supplied placements protect the zones and brim allowance listed above. Do not auto-arrange them.
Purge towers, custom start G-code and sequential toolhead paths are not simulated. Recheck if slicer settings change.
Check every plate in the slicer preview before printing.
`;}

async function arrangedFiles(snapshot,prefix='Print_Plates/'){
 const plan=await getPlatePlan(snapshot,exportMessage),files=[],choice=BambuTemplate.resolvePackaging(snapshot.platePackaging||'portable',snapshot.bambuTemplate,plan.bed),packaging=choice.packaging;
 if(packaging==='project'){
  exportMessage('Writing one 3MF with '+plan.plates.length+' plate'+(plan.plates.length===1?'':'s'));await stepPause();
  const source=FramePlates.projectFiles(plan,snapshot.bambuTemplate);
  files.push([prefix+'All_Plates.3mf',new Uint8Array(await zip(source).arrayBuffer())]);
 }else{
  for(const plate of plan.plates){
   exportMessage('Writing '+plate.label+' '+plate.setPlate+' / '+plate.setPlateCount);await stepPause();
   files.push([prefix+FramePlates.plateFile(plate),new Uint8Array(await zip(FramePlates.packageFiles(plan,plate)).arrayBuffer())]);
  }
 }
 for(const plate of plan.plates)files.push([prefix+'Plate_Maps/'+String(plate.number).padStart(2,'0')+'_'+plate.setName+'.svg',FramePlates.svg(plan,plate)]);
 const report=FramePlates.manifest(plan);report.packaging=packaging==='project'?(plan.plates.length>1?'Bambu_Orca_multiplate_project':'single_plate_3mf'):'grouped_single_plate_3mf';
 report.requestedPackaging=choice.requested;if(choice.reason){report.packagingReason=choice.reason;report.savedProjectBed=choice.templateBed;}
 if(packaging==='project')report.plates=report.plates.map(p=>({...p,file:'All_Plates.3mf',projectPlate:p.plate}));
 files.push([prefix+'READ_ME.txt',plateInstructions(plan,packaging,snapshot.bambuTemplate)],[prefix+'Layout_Manifest.json',JSON.stringify(report,null,2)]);
 return {plan,files};
}
async function downloadArranged(snapshot,scope='all'){
 const s={...snapshot,raw:plateRaw(snapshot.raw,scope),scope};
 if(scope==='panel'&&!s.raw.length)throw Error('Generate a printable UV base first.');
 const plan=await getPlatePlan(s,exportMessage),choice=BambuTemplate.resolvePackaging(s.platePackaging||'portable',s.bambuTemplate,plan.bed),base=nameBase(s.model.params)+(snapshot.downloadSuffix||'')+(scope==='all'?'':scope==='frame'?'_Frame_and_Stand':'_UV_Base');
 if(plan.plates.length===1){save(zip(choice.packaging==='project'?FramePlates.projectFiles(plan,s.bambuTemplate):FramePlates.packageFiles(plan,plan.plates[0])),base+'_All_Parts_One_Plate.3mf','model/3mf');}
 else if(choice.packaging==='project'){
  exportMessage('Writing '+plan.plates.length+' plates into one 3MF project');await stepPause();
  save(zip(FramePlates.projectFiles(plan,s.bambuTemplate)),base+'_All_Plates.3mf','model/3mf');
 }else{const result=await arrangedFiles(s,base+'_Grouped_Plates/');save(zip(result.files),base+'_Grouped_Plates.zip');}
}
$('partSpacing').addEventListener('input',()=>{try{localStorage.setItem('canvas-frame.plate-spacing',String(readPlateGap()));}catch(_){};invalidatePlates();});
try{const v=localStorage.getItem('canvas-frame.plate-spacing');if(v!==null&&Number.isFinite(Number(v))&&Number(v)>=0&&Number(v)<=30)$('partSpacing').value=v;}catch(_){}
function updatePlatePackaging(){
 try{const s=readPlateSafety();$('bedSafetyStatus').textContent=s.printer+': '+s.regions.length+' protected zones; '+s.clearance_mm+' mm clearance; '+s.brimSkirtAllowance_mm+' mm brim/skirt allowance. '+s.notice;}catch(e){$('bedSafetyStatus').textContent=e.message;}

 const selectedProject=readPlatePackaging()==='project',choice=plateExportChoice(),project=choice.packaging==='project';
 $('platePackagingHint').textContent=selectedProject?'One multi-plate 3MF when the selected bed matches the saved project. Other bed sizes use a ZIP of separate 3MF plates with your current slicer settings.':'One plate downloads as 3MF. Multiple plates download as a ZIP of separate 3MF files. Open each plate to keep current slicer settings.';
 $('bambuTemplateGroup').hidden=false;
 const mismatch=choice.reason==='template_bed_mismatch';
 $('platePackagingNotice').hidden=$('plateExportNotice').hidden=!mismatch;
 if(mismatch){
  const size=choice.templateBed.width+' x '+choice.templateBed.depth+' mm';
  $('platePackagingNotice').textContent='The saved project uses a '+size+' bed. This bed size exports separate 3MF plates. Import a project with the matching printer bed to export one multi-plate 3MF.';
  $('plateExportNotice').textContent='3MF export: separate plates (ZIP). The saved project uses '+size+'. Import matching settings for one project.';
 }
 for(const id of ['downloadPlates','downloadPlatesExport'])$(id).textContent=project?'Download all plates - one 3MF':'Download all plates - separate 3MFs';
 if(typeof updateExportLabels==='function')updateExportLabels();
 else if($('exportFormat').value==='3mf')$('download').textContent=project?'Download all plates - one 3MF':'Download all plates - separate 3MFs';
}
$('platePackaging').onchange=()=>{try{localStorage.setItem(PlatePackagingKey,readPlatePackaging());}catch(_){}updatePlatePackaging();};
function showBambuTemplate(suffix=''){
 $('resetBambuTemplate').disabled=bambuTemplate===BambuBaseProject;
 const info=BambuTemplate.validate(bambuTemplate);
 $('bambuTemplateStatus').textContent=bambuTemplate.name+' | '+info.printer+' | '+info.process+' | '+info.filaments.length+' filament profile(s).'+suffix;
}
function setTemplateBed(){const {bed}=BambuTemplate.validate(bambuTemplate);$('bedX').value=String(bed.width);$('bedY').value=String(bed.depth);$('bedPreset').value='custom';}
$('bambuTemplateFile').onchange=async()=>{
 const file=$('bambuTemplateFile').files[0];if(!file)return;
 $('bambuTemplateFile').disabled=true;$('bambuTemplateStatus').textContent='Reading saved project settings...';
 try{
  if(file.size>256*1024*1024)throw Error('Save a small template project with one simple object.');
  const imported=await BambuTemplate.read(await file.arrayBuffer(),file.name);
  bambuTemplate=imported;setTemplateBed();$('platePackaging').value='project';
  let suffix=' Saved on this device.';
  try{localStorage.setItem(BambuTemplateKey,JSON.stringify(imported));localStorage.setItem(PlatePackagingKey,'project');}catch(_){try{localStorage.removeItem(BambuTemplateKey);}catch(_){}suffix=' Available for this session; import again after reopening.';}
  showBambuTemplate(suffix);updatePlatePackaging();update();
 }catch(e){$('bambuTemplateStatus').textContent=e.message+(bambuTemplate?' The previously loaded settings remain selected.':'');}
 finally{$('bambuTemplateFile').value='';$('bambuTemplateFile').disabled=false;}
};
$('resetBambuTemplate').onclick=()=>{bambuTemplate=BambuBaseProject;try{localStorage.removeItem(BambuTemplateKey);localStorage.setItem(PlatePackagingKey,'project');}catch(_){}$('platePackaging').value='project';setTemplateBed();showBambuTemplate();updatePlatePackaging();update();};
try{const saved=localStorage.getItem(BambuTemplateKey);if(saved){const parsed=JSON.parse(saved);BambuTemplate.validate(parsed);bambuTemplate=parsed;}
 const v=localStorage.getItem(PlatePackagingKey);if(v==='portable'||v==='project')$('platePackaging').value=v;
}catch(_){try{localStorage.removeItem(BambuTemplateKey);}catch(_){}bambuTemplate=BambuBaseProject;$('platePackaging').value='project';}
setTemplateBed();
$('bedSafetyProfile').addEventListener('change',()=>{updatePlatePackaging();update();});
showBambuTemplate();
updatePlatePackaging();
$('plateSelect').onchange=drawPlatePreview;$('plateScope').onchange=ensurePlatePreview;
$('openPrintPlates').onclick=()=>{showDetail('Plates');if(window.innerWidth<=800)$('detailsCard').scrollIntoView({behavior:'smooth',block:'nearest'});};
$('downloadPlates').onclick=$('downloadPlatesExport').onclick=()=>doExport(s=>downloadArranged(s,'all'));
$('downloadPlateFrame').onclick=()=>doExport(s=>downloadArranged(s,'frame'));
$('downloadPlatePanel').onclick=()=>doExport(s=>downloadArranged(s,'panel'));
$('downloadCurrentPlate').onclick=()=>{
 if(!platePlan||plateWorking)return;
 const plan=platePlan,plate=plan.plates[Number($('plateSelect').value)||0];
 doExport(s=>{save(zip(FramePlates.packageFiles(plan,plate)),nameBase(s.model.params)+'_'+FramePlates.plateFile(plate).split('/').pop(),'model/3mf');});
};
window.CanvasFramePrintPlates=Object.freeze({
 prepare:async(scope='all')=>{if(!MODEL||canvas.dataset.previewStatus!=='ready')throw Error('The current model is not ready.');return FramePlates.manifest(await getPlatePlan(plateSnapshot(scope)));},
 getState:()=>({working:plateWorking,scope:plateScopeAtDisplay,layout:platePlan?FramePlates.manifest(platePlan):null})
});
