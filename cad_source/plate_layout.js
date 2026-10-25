/* Bed-ready layouts. Project the complete print mesh, not only the first layer,
 * so nested pieces cannot collide with overhangs, hooks or upper retaining lips.
 * Conservative raster coverage + expanded occupied cells enforces part spacing.
 * Only rotations about Z are permitted. No scaling, flipping, or Z stacking.
 * Multi-start bottom-left nesting is a heuristic, not a global optimum proof.
 */
const FramePlates = (() => {
 'use strict';
 const Safety=typeof FrameBedSafety!=='undefined'?FrameBedSafety:typeof require==='function'?require('./bed_safety.js'):null;
 if(!Safety)throw Error('Bed-reservation checks are unavailable.');
 const clean=n=>Math.round(n*1e6)/1e6;
 const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
 const safeBambuName=s=>String(s??'').replace(/[<>:\\/|?*"]/g,' ').replace(/\s+/g,' ').trim()||'Print plate';
 const tick=()=>new Promise(r=>setTimeout(r,0));
 const footprintCache=new WeakMap();
 const colors={frame:'#445965',frameKey:'#238392',panel:'#cbbd9e',panelKey:'#997940',faceplate:'#a17866',foot:'#658470',test:'#687c8e'};
 function rotation(mesh,angle){
  let lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
  for(const p of mesh.vertices)for(let a=0;a<3;a++){lo[a]=Math.min(lo[a],p[a]);hi[a]=Math.max(hi[a],p[a]);}
  const w=hi[0]-lo[0],h=hi[1]-lo[1];
  const vertices=mesh.vertices.map(v=>{const x=v[0]-lo[0],y=v[1]-lo[1],z=clean(v[2]-lo[2]);return (angle===90?[h-y,x,z]:angle===180?[w-x,h-y,z]:angle===270?[y,w-x,z]:[x,y,z]).map(clean);});
  return {vertices,faces:mesh.faces,w:clean(angle%180?h:w),h:clean(angle%180?w:h),z:clean(hi[2]-lo[2]),angle};
 }
 function raster(mesh,res){
  const width=Math.max(1,Math.ceil((mesh.w-1e-7)/res)),height=Math.max(1,Math.ceil((mesh.h-1e-7)/res)),bits=new Uint8Array(width*height);
  for(const f of mesh.faces){
   const p=f.map(i=>mesh.vertices[i]),area=(p[1][0]-p[0][0])*(p[2][1]-p[0][1])-(p[1][1]-p[0][1])*(p[2][0]-p[0][0]);if(Math.abs(area)<1e-10)continue;
   const y0=Math.max(0,Math.floor(Math.min(...p.map(v=>v[1]))/res)),y1=Math.min(height-1,Math.floor(Math.max(...p.map(v=>v[1]))/res));
   for(let y=y0;y<=y1;y++){
    const bottom=y*res,top=(y+1)*res;let xmin=Infinity,xmax=-Infinity;
    for(let i=0;i<3;i++){
     const a=p[i],b=p[(i+1)%3];if(a[1]>=bottom-1e-8&&a[1]<=top+1e-8){xmin=Math.min(xmin,a[0]);xmax=Math.max(xmax,a[0]);}
     for(const edge of [bottom,top])if(Math.abs(b[1]-a[1])>1e-12&&edge>=Math.min(a[1],b[1])-1e-8&&edge<=Math.max(a[1],b[1])+1e-8){const x=a[0]+(b[0]-a[0])*(edge-a[1])/(b[1]-a[1]);xmin=Math.min(xmin,x);xmax=Math.max(xmax,x);}
    }
    if(xmin<=xmax){const x0=Math.max(0,Math.floor((xmin-1e-8)/res)),x1=Math.min(width-1,Math.floor((xmax+1e-8)/res));if(x1>=x0)bits.fill(1,y*width+x0,y*width+x1+1);}
   }
  }
  const stride=Math.ceil(width/32),rows=[],runs=[];let count=0,massY=0;
  for(let y=0;y<height;y++){
   const words=new Uint32Array(stride),rr=[];let start=-1;
   for(let x=0;x<width;x++){
    if(bits[y*width+x]){words[x>>>5]|=(1<<(x&31));count++;massY+=y;if(start<0)start=x;}
    if(start>=0&&(!bits[y*width+x]||x===width-1)){rr.push([start,bits[y*width+x]&&x===width-1?x:x-1]);start=-1;}
   }
   const nonzero=[];for(let x=0;x<words.length;x++)if(words[x])nonzero.push([x,words[x]]);
   if(nonzero.length)rows.push({y,words:nonzero});runs.push(rr);
  }
  // Test denser rows first, then alternate top/bottom. Most rejected placements
  // therefore stop early instead of traversing the open middle of a frame.
  rows.sort((a,b)=>b.words.length-a.words.length||Math.min(a.y,height-1-a.y)-Math.min(b.y,height-1-b.y));
  return {mesh,width,height,rows,runs,count,centroidY:count?massY/count:0};
 }
 function board(W,H){return {W,H,stride:Math.ceil(W/32),bits:new Uint32Array(Math.ceil(W/32)*H),placed:[]};}
 function collides(b,shape,x,y){
  const shift=x&31,word=x>>>5;
  for(const row of shape.rows){const base=(y+row.y)*b.stride+word;
   for(const [i,mask] of row.words){if(b.bits[base+i]&(mask<<shift))return true;if(shift&&(mask>>>(32-shift))&&(b.bits[base+i+1]&(mask>>>(32-shift))))return true;}
  }return false;
 }
 function fillRun(b,y,start,end){
  if(y<0||y>=b.H)return;start=Math.max(0,start);end=Math.min(b.W-1,end);if(start>end)return;
  const a=start>>>5,z=end>>>5,base=y*b.stride;
  if(a===z){b.bits[base+a]|=(0xffffffff<<(start&31))&(0xffffffff>>>(31-(end&31)));return;}
  b.bits[base+a]|=0xffffffff<<(start&31);for(let i=a+1;i<z;i++)b.bits[base+i]=0xffffffff;b.bits[base+z]|=0xffffffff>>>(31-(end&31));
 }
 function commit(b,shape,x,y,pad){
  for(let row=0;row<shape.height;row++)for(const [a,z] of shape.runs[row])for(let dy=-pad;dy<=pad;dy++)fillRun(b,y+row+dy,x+a-pad,x+z+pad);
 }
 function skirtEnvelopeClear(b,shape,x,y,o,res){
  if(!o.skirtRegions)return true;
  let x0=x*res,y0=y*res,x1=x0+shape.mesh.w,y1=y0+shape.mesh.h;
  for(const a of b.placed){x0=Math.min(x0,a.x*res);y0=Math.min(y0,a.y*res);x1=Math.max(x1,a.right);y1=Math.max(y1,a.top);}
  x0+=o.margins.left;x1+=o.margins.left;y0+=o.margins.front;y1+=o.margins.front;
  return o.skirtRegions.every(r=>x1<r.x-1e-7||x0>r.maxX+1e-7||y1<r.y-1e-7||y0>r.maxY+1e-7);
 }
 function locate(b,variants,o,res,seed){
  let best=null;
  const ordered=variants.slice().sort((a,b)=>((a.mesh.angle-seed+360)%360)-((b.mesh.angle-seed+360)%360));
  for(const shape of ordered){
   const xmax=Math.floor((o.usableX-shape.mesh.w+1e-7)/res),ymax=Math.floor((o.usableY-shape.mesh.h+1e-7)/res);if(xmax<0||ymax<0)continue;
   let found=null;
   // Bottom-left search in half-millimetre steps on normal-size printer beds.
   // Position bounds use exact millimetres, not a rounded-down bed rectangle.
   for(let y=0;y<=ymax;y++){
    if(best&&y*res+shape.mesh.h>best.top+1e-7)break;
    for(let x=0;x<=xmax;x++)if(skirtEnvelopeClear(b,shape,x,y,o,res)&&!collides(b,shape,x,y)){found={shape,x,y,top:y*res+shape.mesh.h,right:x*res+shape.mesh.w};break;}
    if(found)break;
   }
   if(found&&(!best||found.top<best.top-1e-7||Math.abs(found.top-best.top)<1e-7&&(found.right<best.right-1e-7||!b.placed.length&&Math.abs(found.right-best.right)<1e-7&&found.shape.centroidY<best.shape.centroidY)))best=found;
  }
  return best;
 }
 async function packIndependent(raw,o,options={}){
  if(!raw?.length)throw Error('No printable parts are available for this plate set.');
  const requestedGap=Number(options.gap??3);if(!Number.isFinite(requestedGap)||requestedGap<0||requestedGap>30)throw Error('Part spacing must be 0 to 30 mm.');
  const safety=options.safety||Safety.resolve(o),requestedMargins={...o.margins},margins=Safety.margins(o,safety),gap=Math.max(requestedGap,2*safety.brimSkirtAllowance_mm+1);
  o={...o,margins,skirtRegions:safety.skirtEnvelope==='plate_bounding_rectangle'?Safety.inflatedRegions(safety).map(r=>r.rect):null,usableX:clean(o.bedX-margins.left-margins.right),usableY:clean(o.bedY-margins.front-margins.back)};
  if(o.usableX<=0||o.usableY<=0)throw Error('Margins and brim clearance leave no printable space.');
  const res=Math.max(.5,Math.max(o.usableX,o.usableY)/640),pad=Math.ceil(gap/res),W=Math.ceil(o.usableX/res),H=Math.ceil(o.usableY/res),check=()=>{if(options.cancelled?.())throw Error('Layout cancelled because the model or spacing changed.');};
  const forbidden=board(W,H);
  for(const region of Safety.inflatedRegions(safety)){
   const r=region.rect,x0=Math.floor((r.x-o.margins.left-1e-6)/res),x1=Math.floor((r.maxX-o.margins.left+1e-6)/res);
   const y0=Math.max(0,Math.floor((r.y-o.margins.front-1e-6)/res)),y1=Math.min(H-1,Math.floor((r.maxY-o.margins.front+1e-6)/res));
   for(let y=y0;y<=y1;y++)fillRun(forbidden,y,x0,x1);
  }
  const newBoard=()=>{const b=board(W,H);b.bits.set(forbidden.bits);return b;};
  const items=[];
  for(let i=0;i<raw.length;i++){
   check();options.progress?.('Preparing footprint '+(i+1)+' / '+raw.length);await tick();
   const p=raw[i],cacheKey=res+'|'+o.usableX+'|'+o.usableY;
   let cache=footprintCache.get(p);if(!cache){cache=new Map();footprintCache.set(p,cache);}
   let variants=cache.get(cacheKey);
   if(!variants){variants=[];for(const angle of [0,90,180,270]){const mesh=rotation(p.printMesh,angle);if(mesh.w<=o.usableX+1e-7&&mesh.h<=o.usableY+1e-7)variants.push(raster(mesh,res));}cache.set(cacheKey,variants);}
   if(!variants.length)throw Error(p.name+' does not fit the usable printer bed.');
   items.push({index:i,name:p.name,type:p.type,part:p,variants,area:variants[0].count*res*res,max:Math.max(variants[0].mesh.w,variants[0].mesh.h),box:variants[0].mesh.w*variants[0].mesh.h});
  }
  const schedules=[
   {sort:(a,b)=>b.max-a.max||b.box-a.box,seed:0},
   {sort:(a,b)=>b.box-a.box||b.area-a.area,seed:180},
   {sort:(a,b)=>b.area-a.area||b.max-a.max,seed:0},
   {sort:(a,b)=>(b.type==='frame')-(a.type==='frame')||b.max-a.max||b.area-a.area,seed:180}
  ];
  // Try frame/panel alternation. Placing both frame halves first can close a
  // useful opening that a rotated panel would otherwise fit through.
  if(items.some(a=>a.type==='frame')&&items.some(a=>a.type==='panel')){
   const frames=items.filter(a=>a.type==='frame').sort((a,b)=>b.max-a.max),panels=items.filter(a=>a.type==='panel').sort((a,b)=>b.max-a.max),other=items.filter(a=>!['frame','panel'].includes(a.type)).sort((a,b)=>b.max-a.max),order=[];
   for(let i=0;i<Math.max(frames.length,panels.length);i++){if(frames[i])order.push(frames[i]);if(panels[i])order.push(panels[i]);}order.push(...other);
   schedules.push({order,seed:0},{order:[...order].map(a=>a),seed:180});
  }
  let best=null;
  for(let attempt=0;attempt<schedules.length;attempt++){
   const schedule=schedules[attempt],order=schedule.order||items.slice().sort(schedule.sort),plates=[];let placed=0;
   for(const item of order){
    check();options.progress?.('Arranging parts: pass '+(attempt+1)+' / '+schedules.length+', part '+(++placed)+' / '+items.length);await tick();
    let found=null,target=null;
    for(const p of plates){const r=locate(p,item.variants,o,res,schedule.seed);if(r){found=r;target=p;break;}}
    if(!found){target=newBoard();plates.push(target);found=locate(target,item.variants,o,res,schedule.seed);}
    if(!found)throw Error('Cannot safely place '+item.name+' outside reserved areas with the current brim allowance. Use smaller generated sections or a larger/matching printer bed; the part will not be scaled or exported unsafely.');
    commit(target,found.shape,found.x,found.y,pad);target.placed.push({...found,item});
   }
   const compact=plates.reduce((sum,p)=>sum+Math.max(...p.placed.map(a=>a.right))*Math.max(...p.placed.map(a=>a.top)),0);
   if(!best||plates.length<best.plates.length||plates.length===best.plates.length&&compact<best.compact)best={plates,compact};
   // A single plate is already minimal; extra passes can reduce the footprint
   // but do not reduce the number of print jobs. Keep two passes in that case.
   if(best.plates.length===1&&attempt>=1)break;
  }
  const plates=best.plates.map((p,i)=>{
   const entries=p.placed.map(a=>({index:a.item.index,name:a.item.name,type:a.item.type,mesh:a.shape.mesh,shape:a.shape,x:clean(o.margins.left+a.x*res),y:clean(o.margins.front+a.y*res),z:0,angle:a.shape.mesh.angle,sourceRotation:a.item.part.rotation||0,width:a.shape.mesh.w,depth:a.shape.mesh.h,height:a.shape.mesh.z}));
   return {number:i+1,entries,count:entries.length};
  });
  const result={version:'3.51.0',units:'mm',bed:{width:o.bedX,depth:o.bedY,usableWidth:o.usableX,usableDepth:o.usableY,margins:o.margins,requestedMargins,safety},requestedGap,gap,resolution:res,partCount:raw.length,plates};
  validate(result);return result;
 }

 // Keep related pieces as a complete set instead of scattering individual parts
 // between unrelated jobs. Packing never changes mesh geometry or quantities.
 function family(part){
  if(part.type==='test'){
   const key=part.testGroup||'fit_tests';
   const labels={uv_joint:'UV joint test',stand_mount:'Stand mount test',panel_retainer:'Panel retainer test',frame_joint:'Frame joint test',Frame_Joint:'Frame joint test',Frame_Main_Joint:'Main frame joint test',Frame_Top_Joint:'Top frame joint test'};
   return {id:key,label:labels[key]||key.replaceAll('_',' ')};
  }
  if(['frame','frameKey'].includes(part.type))return {id:'frame',label:'Frame sections'};
  if(['panel','panelKey'].includes(part.type))return {id:'uv_panel',label:'UV panel'};
  if(part.type==='faceplate')return {id:'faceplates',label:'Faceplates'};
  if(part.type==='foot')return {id:'supports',label:'Rear supports'};
  return {id:part.type||'other',label:'Other parts'};
 }
 function decorate(plan,raw){
  const groups=new Map();
  raw.forEach((p,index)=>{const f=family(p);if(!groups.has(f.id))groups.set(f.id,{...f,sourceIndices:[],parts:[],plates:[]});groups.get(f.id).sourceIndices.push(index);groups.get(f.id).parts.push(p.name);});
  for(const plate of plan.plates){
   const ids=new Set();for(const e of plate.entries){const f=family(raw[e.index]);e.groupId=f.id;e.groupLabel=f.label;ids.add(f.id);}
   plate.groupIds=[...ids];plate.label=plate.groupIds.map(id=>groups.get(id).label).join(' + ');
   for(const id of ids)groups.get(id).plates.push(plate.number);
  }
  const peers=new Map();
  for(const plate of plan.plates){const key=[...plate.groupIds].sort().join('|');if(!peers.has(key))peers.set(key,[]);peers.get(key).push(plate);}
  for(const plates of peers.values())plates.forEach((plate,i)=>{plate.setPlate=i+1;plate.setPlateCount=plates.length;plate.setName=plate.label.replace(/[^A-Za-z0-9]+/g,'_').replace(/^_|_$/g,'');plate.file=plate.setName+'/'+plate.setName+'_Plate_'+String(i+1).padStart(2,'0')+'_of_'+String(plates.length).padStart(2,'0')+'.3mf';});
  plan.groups=[...groups.values()].map(g=>({...g,partCount:g.parts.length,plateCount:g.plates.length}));
  plan.groupPolicy='Matching parts stay together. A group spans consecutive plates only when its packed set needs more than one bed; unrelated parts never fill those split-group plates.';
  plan.version='3.51.0';return plan;
 }
 async function pack(raw,o,options={}){
  if(!raw?.length)throw Error('No printable parts are available for this plate set.');
  const groups=new Map();raw.forEach((p,i)=>{const f=family(p);if(!groups.has(f.id))groups.set(f.id,{...f,raw:[],indices:[]});groups.get(f.id).raw.push(p);groups.get(f.id).indices.push(i);});
  const initial=await packIndependent(raw,o,options);
  if(initial.plates.length===1||groups.size===1)return decorate(initial,raw);
  const bundles=[];
  for(const group of groups.values()){
   options.progress?.('Keeping '+group.label.toLowerCase()+' together');
   const local=await packIndependent(group.raw,o,options);
   if(local.plates.length===1){
    let joined=false;
    for(const bundle of bundles){
     if(bundle.plan.plates.length!==1)continue;
     const combinedRaw=[...bundle.raw,...group.raw],trial=await packIndependent(combinedRaw,o,options);
     if(trial.plates.length===1){bundle.raw=combinedRaw;bundle.indices.push(...group.indices);bundle.plan=trial;joined=true;break;}
    }
    if(joined)continue;
   }
   bundles.push({raw:group.raw,indices:group.indices,plan:local});
  }
  const plates=[];
  for(const bundle of bundles)for(const plate of bundle.plan.plates)plates.push({...plate,number:plates.length+1,entries:plate.entries.map(e=>({...e,index:bundle.indices[e.index]}))});
  const plan=decorate({...initial,plates},raw);validate(plan);return plan;
 }
 function plateFile(plate){return plate.file||'Plate_'+String(plate.number).padStart(2,'0')+'.3mf';}
 function manifest(plan){
  return {version:plan.version,units:'mm',bed:plan.bed,minimumPartSpacing_mm:plan.gap,requestedPartSpacing_mm:plan.requestedGap,nestingGrid_mm:clean(plan.resolution),groupPolicy:plan.groupPolicy,groups:plan.groups||[],method:'Reserved-area-aware whole-mesh XY silhouette nesting with brim/clearance padding and independent final triangle checks; complete matching groups; rotations in the bed plane only; no scaling, mirroring or stacking. Not a proof of minimum plate count.',printSequence:'By layer, not sequential by object',partCount:plan.partCount,plateCount:plan.plates.length,plates:plan.plates.map(p=>({plate:p.number,label:p.label||'Print plate',groupIds:p.groupIds||[],setPlate:p.setPlate||p.number,setPlateCount:p.setPlateCount||plan.plates.length,file:plateFile(p),partCount:p.count,parts:p.entries.map(e=>({name:e.name,type:e.type,group:e.groupId,sourceIndex:e.index,quantity:1,position_mm:[e.x,e.y,0],rotationFromIndividualFile_degrees:e.angle,totalXYRotation_degrees:(e.angle+e.sourceRotation)%360,dimensions_mm:[e.width,e.depth,e.height]}))}))};
 }
 // Bambu/Orca project plate coordinates follow their public PartPlate code:
 // ceil(sqrt(n)) columns; stride is 1.2 times each actual bed dimension.
 // The model metadata explicitly identifies this exporter. The Application
 // compatibility token selects the native project-import path in these slicers.
 function projectInfo(plan){
  validate(plan);if(plan.plates.length>36)throw Error('This layout exceeds 36 project plates. Choose Grouped plate files for this model.');
  const cols=Math.max(1,Math.ceil(Math.sqrt(plan.plates.length)));
  return {columns:cols,plates:plan.plates.map((p,i)=>({number:p.number,label:p.label||'Print plate',origin:[clean((i%cols)*plan.bed.width*1.2),clean(-Math.floor(i/cols)*plan.bed.depth*1.2),0]}))};
 }
 function bbsUuid(n){return '00000000-0000-4000-8000-'+String(n).padStart(12,'0');}
 function projectFiles(plan,template){
  const templates=typeof BambuTemplate!=='undefined'?BambuTemplate:typeof require==='function'?require('./bambu_template.js'):null;
  if(!templates)throw Error('The Bambu project reader is unavailable.');
  const saved=templates.assertBed(template,plan.bed);
  const required=Safety.resolve({bedX:plan.bed.width,bedY:plan.bed.depth,reservedFront:plan.bed.safety?.frontReserved_mm,exclusionClearance:plan.bed.safety?.clearance_mm,extraBrim:plan.bed.safety?.brimSkirtAllowance_mm},saved);
  for(const plate of plan.plates){Safety.validatePlate(plate.entries,required);for(const entry of plate.entries)Safety.validateEntry(entry,required);}
  const info=projectInfo(plan),objects=[],build=[],configs=[],plateConfigs=[];
  let oid=2,uuidSeq=1;
  for(const [pi,plate] of plan.plates.entries()){
   const origin=info.plates[pi].origin,instances=[];
   for(const e of plate.entries){
    const id=oid++,name=safeBambuName(e.name),ox=origin[0]+e.x,oy=origin[1]+e.y;
    // Bambu Studio assigns objects to plates spatially. Bake the intended plate-cell
    // placement directly into mesh coordinates and keep build transforms identity.
    const vertices=e.mesh.vertices.map(v=>'<vertex x="'+clean(v[0]+ox)+'" y="'+clean(v[1]+oy)+'" z="'+v[2]+'"/>').join('');
    const faces=e.mesh.faces.map(f=>'<triangle v1="'+f[0]+'" v2="'+f[1]+'" v3="'+f[2]+'"/>').join('');
    objects.push('<object id="'+id+'" p:UUID="'+bbsUuid(uuidSeq++)+'" type="model" name="'+esc(name)+'"><mesh><vertices>'+vertices+'</vertices><triangles>'+faces+'</triangles></mesh></object>');
    build.push('<item objectid="'+id+'" p:UUID="'+bbsUuid(uuidSeq++)+'" transform="1 0 0 0 1 0 0 0 1 0 0 0" printable="1"/>');
    configs.push('<object id="'+id+'"><metadata key="name" value="'+esc(name)+'"/><metadata key="extruder" value="1"/></object>');
    instances.push('<model_instance><metadata key="object_id" value="'+id+'"/><metadata key="instance_id" value="0"/><metadata key="identify_id" value="'+id+'"/></model_instance>');
   }
   const label=safeBambuName((plate.label||'Print plate')+(plate.setPlateCount>1?' '+plate.setPlate+' of '+plate.setPlateCount:''));
   const mapping=Object.entries(template.plateDefaults||{}).map(([key,value])=>'<metadata key="'+esc(key)+'" value="'+esc(value)+'"/>').join('');
   plateConfigs.push('<plate><metadata key="plater_id" value="'+plate.number+'"/><metadata key="plater_name" value="'+esc(label)+'"/><metadata key="locked" value="false"/>'+mapping+instances.join('')+'</plate>');
  }
  const model='<?xml version="1.0" encoding="UTF-8"?><model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:BambuStudio="http://schemas.bambulab.com/package/2021" xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06" requiredextensions="p"><metadata name="Application">'+esc(template.application)+'</metadata><metadata name="BambuStudio:3mfVersion">1</metadata><metadata name="Title">Canvas Frame arranged project</metadata><metadata name="Designer">Canvas Frame Builder 3.51.0</metadata><metadata name="Description">Generated geometry and native multi-plate layout using the imported Bambu Studio project settings. No G-code is included.</metadata><resources>'+objects.join('')+'</resources><build p:UUID="'+bbsUuid(uuidSeq++)+'">'+build.join('')+'</build></model>';
  const config='<?xml version="1.0" encoding="UTF-8"?><config>'+configs.join('')+plateConfigs.join('')+'</config>';
  // Bambu Studio couples native plate loading to loading project settings.
  // Preserve the user's saved settings verbatim; never synthesize profiles.
  const files=packageFiles(plan,plan.plates[0]).filter(([n])=>!['3D/3dmodel.model','Metadata/Canvas_Frame_Layout.json','Metadata/READ_ME.txt'].includes(n));
  files[0][1]=files[0][1].replace('</Types>','<Default Extension=\"config\" ContentType=\"application/octet-stream\"/></Types>');
  files.push(['3D/3dmodel.model',model],...template.files.map(([name,text])=>[name,text]),['Metadata/model_settings.config',config],['Metadata/Canvas_Frame_Layout.json',JSON.stringify({...manifest(plan),plates:manifest(plan).plates.map(p=>({...p,file:'3D/3dmodel.model',projectPlate:p.plate})),packaging:'Bambu_Studio_native_multiplate_project',profileSource:{type:'user_saved_project',name:template.name,printer:saved.printer,process:saved.process,filaments:saved.filaments},project:info},null,2)],['Metadata/READ_ME.txt','Open as a PROJECT in Bambu Studio. This file contains '+plan.plates.length+' named plates and the printer, process and filament settings from '+template.name+'. It loads those saved settings; it does not use whichever profiles are currently selected. To retain current slicer settings, export Separate plate files instead. Keep 100% scale and supplied orientations. No G-code is included.']);
  return files;
 }
 function validate(plan){
  const ids=new Set(),b=plan.bed,m=b.margins;
  for(const plate of plan.plates)for(const e of plate.entries){
   if(ids.has(e.index))throw Error('A duplicate copy was found in the plate layout.');ids.add(e.index);
   if(!b.safety)throw Error('This layout has no reserved-area validation. Rebuild the plate layout.');
   Safety.validateEntry(e,b.safety);
   if(e.x<m.left-1e-6||e.y<m.front-1e-6||e.x+e.width>b.width-m.right+1e-6||e.y+e.depth>b.depth-m.back+1e-6)throw Error('A part exceeds a reserved bed margin.');
   if(Math.abs(Math.min(...e.mesh.vertices.map(v=>v[2])))>1e-6)throw Error('A plate part is not resting at Z = 0.');
   if(![0,90,180,270].includes(e.angle))throw Error('Invalid print rotation.');
  }
  for(const plate of plan.plates)Safety.validatePlate(plate.entries,b.safety);
  if(ids.size!==plan.partCount)throw Error('The plate layout is missing a required part.');return true;
 }

 function xml(plan,plate){
  validate(plan);
  const objects=plate.entries.map((e,i)=>{
   const vertices=e.mesh.vertices.map(p=>'<vertex x="'+clean(p[0]+e.x)+'" y="'+clean(p[1]+e.y)+'" z="'+p[2]+'"/>').join('');
   const triangles=e.mesh.faces.map(f=>'<triangle v1="'+f[0]+'" v2="'+f[1]+'" v3="'+f[2]+'"/>').join('');
   return '<object id="'+(i+1)+'" type="model" name="'+esc(safeBambuName(e.name))+'"><mesh><vertices>'+vertices+'</vertices><triangles>'+triangles+'</triangles></mesh></object>';
  });
  return '<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><metadata name="Title">'+esc(safeBambuName('Canvas Frame - '+(plate.label||'Print plate')+' '+(plate.setPlate||plate.number)+' of '+(plate.setPlateCount||plan.plates.length)))+'</metadata><metadata name="Application">Canvas Frame Builder 3.51.0</metadata><metadata name="Description">Bed-arranged geometry only. Keep positions and 100% scale. Use your matching printer and filament profile. Print by layer; supports off.</metadata><resources>'+objects.join('')+'</resources><build>'+plate.entries.map((e,i)=>'<item objectid="'+(i+1)+'"/>').join('')+'</build></model>';
 }
 function packageFiles(plan,plate){
  return [
   ['[Content_Types].xml','<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/><Default Extension="json" ContentType="application/json"/><Default Extension="txt" ContentType="text/plain"/></Types>'],
   ['_rels/.rels','<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>'],
   ['3D/3dmodel.model',xml(plan,plate)],
   ['Metadata/Canvas_Frame_Layout.json',JSON.stringify({...manifest(plan),selectedPlate:plate.number},null,2)],
   ['Metadata/READ_ME.txt','Geometry-only arranged print plate. Units: mm. Select a matching bed profile and keep positions, print orientation and 100% scale. Supports off; print by layer. The layout includes saved exclusion zones and the configured calibration, brim and clearance reserves. Do not auto-arrange or change profiles without rechecking the plate. Purge towers, custom start G-code and sequential toolhead travel are not simulated. No toolhead envelope checks or physical printing have been performed.']
  ];
 }
 function silhouette(shape,res){
  const rects=[],active=new Map();
  for(let row=0;row<=shape.height;row++){
   const keys=new Set();for(const [a,z] of shape.runs[row]||[]){const k=a+','+z;keys.add(k);if(active.has(k))active.get(k).end=row+1;else active.set(k,{a,z,start:row,end:row+1});}
   for(const [k,r] of active)if(!keys.has(k)){rects.push(r);active.delete(k);}
  }
  return rects.map(r=>{const x=clean(r.a*res),y=clean(r.start*res),w=clean(Math.min(shape.mesh.w,(r.z+1)*res)-x),h=clean(Math.min(shape.mesh.h,r.end*res)-y);return w>0&&h>0?'M'+x+' '+y+'h'+w+'v'+h+'h-'+w+'Z':'';}).join('');
 }
 function svg(plan,plate){
  const b=plan.bed,m=b.margins,pad=Math.max(b.width,b.depth)*.045,unit=Math.max(b.width,b.depth)/256,font=7*unit;
  const reserves=(b.safety?.regions||[]).map(r=>{const q=r.rect;return '<rect x="'+q.x+'" y="'+(b.depth-q.maxY)+'" width="'+(q.maxX-q.x)+'" height="'+(q.maxY-q.y)+'" fill="#e1a99a" stroke="#ad4d36" stroke-width="'+.35*unit+'"><title>'+esc(r.label)+'</title></rect>';});
  const protectedEdges=b.safety?Safety.inflatedRegions(b.safety).map(r=>{const q=r.rect;return '<rect x="'+Math.max(0,q.x)+'" y="'+Math.max(0,b.depth-q.maxY)+'" width="'+(Math.min(b.width,q.maxX)-Math.max(0,q.x))+'" height="'+(Math.min(b.depth,q.maxY)-Math.max(0,q.y))+'" fill="none" stroke="#ad4d36" stroke-dasharray="2 2" stroke-width="'+.5*unit+'"/>'; }):[];
  const shapes=plate.entries.map((e,i)=>'<g transform="translate('+e.x+' '+(b.depth-e.y)+') scale(1 -1)"><path d="'+silhouette(e.shape,plan.resolution)+'" fill="'+(colors[e.type]||colors.test)+'"><title>'+esc(e.name)+'</title></path></g>');
  const labels=plate.entries.map((e,i)=>{const x=e.x+e.width/2,y=b.depth-e.y-e.depth/2;return '<g><circle cx="'+x+'" cy="'+y+'" r="'+6*unit+'" fill="white" stroke="#354750" stroke-width="'+.5*unit+'"/><text x="'+x+'" y="'+(y+font*.35)+'" text-anchor="middle" fill="#253943" font-size="'+font+'">'+(i+1)+'</text></g>';});
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="'+[-pad,-pad,b.width+pad*2,b.depth+pad*2].join(' ')+'" role="img" aria-label="Plate '+plate.number+' arranged parts on a '+b.width+' by '+b.depth+' millimetre bed"><rect x="0" y="0" width="'+b.width+'" height="'+b.depth+'" fill="#f7f9fa" stroke="#8ca5ae" stroke-width="'+unit+'"/><path d="M0 0H'+b.width+'V'+b.depth+'H0Z M'+m.left+' '+m.back+'V'+(b.depth-m.front)+'H'+(b.width-m.right)+'V'+m.back+'Z" fill="#e3e8eb" fill-rule="evenodd"/><rect x="'+m.left+'" y="'+m.back+'" width="'+b.usableWidth+'" height="'+b.usableDepth+'" fill="none" stroke="#9daeb5" stroke-dasharray="'+2*unit+'" stroke-width="'+.5*unit+'"/>'+reserves.join('')+protectedEdges.join('')+shapes.join('')+labels.join('')+'<text x="'+b.width/2+'" y="'+(b.depth+pad*.75)+'" text-anchor="middle" fill="#5e7078" font-family="Arial,sans-serif" font-size="'+font+'">FRONT | '+b.width+' x '+b.depth+' mm</text></svg>';
 }
 return {pack,validate,manifest,xml,packageFiles,projectFiles,projectInfo,plateFile,family,svg,rotation,raster};
})();
if(typeof module!=='undefined')module.exports=FramePlates;
