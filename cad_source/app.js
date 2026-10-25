// Cache stable element references so controls still work after the live viewer
// is moved to a same-origin popup document. No duplicate model is created.
const uiElements=new Map([...document.querySelectorAll('[id]')].map(el=>[el.id,el]));
const $=id=>uiElements.get(id)||document.getElementById(id),fmt=n=>Number(n.toFixed(3)).toString();
let current=null,MODEL=null,RAW=[],isLoading=false,exportBusy=false;
const fields=['easelThickness','reservedFront','exclusionClearance','extraBrim','borderlessRim','borderlessOverlap','borderlessBack','borderlessWall','borderlessBase','hangerThickness','sacrificialTabThickness','sacrificialTabWidth','borderlessCorner','latchArm','latchEngagement','latchSpringBias','borderlessStandAngle','w','h','t','b','ov','pc','kc','rg','retainerClearance','frameRampClearance','frameBaseRelief','bedX','bedY','margin','marginLeft','marginRight','marginFront','marginBack','panelJoint','panelCenterClearance','panelPostLength','faceplateFit','standHinge','jointGrip','panelGrip'];
function friendly(n){return n.replace(/^Frame_/,'Frame ').replace(/^UV_Panel_/,'UV base ').replace(/^UV_Rear_Key_/,'UV rear key ').replace(/^UV_Locking_Spline_/,'UV locking spline ').replace(/^Joint_Faceplate_/,'Joint faceplate ').replaceAll('_',' ');}
function getInput(){return {frameSpringsEnabled:$('frameSpringsEnabled').checked,matchEaselBase:$('matchEaselBase').checked,sectionMode:$('sectionMode').value,twoPartDirection:$('twoPartDirection').value,...Object.fromEntries(fields.map(k=>[k,$(k).value.trim()===''?NaN:Number($(k).value)])),printedPanel:$('panelSource').value==='printed',panelSplit:$('panelSplit').value,customMargins:$('customMargins').checked,includeStand:$('standType').value!=='none',standType:$('standType').value,frameStyle:$('frameStyle').value,bedSafetyProfile:$('bedSafetyProfile').value,displayOrientation:$('displayOrientation').value,structure:'reinforced',faceplateStyle:$('faceplateStyle').value};}
function inputSnapshot(o){return Object.fromEntries([...fields,'frameSpringsEnabled','matchEaselBase','sectionMode','twoPartDirection','bedSafetyProfile','printedPanel','panelSplit','customMargins','includeStand','standType','frameStyle','displayOrientation','structure','faceplateStyle'].map(k=>[k,o[k]]));}
function setExports(ready){
 const ok=!!ready&&!!current&&!exportBusy&&canvas.dataset.previewStatus==='ready';
 for(const id of ['download','downloadFrame','dlscad','downloadSTEPAssembly','downloadSTEPFrame'])$(id).disabled=!ok;
 $('frameJointTest').disabled=!ok||!MODEL?.params.frameJointCount;
 $('frameRepairTest').disabled=!ok||!(MODEL?.params.isLight||MODEL?.params.isBorderless);
 $('panelJointTest').disabled=!ok||!MODEL?.params.panelJointCount;
 $('fitTest').disabled=!ok||!MODEL||(MODEL.params.frameJointCount===0&&!MODEL.params.isLight&&!MODEL.params.isBorderless&&MODEL.params.panelJointCount===0&&!MODEL.params.includeStand);
 const single=!['all','panels'].includes($('partSelect').value);
 for(const id of ['dlpart','downloadSTEPPart'])$(id).disabled=!ok||!single;
 $('downloadSTEPShelf').disabled=!ok||!MODEL?.params.includeStand;
 setPlateButtons();
 for(const id of ['downloadPanel','downloadSTEPPanel'])$(id).disabled=!ok||!MODEL?.params.panelCount;
}
function exportMessage(message){for(const id of ['downloadNotice','exportStatus','plateExportStatus']){const el=$(id);if(el){el.textContent=message;el.dataset.state=message.startsWith('Export failed:')?'error':'status';}}}
function updateExportLabels(){
 const step=$('exportFormat').value==='step',panel=!!MODEL?.params.panelCount;
 $('download').textContent=$('exportFormat').value==='3mf'?(plateExportChoice().packaging==='project'?'Download all plates - one 3MF':'Download all plates - separate 3MFs'):step?'Download complete STEP set':panel?'Download complete STL set':'Download frame STL set';
 $('downloadSTEPAssembly').textContent=panel?'Frame and UV base assembly STEP':'Frame assembly STEP';
 $('stepAssemblyHint').textContent=panel?'Named frame and panel solids, fully assembled.':'Named frame-section solids in their assembled positions.';
 $('stepPanelGroup').hidden=$('panelSource').value!=='printed';
 $('fitTest').title='Export one matching sample of each connection at the current settings.';
}

