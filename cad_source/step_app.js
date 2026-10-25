/* STEP download controls use an immutable-at-click geometry snapshot.
 * View-only visibility, inspection, loading and explode controls never modify it.
 * Cache is keyed by each generated part, so dimension edits cannot reuse old CAD.
 */
const stepTopologyCache=new WeakMap();
const stepPause=()=>new Promise(resolve=>setTimeout(resolve,0));
async function preparedSTEP(raw){
 const result=[];
 for(let i=0;i<raw.length;i++){
  const p=raw[i];exportMessage('Preparing STEP '+(i+1)+' / '+raw.length+': '+friendly(p.name));await stepPause();
  let topology=stepTopologyCache.get(p);
  if(!topology){try{topology=FrameSTEP.topology(p.mesh);}catch(e){throw Error(friendly(p.name)+': '+e.message);}stepTopologyCache.set(p,topology);}
  result.push({...p,topology});
 }
 return result;
}
function stepAssembly(parts,kind,o){
 const frame=parts.filter(p=>['frame','frameKey','faceplate'].includes(p.type)).map(p=>p.displaySpec?{...p,mesh:p.displayMesh||FrameV3.mesh(p.displaySpec),topology:FrameSTEP.topology(p.displayMesh||FrameV3.mesh(p.displaySpec))}:p),base=parts.filter(p=>p.type==='panel'||p.type==='panelKey');
 if(kind==='frame')return FrameSTEP.write(frame,'Frame_Assembly');
 if(kind==='panel'){if(!base.length)throw Error('No printable UV base is available.');return FrameSTEP.write(base,'UV_Base');}
 if(kind==='shelf'){
  const pose=v=>{const p=FrameV3.frameShelfPoint(v,o);return [p[0],-p[2],p[1]];};
  const stand=parts.filter(p=>p.type==='foot').map(p=>{const mesh=p.displayMesh||FrameV3.mesh(p.displaySpec);return {...p,mesh,topology:FrameSTEP.topology(mesh),transform:v=>pose(v.map((n,i)=>n+p.displayOffset[i]))};});
  if(!stand.length)throw Error('Select a shelf stand to export its display assembly.');
  return FrameSTEP.write([...frame,...base].map(p=>({...p,transform:pose})).concat(stand),'Shelf_Display_Assembly');
 }
 return FrameSTEP.write([...frame,...base],base.length?'Frame_and_UV_Base_Assembly':'Frame_Assembly');
}
function stepPrintItem(p){return {...p,transform:FrameSTEP.printTransform(p)};}
function stepReadme(o,parts){return readme(o,parts)+'\nSTEP DOWNLOAD CONTENTS\nSTEP/Parts contains individual printable solids in print orientation.\nSTEP/Assemblies retains the named components in their assembled positions.\nParameters.json and Geometry_Specification.json capture this exact model.\n';}
async function downloadStepSet(snapshot){
 const o=snapshot.model.params,parts=await preparedSTEP(snapshot.raw),base=nameBase(o)+'_STEP',prefix=base+'/',files=[];
 files.push([prefix+'READ_ME.txt',stepReadme(o,parts)],
  [prefix+'Parameters.json',JSON.stringify(inputSnapshot(o),null,2)],
  [prefix+'Geometry_Specification.json',JSON.stringify(snapshot.model)],
  [prefix+'Part_List.json',JSON.stringify({...manifest(o,parts),format:'STEP AP214 solid BREP',exporterVersion:'3.11'},null,2)]);
 for(let i=0;i<parts.length;i++){const p=parts[i];if(p.bundledIn)continue;exportMessage('Writing STEP part '+(i+1)+' / '+parts.length+': '+friendly(p.name));await stepPause();files.push([prefix+'STEP/Parts/'+p.name+'_Print_Orientation.step',FrameSTEP.write([stepPrintItem(p)],p.name)]);}
 exportMessage('Writing assembled STEP models...');await stepPause();
 files.push([prefix+'STEP/Assemblies/Frame_Assembly.step',stepAssembly(parts,'frame',o)]);
 if(o.panelCount){files.push([prefix+'STEP/Assemblies/Frame_and_UV_Base_Assembly.step',stepAssembly(parts,'all',o)],[prefix+'STEP/Assemblies/UV_Base_Assembly.step',stepAssembly(parts,'panel',o)]);}
 if(o.includeStand)files.push([prefix+'STEP/Assemblies/Shelf_Display_Assembly.step',stepAssembly(parts,'shelf',o)]);
 const arranged=await arrangedFiles(snapshot,prefix+'Print_Plates/');files.push(...arranged.files);
 save(zip(files),base+'.zip');
}
async function downloadStepAssembly(snapshot,kind){
 const raw=snapshot.raw.filter(p=>kind==='frame'?['frame','frameKey','faceplate'].includes(p.type):kind==='panel'?p.type==='panel'||p.type==='panelKey':kind==='shelf'?true:p.type!=='foot'),parts=await preparedSTEP(raw),o=snapshot.model.params;
 const suffix=kind==='shelf'?'_Shelf_Display_Assembly':kind==='frame'?'_Frame_Assembly':kind==='panel'?'_UV_Base_Assembly':o.panelCount?'_Frame_and_UV_Base_Assembly':'_Frame_Assembly';
 save(stepAssembly(parts,kind,o),nameBase(o)+suffix+'.step','application/step');
}
async function downloadStepPart(snapshot){
 const p=snapshot.raw[Number(snapshot.selected)];if(!p||['all','panels'].includes(snapshot.selected))throw Error('Select one individual part to export.');
 const [part]=await preparedSTEP([p]);save(FrameSTEP.write([stepPrintItem(part)],part.name),nameBase(snapshot.model.params)+'_'+part.name+'_Print_Orientation.step','application/step');
}
async function downloadStepTests(snapshot){
 const {test,raw,o}=await prepareFitTests(snapshot),parts=await preparedSTEP(raw),base=nameBase(o)+(snapshot.testScope==='frame_repair'?'_Frame_and_Clip_Test_STEP':snapshot.testScope==='frame_joints'?'_Frame_Joint_Test_STEP':snapshot.testScope==='uv_joint'?'_UV_Panel_Joint_Test_STEP':'_Fit_Tests_STEP'),prefix=base+'/',files=[];
 for(const p of parts)files.push([prefix+p.name+'.step',FrameSTEP.write([stepPrintItem(p)],p.name)]);
 files.push([prefix+'PRINT_FIRST.txt',fitGuide(o,test)+'\n\n'+fitTestPartsText(raw)],
  [prefix+'Parameters.json',JSON.stringify(inputSnapshot(o),null,2)],
  [prefix+'Part_List.json',JSON.stringify(fitTestManifest(test,raw),null,2)],
  [prefix+'Geometry_Specification.json',JSON.stringify(test)]);
 const arranged=await arrangedFiles({...snapshot,model:test,raw:parts},prefix+'Print_Plates/');files.push(...arranged.files);
 save(zip(files),base+'.zip');
}
$('downloadSTEPAssembly').onclick=()=>doExport(s=>downloadStepAssembly(s,'all'));
$('downloadSTEPFrame').onclick=()=>doExport(s=>downloadStepAssembly(s,'frame'));
$('downloadSTEPPanel').onclick=()=>doExport(s=>downloadStepAssembly(s,'panel'));
$('downloadSTEPPart').onclick=()=>doExport(downloadStepPart);

$('downloadSTEPShelf').onclick=()=>doExport(s=>downloadStepAssembly(s,'shelf'));
