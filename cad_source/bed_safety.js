/* Shared bed-reservation rules for preview, CLI and every arranged export.
 * Saved project restrictions are read, never cleared or written back. Reserved
 * regions use conservative bounding rectangles, including all quad groups.
 * Whole-mesh projection is checked, not just the first printed layer.
 */
const FrameBedSafety=(()=>{
 'use strict';
 const clean=n=>Math.round(n*1e6)/1e6;
 const number=(v,d,lo,hi,label)=>{const n=Number(v??d);if(!Number.isFinite(n)||n<lo||n>hi)throw Error(label+' must be '+lo+' to '+hi+' mm.');return n;};
 const bounds=pts=>({x:Math.min(...pts.map(p=>p[0])),y:Math.min(...pts.map(p=>p[1])),maxX:Math.max(...pts.map(p=>p[0])),maxY:Math.max(...pts.map(p=>p[1]))});
 function polygons(value,key){
  if(value===undefined||value===null||Array.isArray(value)&&!value.length)return [];
  if(!Array.isArray(value))throw Error('The saved '+key+' is invalid. Import a complete printer settings project.');
  const pts=value.map(p=>Array.isArray(p)?p.map(Number):String(p).split('x').map(Number));
  if(pts.some(p=>p.length!==2||p.some(n=>!Number.isFinite(n)))||pts.length%4)throw Error('The saved '+key+' must contain complete four-point regions.');
  const result=[];for(let i=0;i<pts.length;i+=4){const q=pts.slice(i,i+4),b=bounds(q);if(b.maxX<=b.x||b.maxY<=b.y)throw Error('The saved '+key+' contains an empty region.');result.push(q);}return result;
 }
 function resolve(o={},info=null){
  const width=Number(o.bedX??o.width),depth=Number(o.bedY??o.depth);
  if(!Number.isFinite(width)||!Number.isFinite(depth)||width<100||depth<100)throw Error('A valid printer bed is required for placement checks.');
  const matching=!!info&&Math.abs(info.bed.width-width)<.01&&Math.abs(info.bed.depth-depth)<.01;
  const config=matching?info.config:{};
  const mode=o.bedSafetyProfile||'auto';if(!['auto','x1c','custom'].includes(mode))throw Error('Select a valid bed-reservation profile.');
  const identity=String(config.printer_model||info?.printer||'');
  const x1=mode==='x1c'||matching&&/\bX1(?:\s*(?:Carbon|C|E))?\b/i.test(identity)||!matching&&mode==='auto'&&Math.abs(width-256)<.01&&Math.abs(depth-256)<.01;
  if(mode==='x1c'&&(Math.abs(width-256)>.01||Math.abs(depth-256)>.01))throw Error('The X1C reservation profile needs a 256 x 256 mm bed.');
  const extra=number(o.extraBrim,0,0,30,'Extra brim / skirt allowance');
  const clearance=number(o.exclusionClearance,2,1,10,'Reserved-area clearance');
  const front=number(o.reservedFront,x1?20:0,0,80,'Front reserved strip');
  const type=String(config.brim_type||'no_brim');
  const brim=matching&&type!=='no_brim'&&type!=='none'?number(config.brim_width,0,0,100,'Saved brim width')+number(config.brim_object_gap,0,0,10,'Saved brim gap'):0;
  const loops=Number(config.skirt_loops||0),nozzle=config.nozzle_diameter,line=Number(Array.isArray(nozzle)?nozzle[0]:(nozzle||.4));
  const skirt=matching&&loops>0?number(config.skirt_distance,2,0,100,'Saved skirt distance')+loops*Math.max(.6,(Number.isFinite(line)?line:.4)*1.5):0;
  const halo=clean(Math.max(extra,brim,skirt));
  const regions=[];
  const add=(label,poly,source)=>{const b=bounds(poly);if(b.maxX<=0||b.maxY<=0||b.x>=width||b.y>=depth)return;regions.push({label,source,polygon:poly,rect:{x:Math.max(0,b.x),y:Math.max(0,b.y),maxX:Math.min(width,b.maxX),maxY:Math.min(depth,b.maxY)}});};
  if(matching){
   for(const [i,p] of polygons(config.bed_exclude_area,'bed_exclude_area').entries())add('Printer exclusion '+(i+1),p,'saved printer profile');
   for(const [i,p] of polygons(config.wrapping_exclude_area,'wrapping_exclude_area').entries())add('Nozzle detection '+(i+1),p,'saved printer profile');
  }
  if(x1){
   // Conservative safety floor also covers newer official X1 exclusion quads.
   // Older saved profiles may contain only the original 18 x 28 mm corner.
   add('X1C cutter clearance',[[0,0],[28,0],[28,28],[0,28]],'X1C conservative reservation');
   add('X1C left reserved strip',[[0,28],[8,28],[8,depth],[0,depth]],'X1C conservative reservation');
  }
  const frontDepth=x1?Math.max(20,front):front;
  if(frontDepth)add('Calibration / priming strip',[[0,0],[width,0],[width,frontDepth],[0,frontDepth]],x1?'X1C conservative front reservation':'user front reservation');
  // Do not assume the project printer when its bed dimensions do not match.
  // Generic beds keep user margins and explicit reserves, with an honest notice.
  return {version:'3.51.0',mode,printer:matching?info.printer:x1?'Bambu Lab X1 Carbon':'Custom / unmatched bed',profileMatched:matching,
   source:matching?'saved project + safety reservations':x1?'X1C safety reservations':'custom reservations',
   regions,clearance_mm:clearance,skirtAllowance_mm:skirt,skirtEnvelope:skirt>0?'plate_bounding_rectangle':'none',brimSkirtAllowance_mm:halo,profileBrim_mm:brim,extraAllowance_mm:extra,
   frontReserved_mm:frontDepth,toolpathPadding_mm:clean(clearance+halo),
   notice:info&&!matching?'The saved project bed does not match. Its exclusions and brim settings are not applied; use a matching project or explicit custom reserves.':matching&&!x1?'Saved printer exclusion regions are protected. Custom start G-code and new calibration paths require appropriate additional reserves.':'X1C cutter, left strip and front calibration/priming reserves remain protected even with zero outer margins.',
   physicalPrintTested:false,toolpathSimulation:false};
 }
 function inflatedRegions(safety){const p=safety.toolpathPadding_mm;return safety.regions.map(r=>({...r,rect:{x:r.rect.x-p,y:r.rect.y-p,maxX:r.rect.maxX+p,maxY:r.rect.maxY+p}}));}
 function margins(o,safety){const m=o.margins||{left:o.margin??3,right:o.margin??3,front:o.margin??3,back:o.margin??3},p=safety.toolpathPadding_mm;
  return Object.fromEntries(['left','right','front','back'].map(k=>[k,clean(Math.max(Number(m[k]),p))]));}
 // Separating-axis test against a rectangle, including tangent contact. A
 // conservative contact rejection keeps rounded placement grids off a boundary.
 function triangleRect(points,r){
  const b=bounds(points);if(b.maxX<r.x-1e-7||b.x>r.maxX+1e-7||b.maxY<r.y-1e-7||b.y>r.maxY+1e-7)return false;
  const corners=[[r.x,r.y],[r.maxX,r.y],[r.maxX,r.maxY],[r.x,r.maxY]];
  for(let i=0;i<3;i++){
   const a=points[i],b=points[(i+1)%3],axis=[-(b[1]-a[1]),b[0]-a[0]];if(Math.abs(axis[0])+Math.abs(axis[1])<1e-10)continue;
   const p=points.map(q=>q[0]*axis[0]+q[1]*axis[1]),v=corners.map(q=>q[0]*axis[0]+q[1]*axis[1]);
   if(Math.max(...p)<Math.min(...v)-1e-7||Math.max(...v)<Math.min(...p)-1e-7)return false;
  }return true;
 }
 function validatePlate(entries,safety){
  if(safety.skirtEnvelope!=='plate_bounding_rectangle'||!entries.length)return true;
  const b={x:Math.min(...entries.map(e=>e.x)),y:Math.min(...entries.map(e=>e.y)),maxX:Math.max(...entries.map(e=>e.x+e.width)),maxY:Math.max(...entries.map(e=>e.y+e.depth))};
  for(const {label,rect:r} of inflatedRegions(safety))if(!(b.maxX<r.x-1e-7||b.x>r.maxX+1e-7||b.maxY<r.y-1e-7||b.y>r.maxY+1e-7))throw Error('The plate-wide skirt envelope overlaps '+label+'. Rebuild the protected layout.');
  return true;
 }
 function validateEntry(entry,safety){
  for(const region of inflatedRegions(safety)){
   const r=region.rect;if(entry.x+entry.width<r.x||entry.x>r.maxX||entry.y+entry.depth<r.y||entry.y>r.maxY)continue;
   for(const f of entry.mesh.faces){const p=f.map(i=>{const v=entry.mesh.vertices[i];return [v[0]+entry.x,v[1]+entry.y];});
    if(triangleRect(p,r))throw Error(entry.name+' overlaps '+region.label+' or its brim/clearance allowance. Export stopped.');
   }
  }return true;
 }
 // Conservative individual-part envelope test used before selecting seams.
 // Packing still checks exact mesh footprints afterwards. No mesh or panel is
 // scaled and no printer restriction is removed to satisfy a manual choice.
 function envelopePosition(width,depth,o,safety){
  const m=margins(o,safety),right=o.bedX-m.right,top=o.bedY-m.back;
  const regions=inflatedRegions(safety),eps=.025;
  const xs=[m.left,...regions.map(r=>Math.max(m.left,r.rect.maxX+eps))];
  const ys=[m.front,...regions.map(r=>Math.max(m.front,r.rect.maxY+eps))];
  for(const angle of [0,90]){
   const w=angle===0?width:depth,h=angle===0?depth:width;
   for(const y of ys)for(const x of xs){
    if(x+w>right+1e-7||y+h>top+1e-7)continue;
    if(regions.some(({rect:r})=>!(x+w<r.x-1e-7||x>r.maxX+1e-7||y+h<r.y-1e-7||y>r.maxY+1e-7)))continue;
    return {angle,x,y,width:w,depth:h};
   }
  }
  return null;
 }
 return {resolve,polygons,inflatedRegions,margins,validateEntry,validatePlate,triangleRect,envelopePosition};
})();
if(typeof module!=='undefined')module.exports=FrameBedSafety;