let legacyStandChoice='rigid';
function update(){
 $('explode').value='0';$('explodeValue').textContent='0 mm';
 if($('assemblyViewNotice'))$('assemblyViewNotice').hidden=true;
 const style=$('frameStyle').value,light=style==='light',borderless=style==='borderless';
 const stand=$('standType');
 if(borderless&&['rigid','fold'].includes(stand.value)){legacyStandChoice=stand.value;stand.value='breakaway';}
 if(!borderless&&stand.value==='breakaway')stand.value=legacyStandChoice;
 for(const option of stand.options){const onlyNew=option.value==='breakaway',onlyOld=['rigid','fold'].includes(option.value);option.hidden=option.disabled=onlyNew?!borderless:onlyOld?borderless:false;}
 for(const id of ['legacyBezelFields','legacyBezelNote','legacyFaceplateFields'])$(id).hidden=borderless;
 $('borderlessSettings').hidden=!borderless;
 $('sectionSettings').hidden=false;
 $('twoPartDirection').disabled=$('sectionMode').value!=='2';
 $('easelThickness').disabled=$('matchEaselBase').checked;
 if($('matchEaselBase').checked)$('easelThickness').value=$('borderlessBase').value;
 $('rg').closest('.field').hidden=borderless;
 $('borderlessStandAngle').disabled=stand.value==='none';
 $('frameRepairTest').textContent=borderless?'Border and rear joint tests':'Frame and clip fit test';

 $('jointGripGroup').hidden=style==='original'||borderless;$('frameRampClearanceGroup').hidden=style==='original'||borderless;$('frameBaseReliefGroup').hidden=style==='original'||borderless;$('retainerClearanceGroup').hidden=!(light||borderless);$('retainerClearanceGroup').querySelector('label').firstChild.textContent=borderless?'Retaining clearance ':'Retaining-clip clearance ';
 invalidatePlates();
 $('foldSettings').hidden=$('standType').value!=='fold';
 $('displayOrientation').disabled=style==='original';$('mountOrientationHint').textContent=borderless?'Two shared keyholes serve both wall and tabletop use. Turn the backing 180 degrees before seating the artwork to change between wall and stand display. The tabletop preview shows this reversed frame.':style==='original'?'The original snap frame uses its current mounting orientation.':'Both mounting directions are included. Move the same two feet to the matching sockets. This selector changes the assembled preview and shelf assembly exports.';
 $('standHint').textContent=borderless?(stand.value==='none'?'Wall display only. No breakaway easel is generated.':'The easel is joined to one frame section by three thin tabs. Its single keyed head engages the shared opening. Slide DOWN toward the frame bottom until the latch clicks. Press the release pad away, then slide UP to remove.'):$('standType').value==='none'?'Select a stand to include rear supports in the export.':$('standType').value==='fold'?'Fold and lock each support. Hold the release tongue away, seat the hooks, slide upward and release the tongue into its pocket.':'Hold the release tongue away, seat the hooks, slide upward and release the tongue into its pocket. Pull the tongue back to remove.';
 $('b').min=light?'8':'10';$('faceplateStyle').disabled=style!=='original';
 $('faceplateFitGroup').hidden=style!=='original'||$('faceplateStyle').value==='none';
 $('faceplateHint').textContent=style==='original'?'Optional covers for exposed joint slots. Print separately and press into the assembled frame.':'Available with Original snap frame.';
 $('lightDepthHint').hidden=!light;
 if(light)$('lightDepthHint').textContent='Frame depth follows the panel thickness and clearances.';
 $('styleHint').textContent=borderless?'Thin reinforced backing, corner-relieved retaining lip and '+($('frameSpringsEnabled').checked?'optional rear-plane springs enabled':'solid rear perimeter, springs disabled')+' with two shared wall / easel keyholes. Front loading; rear-face-down printing.':light?'Load the panel from the rear.':'Load the panel through the top opening.';

 $('printedPanelSettings').hidden=$('panelSource').value!=='printed';$('downloadPanel').closest('.downloadgroup').hidden=$('panelSource').value!=='printed';
 $('individualMargins').hidden=!$('customMargins').checked;$('uniformMargin').hidden=$('customMargins').checked;
 $('margin').disabled=$('customMargins').checked;for(let id of ['marginLeft','marginRight','marginFront','marginBack'])$(id).disabled=!$('customMargins').checked;
 try{const rawInput=getInput();if(typeof readBambuTemplate==='function')rawInput.sectionTemplateInfo=BambuTemplate.validate(readBambuTemplate());const o=FrameV3.derive(rawInput);current=o;$('err').textContent='';if(light)$('lightDepthHint').textContent='Frame depth / print height: '+fmt(o.d)+' mm, including the front lip and rear retainers.';if(borderless)$('borderlessHint').textContent='Uniform visible border: '+fmt(o.b)+' mm per side, including '+fmt(o.ov)+' mm artwork overlap. Panel face sits '+fmt(o.front)+' mm behind the common front plane. Compact depth: '+fmt(o.d)+' mm. Rear frame springs: '+(o.frameSpringsEnabled?'Enabled ('+o.frontRetention.rearFlexureCount+' relief windows).':'Disabled (solid rear perimeter; insertion may require more force).')+' Shared keyhole entry inset: '+fmt(o.wallHangerInsetsByOrientation.portrait)+' mm (portrait), '+fmt(o.wallHangerInsetsByOrientation.landscape)+' mm (landscape). Print rear-face-down and test the closed-border coupon first.';if(typeof updatePlatePackaging==='function')updatePlatePackaging();setExports(false);schedulePreview(o);}
 catch(e){current=null;$('err').textContent=e.message;setExports(false);invalidPreview();}
}
function populate(o,raw){
 const baseText=o.panelCount?o.panelCount+' tile'+(o.panelCount===1?'':'s'):o.printedPanel?'Does not fit':'Existing panel';
 $('stats').innerHTML='<div class="countgrid"><div><strong>'+o.count+'</strong>Frame sections</div><div><strong>'+o.frameJointCount+'</strong>Frame joints</div><div><strong>'+o.panelCount+'</strong>Base tiles</div></div><div class="summaryline">'+o.totalCount+' parts total'+(o.faceplateCount?' | '+o.faceplateCount+' faceplates':'')+(o.includeStand?(o.isBorderless?' | 1 breakaway easel included':' | 2 rear supports'):'')+'</div>';
 $('frameAccessoriesSpec').textContent=o.frameJointCount+' / '+o.faceplateCount;$('styleSpec').textContent=o.styleName+' / '+o.loading+' loading';
 $('measureStyle').textContent=o.styleName+' | '+fmt(o.d)+' mm deep';
 $('standSpec').textContent=o.isBorderless?(o.includeStand?'Locking breakaway easel | '+o.displayOrientation+' | '+fmt(o.borderlessStandAngle)+' deg':'Wall display only'):o.includeStand?(o.standType==='fold'?'Fold-flat':'Rigid')+' | '+o.displayOrientation+' | 2 supports | '+fmt(o.standDisplayRearReach??o.standRearReach)+' mm rear reach':'No stand parts';
 $('standPrintView').hidden=o.standType!=='fold'&&!o.isBorderless;
 updateAssemblyGuide(o);
 $('sectionSpec').textContent=o.count;$('bezelSpec').textContent=fmt(o.b)+' mm / '+fmt(o.ov)+' mm';$('borderSpecLabel').textContent=o.isBorderless?'Border / straight-edge overlap':'Bezel / overlap';$('depthSpec').textContent=fmt(o.d)+' mm';$('panelSpec').textContent=baseText;
 $('panelSizeSpec').textContent=[o.w,o.h,o.t].map(fmt).join(' x ')+' mm';$('exteriorSpec').textContent=[o.ow,o.oh].map(fmt).join(' x ')+' mm';$('visibleSpec').textContent=[o.vw,o.vh].map(fmt).join(' x ')+' mm';
 $('seamSpec').textContent=o.panelCount>1?'0 mm nominal face gap':o.panelCount===1?'No seam':'Not generated';const pd=o.panelJointCount?FrameV3.panelRailDetails({H:o.t,g:o.panelJoint,grip:o.panelGrip,centerGap:o.panelCenterClearance}):null;$('skinSpec').textContent=pd?fmt(pd.frontFloor_mm)+' mm center skins / '+fmt(pd.edgePostWidth_mm)+' mm locking posts':o.panelCount?'Full thickness':'Not generated';
 $('centerClearanceHint').textContent='Clearance above and below the flat tongue, per face. Lower values reduce vertical play; higher values ease insertion. Default: 0.08 mm; range: 0.06 to 0.20 mm. Print a fit test after adjusting.';
 $('bedTag').textContent=fmt(o.bedX)+' x '+fmt(o.bedY)+' mm bed';$('usableArea').textContent='Area before reserves: '+fmt(o.usableX)+' x '+fmt(o.usableY)+' mm';
 updateExportLabels();
 $('panelLegend').textContent=o.panelCount?'Printable UV base':'Existing panel (reference)';$('keyLegend').hidden=true;$('frameKeyLegend').hidden=!o.frameKeyCount;$('faceplateLegend').hidden=!o.faceplateCount;
 $('feetToggle').disabled=!o.includeStand;
 $('bom').innerHTML=raw.map((p,i)=>'<tr data-index="'+i+'" tabindex="0" aria-label="Inspect '+friendly(p.name)+'"><td>'+friendly(p.name)+'</td><td>'+p.printBounds.size.map(fmt).join(' x ')+' mm'+(p.rotation?'<span class="bomrot">Rotated 90 degrees</span>':'')+(p.includesBreakawayStand?'<span class="bomrot">Includes breakaway easel</span>':'')+'</td><td>'+(p.bundledIn?'Included':'1')+'</td></tr>').join('');
 const old=$('partSelect').value,oldName=old==='all'||old==='panels'?old:$('partSelect').selectedOptions[0]?.textContent;
 $('partSelect').innerHTML='<option value="all">Full assembly</option>'+(o.panelCount?'<option value="panels">UV base</option>':'')+raw.map((p,i)=>'<option value="'+i+'">'+friendly(p.name)+'</option>').join('');
 const matching=[...$('partSelect').options].find(a=>a.value===oldName||a.textContent===oldName);$('partSelect').value=matching?matching.value:'all';
 const notice=$('panelNotice');notice.hidden=!o.panelLayout?.error;notice.dataset.state='warning';
 notice.textContent=o.panelLayout?.error||'';
 $('bomNote').textContent=o.isBorderless?'Print one copy of each frame section and panel. The easel is already attached to a frame section; its separate entry is for inspection or replacement only.':'Print one copy of each listed part at 100% scale. Select a row to inspect it.';
 drawSize(o);updateMeasurements(o);setExports(true);invalidatePlates();
}
function updateMeasurements(o){
 $('loadView').textContent=isLoading?'Seat panel':o.isBorderless?'Front load':o.isLight?'Rear load':'Load panel';
 $('measureBorderLabel').textContent=o.isBorderless?'Border':'Bezel';$('measureBezel').textContent=fmt(o.b)+' mm';$('measureOverlap').textContent=fmt(o.ov)+(o.isBorderless?' mm straight edges':' mm per edge');
 $('measureBed').textContent=fmt(o.usableX)+' x '+fmt(o.usableY)+' mm';
 const selected=$('partSelect').value,part=['all','panels'].includes(selected)?null:RAW[Number(selected)];
 $('panelToggle').disabled=selected!=='all';$('feetToggle').disabled=selected!=='all'||!o.includeStand;
 $('measurePart').hidden=!part&&selected!=='panels';
 if(part)$('measurePart').textContent=friendly(part.name)+' | Print size (X x Y x Z): '+part.printBounds.size.map(fmt).join(' x ')+' mm'+(part.rotation?' | Rotated 90 degrees to fit':'');
 if(selected==='panels')$('measurePart').textContent='Assembled UV base: '+[o.w,o.h,o.t].map(fmt).join(' x ')+' mm | '+o.panelCount+' tile'+(o.panelCount===1?'':'s');
 $('standPrintView').textContent=o.isBorderless?(part?.includesBreakawayStand?'Show assembled':'As printed'):part?.type==='foot'?'Show assembled':'Flat stand';
 $('explodeValue').textContent=fmt(Number($('explode').value))+' mm';for(const row of $('bom').children)row.dataset.selected=String(row.dataset.index===selected);drawBed(o,part);
}
function drawBed(o,selected){
 const candidates=$('partSelect').value==='panels'?RAW.filter(p=>p.type==='panel'||p.type==='panelKey'):RAW;
 const part=selected||[...candidates].sort((a,b)=>b.printBounds.size[0]*b.printBounds.size[1]-a.printBounds.size[0]*a.printBounds.size[1])[0];
 if(!part)return;
 const S=Math.min(330/o.bedX,147/o.bedY),W=o.bedX*S,H=o.bedY*S,x=(470-W)/2,y=10;
 const ux=x+o.margins.left*S,uy=y+o.margins.back*S,uw=o.usableX*S,uh=o.usableY*S;
 const pw=part.printBounds.size[0]*S,ph=part.printBounds.size[1]*S,px=ux+(uw-pw)/2,py=uy+(uh-ph)/2;
 $('bedPlan').setAttribute('viewBox','0 0 470 195');
 $('bedPlan').innerHTML='<rect x="'+x+'" y="'+y+'" width="'+W+'" height="'+H+'" fill="#dfe5e8" stroke="#889ca5"/><rect x="'+ux+'" y="'+uy+'" width="'+uw+'" height="'+uh+'" fill="#fff" stroke="#859da6" stroke-dasharray="3 2"/><rect x="'+px+'" y="'+py+'" width="'+pw+'" height="'+ph+'" fill="#d2e7e9" stroke="#126d78"/><text x="235" y="'+(y+H/2)+'" text-anchor="middle" font-size="11" fill="#204a53">'+part.printBounds.size.slice(0,2).map(fmt).join(' x ')+' mm</text><text x="235" y="175" text-anchor="middle" font-size="11" fill="#43545f">Bed: '+fmt(o.bedX)+' x '+fmt(o.bedY)+' mm | Usable: '+fmt(o.usableX)+' x '+fmt(o.usableY)+' mm</text><text x="235" y="189" text-anchor="middle" font-size="10" fill="#64717b">Shaded outer band = reserved margins | Front edge below</text>';
 $('bedCheckCaption').textContent=friendly(part.name)+(selected?'':' (largest footprint)')+(part.rotation?' | 90-degree rotation':'');
}
function drawSize(o){
 const s=Math.min(245/o.ow,114/o.oh),x=(297-o.ow*s)/2,y=23,w=o.ow*s,h=o.oh*s,b=o.b*s;
 let seams='';for(let c of o.layout.cells){if(c.col>0)seams+='<path d="M '+(x+c.x*s)+' '+y+' v '+b+' M '+(x+c.x*s)+' '+(y+h-b)+' v '+b+'"/>';if(c.row>0)seams+='<path d="M '+x+' '+(y+h-c.y*s)+' h '+b+' M '+(x+w-b)+' '+(y+h-c.y*s)+' h '+b+'"/>';}
 if(o.panelCount>1){
  const px=x+(o.b-o.ov)*s,py=y+(o.b-o.ov)*s;
  for(let i=1;i<o.panelLayout.nx;i++)seams+='<path stroke="#7c6b54" d="M '+(px+o.w/o.panelLayout.nx*i*s)+' '+py+' v '+o.h*s+'"/>';
  for(let i=1;i<o.panelLayout.ny;i++)seams+='<path stroke="#7c6b54" d="M '+px+' '+(py+o.h/o.panelLayout.ny*i*s)+' h '+o.w*s+'"/>';
 }
 $('sizePlan').setAttribute('viewBox','0 0 297 162');$('sizePlan').innerHTML='<text x="148.5" y="14" text-anchor="middle" font-size="11" fill="#126d78">'+(o.isBorderless?'FRONT LOAD: seat one edge, then flex the opposite border':o.isLight?'REAR LOAD: bottom edge first':'TOP: panel loading edge')+'</text><rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" fill="#374149"/><rect x="'+(x+b)+'" y="'+(y+b)+'" width="'+(w-2*b)+'" height="'+(h-2*b)+'" fill="#d6cab5"/><g stroke="#afbec5" stroke-width=".85">'+seams+'</g><text x="148.5" y="155" text-anchor="middle" font-size="11" fill="#63717b">'+o.count+' connected frame section'+(o.count===1?'':'s')+'; centered panel overlap '+fmt(o.ov)+' mm</text>';
}
function sceneFromRaw(){
 if(!MODEL)return [];
 const o=MODEL.params,ex=Number($('explode').value),chosen=$('partSelect').value,pose=p=>FrameV3.frameShelfPoint(p,o);
 if(chosen!=='all'&&chosen!=='panels'){
  const p=RAW[Number(chosen)];if(!p)return [];return [{name:p.name,type:p.type,vertices:p.printMesh.vertices,faces:p.printMesh.faces}];
 }
 const load=v=>o.isBorderless?[v[0],v[1],v[2]-Math.max(35,o.d+20)]:o.isLight?[v[0],v[1],v[2]+Math.max(35,o.d+20)]:[v[0],v[1]+o.h*.7,v[2]];
 const out=RAW.filter(p=>chosen!=='panels'||p.type==='panel'||p.type==='panelKey').map(p=>{
  const [dx,dy,dz]=FrameV3.previewOffset(p,o,ex);
  const mesh=p.displayMesh||p.mesh;
  const vertices=mesh.vertices.map(v=>{
   if(p.type==='foot')return pose([v[0]+p.displayOffset[0],v[1]+p.displayOffset[1],v[2]+p.displayOffset[2]+ex]);
   let point=[v[0]+dx,v[1]+dy,v[2]+dz+(['panelKey','frameKey'].includes(p.type)?ex*.8:p.type==='faceplate'?-ex*.8:0)];
   if(isLoading&&(p.type==='panel'||p.type==='panelKey'))point=load(point);return pose(point);
  });
  return {name:p.name,type:p.type,vertices,faces:mesh.faces};
 });
 if(!o.panelCount){const pm=FrameV3.mesh(MODEL.panel);out.push({name:'Artwork panel reference',type:'panel',vertices:pm.vertices.map(v=>pose(isLoading?load(v):v)),faces:pm.faces});}
 return out;
}
function updateAssemblyViewNotice(){
 const amount=Number($('explode').value),visible=amount>0&&['all','panels'].includes($('partSelect').value);
 $('assemblyViewNotice').hidden=!visible;
 $('assemblyViewText').textContent='Exploded view: '+fmt(amount)+' mm. Parts are separated for inspection; this is not their assembled position. Exports remain assembled or print-arranged.';
}
function refreshScene(reset=true){if(!MODEL)return;updateAssemblyViewNotice();updateMeasurements(MODEL.params);SCENE=sceneFromRaw();updateBuffers();if(reset)fitView();else{calculateFit();redraw();}setExports(!!current);}
function save(content,name,type='application/octet-stream'){const b=content instanceof Blob?content:new Blob([content],{type}),url=URL.createObjectURL(b),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),20000);}
function crc32(data){let c=0xffffffff;for(let b of data){c^=b;for(let j=0;j<8;j++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;}
function zip(files){let out=[],central=[],offset=0,enc=new TextEncoder();const now=new Date(),dd=((now.getFullYear()-1980)<<9)|((now.getMonth()+1)<<5)|now.getDate(),dt=(now.getHours()<<11)|(now.getMinutes()<<5)|(now.getSeconds()>>1);function hdr(n){let b=new Uint8Array(n);return[b,new DataView(b.buffer)];}
 for(let[name,content]of files){let n=enc.encode(name),d=typeof content==='string'?enc.encode(content):content instanceof Uint8Array?content:new Uint8Array(content),crc=crc32(d);let[b,v]=hdr(30);v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint16(10,dt,true);v.setUint16(12,dd,true);v.setUint32(14,crc,true);v.setUint32(18,d.length,true);v.setUint32(22,d.length,true);v.setUint16(26,n.length,true);out.push(b,n,d);let[c,cv]=hdr(46);cv.setUint32(0,0x02014b50,true);cv.setUint16(4,20,true);cv.setUint16(6,20,true);cv.setUint16(8,0x800,true);cv.setUint16(12,dt,true);cv.setUint16(14,dd,true);cv.setUint32(16,crc,true);cv.setUint32(20,d.length,true);cv.setUint32(24,d.length,true);cv.setUint16(28,n.length,true);cv.setUint32(42,offset,true);central.push(c,n);offset+=b.length+n.length+d.length;}
 let cs=central.reduce((n,b)=>n+b.length,0);let[e,v]=hdr(22);v.setUint32(0,0x06054b50,true);v.setUint16(8,files.length,true);v.setUint16(10,files.length,true);v.setUint32(12,cs,true);v.setUint32(16,offset,true);return new Blob([...out,...central,e],{type:'application/zip'});
}
function readme(o,raw){
 if(o.isBorderless)return [
 'CANVAS FRAME BUILDER 3.51.6 - FRONT SNAP BORDERLESS','Updated from 3.51.5; original application baseline Canvas_Frame_Builder_3.49.0. All dimensions are millimetres.',
 'MODEL SETTINGS',
 'Panel: '+[o.w,o.h,o.t].map(fmt).join(' x ')+' mm. Finished panel thickness is not changed.',
 'Frame: '+[o.ow,o.oh,o.d].map(fmt).join(' x ')+' mm. Rim wall: '+fmt(o.q)+' mm; edge clearance: '+fmt(o.pc)+' mm per side.',
 'Straight-edge retaining lip with relief at all four corners. Uniform visible border: '+fmt(o.b)+' mm per edge, including '+fmt(o.ov)+' mm artwork overlap. Every front edge shares the same plane; no raised clips. Panel face recess: '+fmt(o.front)+' mm. Compact frame depth: '+fmt(o.d)+' mm. Rear frame springs: '+(o.frameSpringsEnabled?'ENABLED: '+o.frontRetention.rearFlexureCount+' tangential rear-plane springs with '+fmt(o.rearFlexure.beamWidth)+' mm beams and '+fmt(o.rearFlexure.span)+' mm nominal span; keep relief slots clear.':'DISABLED: no rear spring relief slots; the rear perimeter is continuous and stiffer, potentially making front panel insertion harder.')+' Panel stops remain on the rigid inner rail. Thick panels increase depth automatically; the selected panel thickness stays exact.',
 'Rear walls: '+fmt(o.rearWallThickness)+' mm; general base: '+fmt(o.rearBaseThickness)+' mm; frame-section connector pads: '+fmt(o.backThickness)+' mm. Frame print orientation: rear face on bed.',
 'Adaptive easel: rear reach '+fmt(o.standRearReach)+' mm; shared receiver inset '+fmt(o.standMountHeight)+' mm. The mounting head and spring are not scaled.',
 'Shared hanger thickness: '+fmt(o.hangerThickness)+' mm total. The rigid easel capture gap follows it. Matching rear base thickness removes the raised mount pad.',
 'Sacrificial tabs: '+fmt(o.sacrificialTabThickness)+' mm thick by '+fmt(o.sacrificialTabWidth)+' mm wide; three bridges on rigid material.',
 'Corner lip relief: '+fmt(o.borderlessCorner)+' mm beside each corner. Outer border remains intact.',
 'Easel body web: '+fmt(o.easelThickness)+' mm. Perimeter, cross brace, hooks and spring stay 3.2 mm thick; the part is not uniformly thin. No physical load rating.',
 'Frame section choice: '+o.sectionMode+'; two-part direction: '+o.twoPartDirection+'.',
 'Latch arm: '+fmt(o.latchArm)+' mm; tooth reach: '+fmt(o.latchEngagement)+' mm; free spring tip bias: '+fmt(o.latchSpringBias)+' mm.',
 'PRINT ONE OF EACH',
 ...raw.filter(p=>!p.bundledIn).map(p=>'1 x '+p.name+' | '+p.printBounds.size.map(fmt).join(' x ')+' mm'+(p.includesBreakawayStand?' | easel attached by three sacrificial tabs':'')),
 'PRINTING','Use the supplied orientations, 100% scale, supports OFF. Use a 0.4 mm nozzle and 0.20 mm layers for the initial fit tests. Inspect the sliced toolpaths before printing. The frame is rear-face-down; any generated UV panels remain artwork-face-down. Do not use Auto Orient to flip these parts.',
 'FRAME ASSEMBLY',o.frameJointCount?'Join each row by sliding the rear tongues into their matching sockets; then join the rows. Keep the rear faces coplanar and stop when the front butt seams close. No loose keys or glue are required.':'The frame is one piece. No frame-section assembly is needed.',
 ...(o.panelCount>1?['PRINTED PANEL ASSEMBLY','Join the UV tiles into rows, then join complete rows with the artwork faces coplanar, using the existing integral locking edge posts. Keep the selected finished thickness unchanged.']:[]),
 'PANEL INSERTION','Use a rigid panel or the complete rigid photo/backer stack at the selected thickness. Test the closed-border coupon first. From the front, tuck one edge below the narrow lip, gently flex the opposite border outward, then lower the panel onto the rear stops. Work around the adjacent sides gradually; do not force all four edges in at once or bend the artwork. The straight portions of the border retain the panel; the corner lips are relieved. To remove, gently spread one border outward while pushing that panel edge forward from the open back, then lift it out through the front. Do not pry against the artwork face. Loose paper alone is not a structural panel.',
 ...(o.includeStand?['BREAKAWAY EASEL','The easel is already part of the frame section marked above. Do not print a second copy unless replacing it. After cooling, cut the three '+fmt(o.sacrificialTabThickness)+' mm-thick tabs flush. Do not twist the thin front rim.',
 'Use matching 3.51.6 frame and easel parts. There are two shared connected keyholes total, not separate wall and stand sockets. For tabletop use, turn the empty backing 180 degrees from the wall orientation, then seat the artwork upright. The assembled tabletop preview already shows this reversed backing. Place the integrated keyed head into the shared opening at the lower center. Align both bearing features with the wider entry sections and slide DOWN toward the frame bottom by 8 mm until the latch clicks. Both capture lands must engage the far face of the rib. With the release untouched, gently check upward sliding, straight pull-out and rocking. To remove, support the frame, press the release pad away from the frame, hold it while sliding UP 8 mm, then withdraw the head. The same stand fits the other shared keyhole when the backing is turned for landscape use. No extra socket is required.',
 'Stand tilt: '+fmt(o.borderlessStandAngle)+' degrees. Assembled rear reach: '+fmt(o.standDisplayRearReach)+' mm. Place the frame rear-bottom edge and easel foot on a level surface.']:['STAND','Wall-display version: no easel is included.']),
 'WALL HANGING','Remove the stand and turn the backing so the shared keyhole is above the artwork center. When changing from tabletop display, remove/reseat the artwork upright after turning the backing 180 degrees. Use the round entry and narrow throat of that SAME opening. Entry-center inset: '+fmt(o.wallHangerInsetsByOrientation.portrait)+' mm in portrait and '+fmt(o.wallHangerInsetsByOrientation.landscape)+' mm in landscape. Maximum screw head: 7 mm diameter and 2.1 mm thickness; maximum shank: 3.4 mm. Check the actual fixing and printed fit. No load rating is assigned.',
 'REVISED MECHANICS','Independent hanger and section-joint thicknesses; parameterized breakaway bridges; native circle/cubic source profiles. Start with the corner-relieved border and matching stand/receiver test. The entire printed arm curves toward the receiver. There is no preload block. The seated preview estimates first-contact deflection; it is not a stress simulation. Do not force a latch that cannot be released by hand.',
  'FIT TESTS','Print the closed 80 x 80 mm border test and its matching exact-thickness gauge first. This checks all four sides together, not an isolated clip. Test the rear section joint and the hanger/easel pair before committing to a complete frame. This is a first mechanical prototype. Snap force, material fatigue and load capacity have not been physically verified. No load rating is assigned.',
 'EXPORTS','Browser STL, 3MF and STEP use finely tessellated geometry (0.002 mm profile chord tolerance). Browser STEP remains mesh-derived. Use the Fusion builder or optional native STEP exporter for true circles/splines. All paths use the same analytic source dimensions. The assembled preview and assembly STEP show the detached easel in use; print parts show it parked on the frame. A replacement easel may be exported individually from Parts.',
 ].join('\n\n');
 return `FRAME AND UV PANEL - PRINTING AND ASSEMBLY
All dimensions are in mm.

MODEL SETTINGS
Frame: ${o.styleName}; ${o.loading} loading.
Rear structure: ${o.closedFront?'Reinforced':'Original profile'}.
Panel: ${[o.w,o.h,o.t].map(fmt).join(' x ')} mm.
Frame exterior: ${[o.ow,o.oh,o.d].map(fmt).join(' x ')} mm.
Visible artwork: ${fmt(o.vw)} x ${fmt(o.vh)} mm.
Bezel: ${fmt(o.b)} mm. Artwork overlap: ${fmt(o.ov)} mm per edge.
Panel clearance per edge: ${fmt(o.pc)} mm. Back clearance: ${fmt(o.rg)} mm.
Mounting: ${o.dualMounts?'Portrait and landscape; move the same feet between socket pairs':'Current orientation only'}.
Display orientation: ${o.displayOrientation}. Wall fixing spacing: ${fmt(o.hangerSpacing)} mm.
Frame joint clearance: ${fmt(o.kc)} mm per side. Seating grip: ${fmt(o.jointGrip)} mm per side.
Connector underside clearance: ${fmt(o.frameRampClearance)} mm vertically.
Ramp base relief: ${fmt(o.frameBaseRelief)} mm; socket sidewalls: 2.0 mm.
Retaining-clip clearance: ${fmt(o.retainerClearance)} mm at the panel edge.
UV post clearance: ${fmt(o.panelJoint)} mm. Hook engagement adjustment: ${fmt(o.panelGrip)} mm.
Flat tongue vertical clearance: ${fmt(o.panelCenterClearance)} mm per face.
Lower tongue clearance reduces vertical play; higher clearance eases insertion.
Adjust in 0.01 mm steps within 0.06 to 0.20 mm. Print a fit test after adjusting.

PARTS - PRINT ONE COPY OF EACH
${raw.map(p=>'1 x '+p.name+' | '+p.printBounds.size.map(fmt).join(' x ')+' mm').join('\n')}

PRINTING
Bed: ${fmt(o.bedX)} x ${fmt(o.bedY)} mm; usable area: ${fmt(o.usableX)} x ${fmt(o.usableY)} mm.
Margins left / right / front / back: ${[o.margins.left,o.margins.right,o.margins.front,o.margins.back].map(fmt).join(' / ')} mm.
Print at 100% scale in the supplied orientations, with supports off.
Every UV face must contact the PEI bed. Use a 0.4 mm nozzle and 0.20 mm layers for the fit test.
Separate plate files keep your current slicer settings. Open one plate at a time.
Native multi-plate projects load the Bambu settings project imported in Printer settings.
Preserve imported positions and print by layer. Allow room for brims and printer exclusion areas.

FRAME ASSEMBLY
${o.closedFront?`Place the socket section face-down. Lower the mating heads into the sockets
from the back, perpendicular to the face. Press near each joint until the
faces are flush and the male tongue clicks under the receiver ledge.
Join rows right to left, then lower each bottom row into the row above.
To release, press the male tongue toward the seam and lift while holding it pressed.
Do not slide the heads sideways or bend the female socket.`:`Lay the sections face-down. Align the tongues and sockets, then push
together along the rail until the barbs engage.`}
Print the joint fit test first. Adjust underside clearance if the ramp binds, or side clearance and seating grip if the joint moves freely. Export both mating parts after adjusting.

PANEL ASSEMBLY AND LOADING
${o.panelLayout?.error?o.panelLayout.error:o.panelCount>1?`Assemble the UV panel before installing it in the frame.
Join tiles into full rows first, then join the rows. Start both posts together
and push evenly, keeping the UV faces parallel, until both outside hooks engage.
Check full seating, face alignment and retention.`:o.panelCount===1?'Print the one-piece panel UV face down on PEI.':'Use an existing panel with the dimensions above.'}
${o.isLight?`Load from the rear. Put the bottom panel edge under the lower ledge,
hold the side and top clips outward as needed, lower the panel and release each clip over the panel edge.
Release the top clips, then the side clips, to remove the panel.`:`Slide the panel through the top opening with the artwork facing the front lip.
Keep the loading edge upright.`}

SHELF DISPLAY
${o.includeStand?(o.standType==='fold'?`Print both supports flat. Fold away from the raised hooks and engage the
locking tip to form each triangular brace. Test the ${fmt(o.standHinge)} mm fold webs with your filament.`:'Print one left and one right rigid support in the supplied orientations.')+'\nHold the release tongue away from the frame, insert the hooks into the rear sockets and slide upward about 2 mm. Release the tongue into its pocket and check that the support cannot slide down.\nTo remove, pull the release tongue away, slide down and withdraw.\nPlace both rear feet and the frame bottom edge on a level surface.\nRear reach: '+fmt(o.standDisplayRearReach??o.standRearReach)+' mm.':'Select a shelf stand in the builder to export rear supports.'}

WALL MOUNTING
Fixing spacing: ${fmt(o.hangerSpacing)} mm center to center.
Maximum head: ${fmt(o.hangerHead)} mm diameter x ${fmt(o.hangerHeadThickness)} mm thick.
Maximum shank: ${fmt(o.hangerShank)} mm. Use a head wider than the narrow slot.
Check the printed fit with your wall fixings.

VIEWER
Left-drag uses Rotate or Pan. Right, middle or Shift-drag pans. Scroll zooms.
F fits the model. O switches camera projection. Drag dividers to resize panels.
Keep the builder open when using the detached viewer.
Use individual part exports for printing; assembly exports show assembled positions.
`;}

function nameBase(o){return 'Frame_UV_Panel_v3_51_0_'+(o.frameStyle==='solid'?'top_loading':o.frameStyle)+(o.faceplateCount?'_'+o.faceplateStyle:'')+'_'+(o.isBorderless?'rear_cross_brace':o.closedFront?o.structure:'original')+'_'+o.standType+'_'+fmt(o.w)+'x'+fmt(o.h)+'x'+fmt(o.t)+'mm_B'+fmt(o.b)+'_O'+fmt(o.ov);}
async function doExport(action){
 if(!current||!MODEL||exportBusy||canvas.dataset.previewStatus!=='ready')return;
 const snapshot={model:MODEL,raw:RAW.slice(),selected:$('partSelect').value,format:$('exportFormat').value,plateGap:readPlateGap(),platePackaging:readPlatePackaging(),bambuTemplate:readBambuTemplate()};
 exportBusy=true;setExports(false);exportMessage('Preparing files for '+fmt(snapshot.model.params.w)+' x '+fmt(snapshot.model.params.h)+' mm...');
 await new Promise(r=>setTimeout(r,40));
 try{await action(snapshot);exportMessage('Files prepared. Check your browser downloads.');}
 catch(e){exportMessage('Export failed: '+e.message);console.error(e);}
 finally{exportBusy=false;setExports(!!current&&canvas.dataset.previewStatus==='ready');}
}

function frameJointTestName(o){return 'Frame_Joint_Fit_v3_51_0_'+(o.frameStyle==='solid'?'top_loading':o.frameStyle)+'_'+fmt(o.w)+'x'+fmt(o.h)+'x'+fmt(o.t)+'mm_B'+fmt(o.b)+'_O'+fmt(o.ov);}
function manifest(o,raw){return {physicalPrintTested:false,baseApplication:'3.49.0',previousApplication:'3.51.5',borderless:o.isBorderless?{sectionMode:o.sectionMode,twoPartDirection:o.twoPartDirection,frameSpringsEnabled:o.frameSpringsEnabled,easelThickness_mm:o.easelThickness,easelReinforcement_mm:o.easelReinforcement,easelMatchesBase:o.matchEaselBase,splitValidation:o.splitValidation,frameCenter:o.frameCenter,frontRetention:o.frontRetention,rimWall_mm:o.q,snapOverlap_mm:o.ov,rearRib_mm:o.backThickness,rearBase_mm:o.rearBaseThickness,rearWall_mm:o.rearWallThickness,cornerRelief_mm:o.borderlessCorner,standAngle_degrees:o.borderlessStandAngle,hangerThickness_mm:o.hangerThickness,tabThickness_mm:o.sacrificialTabThickness,tabWidth_mm:o.sacrificialTabWidth,adaptiveEasel:{rearReach_mm:o.standRearReach,receiverInset_mm:o.standMountHeight,parkingTurn_degrees:o.parkSwap?90:0,headScaled:false},curveSource:'circle/cubic Bezier/arc',meshChordTolerance_mm:.002,framePrintFace:'rear',standPrintedWithFrame:o.includeStand,standParking:o.standParking,hangers:o.hangerLocations,depthProfile:o.depthProfile,wallHangerInsets_mm:o.wallHangerInsets,wallHangerInsetsByOrientation_mm:o.wallHangerInsetsByOrientation,activeWallHangerEdge:o.activeWallHangerEdge,sharedConnectorCount:o.sharedConnectorCount,sharedConnectorShape:o.sharedConnectorShape,mountingConversion:o.sharedMounting,assemblyFrameRotation_degrees:o.assemblyFrameRotation}:null,version:'3.51.6',connectionRevision:o.connectionRevision,panelConnectionRevision:o.panelConnectionRevision,standMountRevision:o.standMountRevision,units:'mm',weightRating_kg:null,frame:{style:o.frameStyle,structure:o.isBorderless?'rear_cross_brace':o.closedFront?o.structure:'original',loading:o.loading,depth_mm:o.d,connectorDepth_mm:o.frameJointDepth,connectorDependsOnStructure:false,frontSkin_mm:o.front,frontSeamShape:o.isBorderless?'straight front butt seam':o.closedFront?'straight section seam':'original snap',blindSocketFloor_mm:o.closedFront?o.blindFrameJoint.floor:null,maleLatchThickness_mm:o.closedFront?o.blindFrameJoint.post:null,integralJoints:o.frameJointCount,frameKeys:0,faceplates:o.faceplateCount,faceplateStyle:o.faceplateStyle,depthMode:o.depthMode,printHeight_mm:o.d,runningClearance_mm:o.kc,seatingGripPerSide_mm:o.jointGrip,undersideClearance_mm:o.frameRampClearance,baseRelief_mm:o.frameBaseRelief,socketSideWall_mm:o.closedFront?o.blindFrameJoint.femaleSideWall:null,retainerClearance_mm:o.retainerClearance,retainers:o.retainerLocations},mounting:{bothOrientations:o.dualMounts,displayOrientation:o.displayOrientation,quarterTurn:o.mountQuarterTurn,hangerSpacings_mm:o.hangerSpacings},stand:{type:o.standType,count:o.standCount,frontProjection_mm:0,frameLift_mm:0,rearReach_mm:o.standDisplayRearReach??o.standRearReach,portCenters_mm:o.standPorts,latch:o.standLatch,hingeThickness_mm:o.standType==='fold'?o.standHinge:null},bed:{nominal:[o.bedX,o.bedY],usable:[o.usableX,o.usableY],margins:o.margins},panelEnvelope:[o.w,o.h,o.t],panel:{tiles:o.panelCount,integralJoints:o.panelJointCount,lockingCatches:o.panelLockCount,rearKeys:0,frontSeamAllowance_mm:0,frontSeamShape:o.panelJointCount?'nominal zero-gap face seam with continuous captured overlap':'none',frontFaceClosed:true,minimumSocketFloor_mm:o.panelJointCount?FrameV3.panelRailDetails({H:o.t,g:o.panelJoint,grip:o.panelGrip,centerGap:o.panelCenterClearance}).frontFloor_mm:o.t,runningClearance_mm:o.panelJoint,tongueClearancePerFace_mm:o.panelCenterClearance,seamVerticalClearance_mm:o.panelCenterClearance,seamProjection_mm:.70,seamSocketDepth_mm:.95,seatingGripPerSide_mm:o.panelGrip,lockingGeometryBaseline:'V3.51.5',sidePostsConcealed:false,rootCornerRadius_mm:1.50,femaleRootCornerRadius_mm:1.70,rootCornerTreatment:'larger receiver radius plus running clearance',nominalLatchPlay_mm:.12,continuousSeams:o.panelJointCount/3,centerLatches:0,physicalPrintTested:false,keySystem:o.panelJointCount?'established hook fit; relieved opposing post roots; full-length captured overlap':null,keyDetails:o.panelJointCount?FrameV3.panelRailDetails({H:o.t,g:o.panelJoint,grip:o.panelGrip,centerGap:o.panelCenterClearance}):null,printTune:{nozzle_mm:0.40,layer_mm:0.20,minimumStructuralWidth_mm:0.8,noSeparateConnectors:true,finishedThicknessPreserved:true,allUVFacesOnPEI:true}},parts:raw.filter(p=>!p.bundledIn).map(p=>({name:p.name,type:p.type,quantity:1,includesBreakawayStand:!!p.includesBreakawayStand,print_dimensions_mm:p.printBounds.size,xy_rotation_degrees:p.rotation,printFace:p.printFace||'original orientation',optional:p.type==='foot'}))};}
async function exportZip(raw,suffix='',o=MODEL.params,snapshot=null){
 raw=raw.filter(p=>!p.bundledIn);
 const base=nameBase(o)+suffix,p=base+'/',files=[[p+'READ_ME.txt',readme(o,raw)],[p+'Parameters.json',JSON.stringify(inputSnapshot(o),null,2)],[p+'Print_List.json',JSON.stringify(manifest(o,raw),null,2)],[p+'Assembly_Layout.svg',new XMLSerializer().serializeToString($('sizePlan'))]];
 for(let a of raw)files.push([p+'STL/'+a.name+'.stl',FrameV3.binarySTL(a.printMesh)]);
 const layout=await arrangedFiles({...snapshot,model:snapshot?.model||MODEL,raw,scope:suffix==='_Frame_Only'?'frame':suffix==='_Panel_Only'?'panel':'all',plateGap:snapshot?.plateGap??readPlateGap()},p+'Print_Plates/');files.push(...layout.files);
 save(zip(files),base+'.zip');
}
$('download').onclick=()=>doExport(snapshot=>snapshot.format==='3mf'?downloadArranged(snapshot):snapshot.format==='step'?downloadStepSet(snapshot):exportZip(snapshot.raw,'',snapshot.model.params,snapshot));
$('downloadFrame').onclick=()=>doExport(s=>exportZip(s.raw.filter(p=>['frame','frameKey','faceplate','foot'].includes(p.type)),'_Frame_Only',s.model.params,s));
$('downloadPanel').onclick=()=>doExport(s=>{const panels=s.raw.filter(p=>p.type==='panel'||p.type==='panelKey');if(!panels.length)throw Error('No printable panel is available.');return exportZip(panels,'_Panel_Only',s.model.params,s);});
async function prepareFitTests(snapshot){
 const test=snapshot.testScope==='frame_repair'?FrameV3.frameRepairFitTest(snapshot.model.params):snapshot.testScope==='frame_joints'?FrameV3.frameJointFitTest(snapshot.model.params):snapshot.testScope==='uv_joint'?FrameV3.panelFitTest(snapshot.model.params):FrameV3.selectedFitTests(snapshot.model.params),o=test.params,cache=new WeakMap();
 if(!test.parts.length)throw Error('This model has no assembly connections to test.');
 const raw=[];
 for(const [i,p] of test.parts.entries()){
  exportMessage('Preparing fit test '+(i+1)+' / '+test.parts.length+': '+friendly(p.name));await stepPause();
  const mesh=FrameV3.mesh(p.spec,cache);FrameV3.validatePanelFront(p,mesh,o);const pm=FrameV3.printMesh(mesh,o,p);
  raw.push({...p,mesh,bounds:FrameV3.bounds(mesh),printMesh:pm,printBounds:FrameV3.bounds(pm),rotation:pm.rotation});
 }
 return {test,raw,o};
}
function fitTestManifest(test,raw){return {version:'3.51.6',units:'mm',scope:'fit_tests',...test.testSelection,settings:inputSnapshot(test.params),parts:raw.map(p=>({name:p.name,group:p.testGroup,role:p.testRole,quantity:1,print_dimensions_mm:p.printBounds.size,xy_rotation_degrees:p.rotation}))};}
async function downloadFitTests(snapshot){
 if(snapshot.format==='step')return downloadStepTests(snapshot);
 const {test,raw,o}=await prepareFitTests(snapshot),base=snapshot.testScope==='frame_joints'?frameJointTestName(o):nameBase(o)+(snapshot.testScope==='frame_repair'?'_Frame_and_Clip_Test':snapshot.testScope==='uv_joint'?'_UV_Panel_Joint_Test':'_Fit_Tests'),p=base+'/',files=[];
 if(snapshot.format==='3mf')return downloadArranged({...snapshot,model:test,raw,downloadSuffix:snapshot.testScope==='frame_repair'?'_Frame_and_Clip_Test':snapshot.testScope==='frame_joints'?'_Frame_Joint_Test':snapshot.testScope==='uv_joint'?'_UV_Panel_Joint_Test':'_Fit_Tests'});
 files.push([p+'PRINT_FIRST.txt',fitGuide(o,test)+'\n\n'+fitTestPartsText(raw)],
  [p+'Parameters.json',JSON.stringify(inputSnapshot(o),null,2)],
  [p+'Part_List.json',JSON.stringify(fitTestManifest(test,raw),null,2)],
  [p+'Geometry_Specification.json',JSON.stringify(test)]);
 for(const a of raw)files.push([p+a.name+'.stl',FrameV3.binarySTL(a.printMesh)]);
 const arranged=await arrangedFiles({...snapshot,model:test,raw},p+'Print_Plates/');files.push(...arranged.files);
 save(zip(files),base+'.zip');
}
$('fitTest').onclick=()=>doExport(downloadFitTests);
$('frameJointTest').onclick=()=>doExport(snapshot=>downloadFitTests({...snapshot,testScope:'frame_joints'}));
$('frameRepairTest').onclick=()=>doExport(snapshot=>downloadFitTests({...snapshot,testScope:'frame_repair'}));
$('panelJointTest').onclick=()=>doExport(snapshot=>downloadFitTests({...snapshot,testScope:'uv_joint'}));
$('dlscad').onclick=()=>doExport(snapshot=>{
 const o=snapshot.model.params,base=nameBase(o)+'_Sources',p=base+'/',files=[[p+'Parameters.json',JSON.stringify(inputSnapshot(o),null,2)],[p+'README.txt','Size-specific CSG / SCAD sources. Change settings in the browser builder to regenerate. STEP CAD files can be downloaded directly from this builder. The full package also contains an optional CadQuery command-line exporter.\n\n'+readme(o,snapshot.raw)],[p+'Geometry_Specification.json',JSON.stringify(snapshot.model)]];
 for(let a of snapshot.raw.filter(p=>!p.bundledIn)){let lo=a.bounds.min,transform=a.printFlip?'translate('+JSON.stringify([-lo[0],a.bounds.max[1],a.bounds.max[2]])+') rotate([180,0,0])':'translate('+JSON.stringify(lo.map(x=>-x))+')';if(a.rotation)transform='translate(['+a.bounds.size[1]+',0,0]) rotate([0,0,90]) '+transform;
 files.push([p+a.name+'.scad','// Frame and UV Panel Builder v3.45; millimetres; supplied print orientation.\n'+transform+'{\n'+FrameV3.scad(a.spec)+'\n}\n']);}
 save(zip(files),base+'.zip');
});
$('dlpart').onclick=()=>doExport(snapshot=>{const p=snapshot.raw[Number(snapshot.selected)];if(p)save(FrameV3.binarySTL(p.printMesh),p.name+'.stl');});
$('preset').onchange=()=>{if($('preset').value!=='custom'){const[w,h]=$('preset').value.split(',');$('w').value=w;$('h').value=h;}update();};for(let id of fields)$(id).addEventListener('input',()=>{if(id==='w'||id==='h')$('preset').value='custom';if(id==='bedX'||id==='bedY')$('bedPreset').value='custom';update();});
$('swap').onclick=()=>{const w=$('w').value;$('w').value=$('h').value;$('h').value=w;$('preset').value='custom';update();};
$('partSelect').onchange=()=>refreshScene();
$('standPrintView').onclick=()=>{if(MODEL?.params.isBorderless){const i=RAW.findIndex(p=>p.includesBreakawayStand);$('partSelect').value=$('partSelect').value===String(i)?'all':String(i>=0?i:0);refreshScene();return;}const selected=RAW[Number($('partSelect').value)];if(selected?.type==='foot'){$('partSelect').value='all';refreshScene();presetView(-.44,.18);}else{$('partSelect').value=String(RAW.findIndex(p=>p.type==='foot'));refreshScene();presetView(0,0);}};
$('resetAssemblyView').onclick=()=>{$('explode').value='0';$('partSelect').value='all';isLoading=false;$('loadView').setAttribute('aria-pressed','false');refreshScene();};
$('explode').oninput=()=>{$('explodeValue').textContent=fmt(Number($('explode').value))+' mm';refreshScene(false);};$('loadView').onclick=()=>{isLoading=!isLoading;if(isLoading)$('panelToggle').checked=true;$('loadView').setAttribute('aria-pressed',String(isLoading));$('loadView').textContent=isLoading?'Seat panel':'Load panel';$('partSelect').value='all';refreshScene();};

$('panelSource').onchange=$('panelSplit').onchange=$('standType').onchange=$('frameStyle').onchange=$('faceplateStyle').onchange=$('displayOrientation').onchange=update;
$('customMargins').onchange=()=>{if($('customMargins').checked)for(let id of ['marginLeft','marginRight','marginFront','marginBack'])$(id).value=$('margin').value;update();};
$('bedPreset').onchange=()=>{if($('bedPreset').value!=='custom'){const [x,y]=$('bedPreset').value.split(',');$('bedX').value=x;$('bedY').value=y;}update();};

// Screen layout only. Changing tabs never changes model or camera settings.
let panelLayout=null;
function setDetailsOpen(open,notify=true){
 $('detailsCard').classList.toggle('is-collapsed',!open);$('detailBody').hidden=!open;
 $('detailsToggle').textContent=open?'Hide details':'Show details';$('detailsToggle').setAttribute('aria-expanded',String(open));
 if(notify&&panelLayout)panelLayout.changed();
}
function showSettings(name,focus=false){
 for(const button of document.querySelectorAll('[data-settings]')){const active=button.dataset.settings===name;button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;$('settings'+button.dataset.settings).hidden=!active;if(active&&focus)button.focus();}
 $('settingsScroll').scrollTop=0;
}
function showDetail(name,focus=false){
 if(name==='Plates')setTimeout(ensurePlatePreview,0);
 setDetailsOpen(true,false);
 for(const button of document.querySelectorAll('[data-detail]')){const active=button.dataset.detail===name;button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;$('detail'+button.dataset.detail).hidden=!active;if(active&&focus)button.focus();}
 $('detailBody').scrollTop=0;if(panelLayout)panelLayout.changed();
}
for(const button of document.querySelectorAll('[data-settings]'))button.onclick=()=>showSettings(button.dataset.settings);
for(const button of document.querySelectorAll('[data-detail]'))button.onclick=()=>showDetail(button.dataset.detail);
for(const group of document.querySelectorAll('[role="tablist"]'))group.addEventListener('keydown',e=>{
 if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
 const buttons=[...group.querySelectorAll('[role="tab"]')],index=buttons.indexOf(document.activeElement);if(index<0)return;
 const target=buttons[e.key==='Home'?0:e.key==='End'?buttons.length-1:(index+(e.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length];e.preventDefault();target.click();target.focus();
});
$('detailsToggle').onclick=()=>setDetailsOpen($('detailsCard').classList.contains('is-collapsed'));
$('moreExports').onclick=()=>{showDetail('Export');if(window.innerWidth<=800)$('detailsCard').scrollIntoView({behavior:'smooth',block:'nearest'});};
$('helpButton').onclick=()=>showDetail('Assembly');
$('mobileSettings').onclick=()=>{$('settingsSidebar').scrollIntoView({behavior:'smooth',block:'start'});};
function inspectRow(e){const row=e.target.closest('tr[data-index]');if(!row)return;$('partSelect').value=row.dataset.index;refreshScene();}
$('bom').addEventListener('click',inspectRow);$('bom').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();inspectRow(e);}});

$('exportFormat').onchange=()=>{updateExportLabels();try{localStorage.setItem('canvasFrameExportFormat', $('exportFormat').value);}catch(_){};};
try{const f=localStorage.getItem('canvasFrameExportFormat');if(['step','stl','3mf'].includes(f))$('exportFormat').value=f;}catch(_){}

function fitTestPartsText(raw){return 'PRINT ONE OF EACH LISTED PART\n'+raw.map(p=>'1 x '+p.name+' | '+p.printBounds.size.map(fmt).join(' x ')+' mm').join('\n');}
function fitGuide(o,test=null){
 if(o.isBorderless&&test?.testSelection?.mode==='front_snap_stand')return 'SHARED KEYHOLE AND EASEL FIT TEST 3.51.6\n\nPrint both parts at 100% scale in their supplied orientations, supports OFF. The receiver has ONE connected opening. For this tabletop test orient its round entry nearer the lower end, matching the assembled preview. Insert the integrated head into the wider entry sections, slide DOWN 8 mm and release the pad into the locking bay. Both rigid capture lands must engage the far face. Without pressing the release, gently test straight withdrawal, upward sliding, rocking and sideways twisting. To remove, hold the pad away from the receiver and slide UP 8 mm before withdrawing. Inspect the spring and shoulder edges after repeated cycles. A normal screw uses the same round entry and narrow throat after the receiver is turned 180 degrees for wall use. Test with the actual screw. No physical load, fatigue or durability rating is assigned.';
 if(o.isBorderless)return 'FRONT SNAP BORDERLESS - FIT TESTS 3.51.6\n\nPrint one of each listed part, in the supplied orientation, at 100% scale, supports OFF.\n\nBORDER: Tuck one edge of the 80 x 80 mm rigid gauge beneath the straight retaining lip from the front. Spread the opposite border gently and lower it onto its stops. Do not bend or force the panel. The four corners have no lip overhang. Check straight-border retention. '+(o.frameSpringsEnabled?'The rear relief slots remain open.':'Springs are disabled, so the rear perimeter is solid; panel insertion may take more force.')+' Full frames can flex differently from the test.\n\nSHARED MOUNT: The receiver has one connected keyed opening for a wall screw or the integrated easel head. Turn the backing 180 degrees when changing wall/table use, before reseating the artwork upright. For tabletop use insert the head, slide DOWN 8 mm and release the latch. Both bearing lands must capture the far face. The free arm and tooth curve toward the receiver. Seating moves the arm slightly outward against solid rib at the bay edge. There is no added preload block. The printed model is the unstrained shape; the assembled preview is only a first-contact estimate. Test the frame under its actual weight over a soft surface; do not leave an unverified assembly unattended. Check upward sliding, straight pull-out and rocking without touching the release. Press the release pad away and slide UP 8 mm to remove. Use matching 3.51.6 parts, not older receivers.\n\nFRAME/UV JOINTS: Join matching male and female specimens without force. Keep panel faces coplanar and the selected finished thickness unchanged.\n\nInspect every sliced plate and test with the actual filament. Physical fit, fatigue and load capacity are unverified.';

 test=test||FrameV3.selectedFitTests(o);const groups=new Set(test.parts.map(p=>p.testGroup));
 const lines=['FIT TESTS - MODEL SETTINGS','Print one of each listed part at 100% scale in the supplied orientations, with supports off.',
  'Panel thickness: '+fmt(o.t)+' mm. Frame: '+o.styleName+(test.testSelection.mode==='frame_joints_only'?'':' / '+(o.closedFront?o.structure:'original'))+'.',
  'Frame clearance: '+fmt(o.kc)+' mm per side; seating grip: '+fmt(o.jointGrip)+' mm per side. Connector underside clearance: '+fmt(o.frameRampClearance)+' mm vertically. Ramp base relief: '+fmt(o.frameBaseRelief)+' mm.'];
 if(test.testSelection.frameJointTypes)lines.push(o.closedFront?'FRAME: Place the socket face-down. Lower the male head from the back until the faces are flush and the male tongue clicks under the receiver ledge. To release, press the tongue toward the seam, then lift while holding it pressed. Do not slide the head sideways or bend the socket.':'FRAME: Lay the male and socket parts face-down. Align the tongues and push together along the rail until the barbs engage.');
 if(test.testSelection.frameJointTypes>1)lines.push('Use each male part with its matching Main or Top socket.');
 if(groups.has('uv_joint'))lines.push('UV PANEL: Print both UV faces down on PEI with a 0.4 mm nozzle and 0.20 mm layers. Start both posts together and push evenly, keeping the faces parallel, until both outside hooks engage. Check full seating, face alignment and retention.',
  'Post clearance: '+fmt(o.panelJoint)+' mm. Structural edge-post engagement: '+fmt(o.panelPostLength)+' mm. Long edge-post reach: '+fmt(o.panelPostLength)+' mm. Hook engagement adjustment: '+fmt(o.panelGrip)+' mm. Flat tongue vertical clearance: '+fmt(o.panelCenterClearance)+' mm per face. Lower tongue clearance reduces vertical play; higher clearance eases insertion. Adjust in 0.01 mm steps from 0.06 to 0.20 mm and print a new matching pair. Use the tightest setting that seats fully without forcing.');
 if(groups.has('panel_retainer'))lines.push(test.testSelection.reusePanelAsThicknessGauge?'PANEL RETAINER: Use a plain outer edge of either UV test tile to check the retainer. Clip clearance: '+fmt(o.retainerClearance)+' mm. Release the clip outward before removing the tile.':'PANEL RETAINER: Use the included panel-thickness gauge to check the retainer. Clip clearance: '+fmt(o.retainerClearance)+' mm. Release the clip outward before removing the gauge.');
 if(groups.has('stand_mount'))lines.push('STAND: '+(o.standType==='fold'?'Fold away from the hooks and lock the brace before mounting. ':'')+'Hold the release tongue away from the frame, seat the hooks and slide upward about 2 mm. Release the tongue into its pocket and check that the foot cannot slide down. Pull the tongue away before sliding down to remove.');
 if(test.parts.some(p=>p.testRole==='faceplate'))lines.push('FACEPLATE: Assemble the matching frame joint, then press the cover into the joint slots. Remove it before releasing the joint.');
 lines.push('Select your printer and filament profiles before slicing. Keep imported positions and print by layer.');
 return lines.join('\n\n');
}

function updateAssemblyGuide(o){
 if(o.isBorderless){
  $('frameAssemblyGuide').innerHTML='<ol><li>Print frame sections rear-face-down and UV panels artwork-face-down, supports off.</li><li>Join matching rear tongues with their faces coplanar.</li><li>Choose wall or tabletop orientation BEFORE seating the artwork. For tabletop use the empty backing turns 180 degrees from its wall orientation; the same shared keyholes are now at the lower center and side.</li><li>From the front, tuck one panel edge under the uniform lip, gently spread the opposite border and seat the panel on its stops.</li></ol><p>Compact depth: '+fmt(o.d)+' mm. Two shared keyholes only, '+fmt(o.standMountHeight)+' mm from their edges. '+(o.frameSpringsEnabled?'Rear spring slots must stay open.':'Rear springs disabled: solid perimeter; avoid forcing the panel.')+' Test the updated coupons first.</p>';
  $('standAssemblyGuide').innerHTML='<h3>Shared keyhole easel</h3>'+(o.includeStand?'<ol><li>Cut the three thin joining tabs on the rigid stand after cooling.</li><li>With the backing in tabletop orientation, insert the one keyed head into the lower shared opening. Slide DOWN 8 mm until the spring latch clicks.</li><li>Both bearing lands capture the far face of the rib. Check upward sliding, straight pull-out and rocking with the release untouched.</li><li>Support the frame, press the release pad away, hold it and slide UP 8 mm to remove.</li><li>For wall display, remove/reseat the panel after turning the backing 180 degrees. The wall screw uses that same opening. The same stand also fits the second shared opening for landscape use.</li></ol><p>The assembled view shows the reversed tabletop backing. As printed shows the original frame section with parked stand. Use matching 3.51.6 parts.</p>':'<p>Two shared keyholes remain available. Select Integrated breakaway easel to include the matching stand. Wall and tabletop use the same backing, turned 180 degrees before installing the artwork.</p>');
  $('faceplateAssemblyGuide').hidden=true;return;
 }

 $('standAssemblyGuide').innerHTML='<h3>Shelf stand</h3>'+(o.includeStand?'<ol>'+(o.standType==='fold'?'<li>Print both supports flat. Fold away from the raised hooks, then engage the locking tip to form each triangular brace.</li>':'<li>Print one left and one right rigid support in the supplied orientations.</li>')+'<li>Hold the release tongue away from the frame, insert the hooks into the rear sockets and slide upward about 2 mm. Release the tongue into its pocket and check that the support cannot slide down.</li><li>To remove, pull the release tongue away, slide down and withdraw.</li>'+(o.dualMounts?'<li>For the other orientation, remove both feet, turn the frame a quarter turn and attach them to the other socket pair. Use the Display orientation selector to see the correct positions.</li>':'')+'<li>Place both rear feet and the frame bottom edge on a level surface.</li></ol><p>Rear reach: '+fmt(o.standDisplayRearReach??o.standRearReach)+' mm.'+(o.standType==='fold'?' Print a fold test with your filament and selected '+fmt(o.standHinge)+' mm web thickness.':'')+'</p>':'<p>Select a shelf stand to include rear supports in the export.</p>');
 const join=o.closedFront?'Place the socket section face-down. Lower the mating heads into the sockets from the back, perpendicular to the face. Press near each joint until the faces are flush and the male tongue clicks under its receiver ledge. Join rows right to left, then lower each bottom row into the row above. To release, press the male tongue toward the seam and lift while holding it pressed. Do not slide the heads sideways or bend the socket.':'Lay the sections face-down. Align the tongues and sockets, then push together along the rail until the barbs engage.';
 const load=o.isLight?'Load from the rear. Put the bottom panel edge under the lower ledge, hold the side and top clips outward as needed, lower the panel and release each clip over the panel edge. Release the top clips, then the side clips, for removal.':'Slide the panel through the top opening with the artwork facing the front lip. Keep the loading edge upright.';
 $('frameAssemblyGuide').innerHTML='<ol><li>Print all frame sections face-down, at 100% scale, with supports off.</li><li>'+join+'</li><li>'+load+'</li><li>Use the rear keyholes for wall mounting or attach the shelf supports.</li></ol><p>'+ (o.dualMounts?'Two hanger pairs are included. Use the pair shown across the top in the selected display orientation. ':'')+'Fixing spacing for this orientation: '+fmt(o.hangerSpacing)+' mm. Maximum head: '+fmt(o.hangerHead)+' mm diameter x '+fmt(o.hangerHeadThickness)+' mm thick. Maximum shank: '+fmt(o.hangerShank)+' mm. Check the printed fit with your wall fixings.</p>';
 $('faceplateAssemblyGuide').hidden=!o.faceplateCount;
 $('faceplateAssemblyGuide').innerHTML='<h3>Joint faceplates</h3><p>Assemble the frame first, then press the split pegs into the center slots of the snap joints. Remove the covers before releasing the frame joints.</p>';
}

$('frameSpringsEnabled').onchange=update;$('matchEaselBase').onchange=update;$('sectionMode').onchange=update;$('twoPartDirection').onchange=update;
$('matchHangerBase').onclick=()=>{$('hangerThickness').value=$('borderlessBase').value;update();};
