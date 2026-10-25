/* Frame and UV Panel Builder: offline STEP AP214 solid-BREP export.
 * Planar regions of the parametric CSG boundary are joined into CAD faces.
 * No STL bytes are read, no web service is used, and no triangles are emitted
 * as tessellated STEP entities. Shared vertices/edges and inner face loops
 * define closed, named, manifold solids. Millimetre geometry and units.
 */
const FrameSTEP = (() => {
 'use strict';
 const TOL=0.00002;
 const sub=(a,b)=>a.map((v,i)=>v-b[i]);
 const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
 const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
 const unit=a=>{const n=Math.hypot(...a);if(n<1e-12)throw Error('Degenerate CAD direction.');return a.map(v=>v/n);};
 const edgeKey=(a,b)=>a<b?a+':'+b:b+':'+a;
 // Toleranced welding is used only when raw BSP output has near-duplicate
 // vertices. The 0.00005 mm repair limit is far below printer fit clearances.
 function healBoundary(mesh){
  const tolerance=0.00005,points=[],buckets=new Map(),ids=[];
  for(const v of mesh.vertices){const cell=v.map(x=>Math.floor(x/tolerance));let found=-1;
   for(let x=-1;x<=1&&found<0;x++)for(let y=-1;y<=1&&found<0;y++)for(let z=-1;z<=1&&found<0;z++){
    for(const i of buckets.get([cell[0]+x,cell[1]+y,cell[2]+z].join(','))||[])if(Math.hypot(...sub(v,points[i]))<tolerance){found=i;break;}
   }
   if(found<0){found=points.length;points.push(v);const key=cell.join(',');if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(found);}ids.push(found);
  }
  const unique=new Map();for(const f of mesh.faces){const tri=f.map(i=>ids[i]);if(new Set(tri).size!==3)continue;
   const sorted=[...tri].sort((a,b)=>a-b),key=sorted.join(','),k=tri.indexOf(sorted[0]),positive=tri[(k+1)%3]===sorted[1];
   const entry=unique.get(key)||{balance:0,positive:null,negative:null};entry.balance+=positive?1:-1;entry[positive?'positive':'negative']=tri;unique.set(key,entry);
  }
  return {vertices:points,faces:[...unique.values()].filter(e=>e.balance!==0).map(e=>e.balance>0?e.positive:e.negative)};
 }
 function topology(mesh,repaired=false) {
  const pts=mesh.vertices, triangles=mesh.faces;
  const info=triangles.map(ids=>{
   const c=cross(sub(pts[ids[1]],pts[ids[0]]),sub(pts[ids[2]],pts[ids[0]])),area=Math.hypot(...c);
   if(area<1e-13)throw Error('A zero-area boundary face prevents STEP export. Adjust the fit clearance slightly and regenerate.');
   const n=c.map(x=>x/area);const longest=Math.max(...ids.map((v,i)=>Math.hypot(...sub(pts[v],pts[ids[(i+1)%3]]))));return {ids,n,area,sliver:area/longest<TOL,d:dot(n,pts[ids[0]])};
  });
  const edges=new Map();
  info.forEach((f,i)=>{f.ids.forEach((a,k)=>{const b=f.ids[(k+1)%3],key=edgeKey(a,b);if(!edges.has(key))edges.set(key,[]);edges.get(key).push({f:i,a,b});});});
  for(const use of edges.values())if(use.length!==2||use[0].a!==use[1].b||use[0].b!==use[1].a){if(!repaired)return topology(healBoundary(mesh),true);throw Error('The CAD boundary is not closed. Change the dimensions or fit clearance slightly and regenerate.');}
  // Flood only across coplanar neighbours. Use a large seed face and compare
  // against its plane so a sequence of small angle changes cannot drift.
  const adj=info.map(()=>[]);for(const use of edges.values()){adj[use[0].f].push(use[1].f);adj[use[1].f].push(use[0].f);}
  const groupOf=new Int32Array(info.length).fill(-1),groups=[];
  const order=info.map((_,i)=>i).sort((a,b)=>info[b].area-info[a].area);
  for(const seed of order){if(groupOf[seed]>=0)continue;const plane=info[seed],id=groups.length,group=[],todo=[seed];groupOf[seed]=id;
   while(todo.length){const i=todo.pop();group.push(i);for(const j of adj[i]){if(groupOf[j]>=0)continue;const f=info[j];
    if((dot(plane.n,f.n)>0.999999||f.sliver) && f.ids.every(v=>Math.abs(dot(plane.n,pts[v])-plane.d)<TOL)) {groupOf[j]=id;todo.push(j);}
   }}groups.push({triangles:group,normal:plane.n,point:pts[plane.ids[0]]});
  }
  let faces=[],unmergedPlanarGroups=0;
  for(let gi=0;gi<groups.length;gi++){
   const g=groups[gi],boundary=[];
   for(const i of g.triangles)for(let k=0;k<3;k++){
    const a=info[i].ids[k],b=info[i].ids[(k+1)%3],uses=edges.get(edgeKey(a,b));
    if(uses.some(u=>groupOf[u.f]!==gi))boundary.push([a,b]);
   }
   const byStart=new Map();for(const e of boundary){if(!byStart.has(e[0]))byStart.set(e[0],[]);byStart.get(e[0]).push(e);}
   if([...byStart.values()].some(a=>a.length!==1)){
    // A valid closed boundary may contain a coplanar region that touches itself
    // at one vertex. Keep that region's original planar faces instead of
    // inventing an invalid merged wire or changing the model's dimensions.
    // Shared-edge and single-shell checks below still apply to the whole solid.
    for(const i of g.triangles){const t=info[i];faces.push({normal:t.n,point:pts[t.ids[0]],loops:[[...t.ids]]});}
    unmergedPlanarGroups++;continue;
   }
   const remaining=new Set(boundary),loops=[];
   while(remaining.size){const start=remaining.values().next().value,loop=[],seen=new Set();let e=start;
    do {if(!e||seen.has(e)||!remaining.has(e))throw Error('Could not close a CAD face wire.');seen.add(e);remaining.delete(e);loop.push(e[0]);e=byStart.get(e[1])?.[0];}while(e!==start);
    if(loop.length<3)throw Error('Degenerate CAD wire.');loops.push(loop);
   }
   const signed=loop=>{let c=[0,0,0];for(let k=0;k<loop.length;k++){const a=sub(pts[loop[k]],g.point),b=sub(pts[loop[(k+1)%loop.length]],g.point),v=cross(a,b);c=c.map((x,j)=>x+v[j]);}return dot(c,g.normal)/2;};
   const outer=loops.filter(l=>signed(l)>0),inner=loops.filter(l=>signed(l)<0);
   if(outer.length!==1){for(const i of g.triangles){const t=info[i];faces.push({normal:t.n,point:pts[t.ids[0]],loops:[[...t.ids]]});}unmergedPlanarGroups++;continue;}
   faces.push({normal:g.normal,point:g.point,loops:[outer[0],...inner]});
  }
  // Remove subdivisions of straight feature edges on BOTH incident faces.
  // Preserve any vertex where a third edge meets or the edge changes direction.
  const neighbours=new Map();for(const face of faces)for(const loop of face.loops)for(let k=0;k<loop.length;k++){
   const a=loop[k],b=loop[(k+1)%loop.length];if(!neighbours.has(a))neighbours.set(a,new Set());if(!neighbours.has(b))neighbours.set(b,new Set());neighbours.get(a).add(b);neighbours.get(b).add(a);
  }
  const remove=new Set();for(const [v,near] of neighbours){if(near.size!==2)continue;const[a,b]=[...near],d=sub(pts[b],pts[a]),u=sub(pts[v],pts[a]),len=Math.hypot(...d);if(len>1e-8&&Math.hypot(...cross(u,d))/len<TOL&&dot(u,d)>0&&dot(u,d)<len*len)remove.add(v);}
  for(const f of faces)f.loops=f.loops.map(loop=>{const next=loop.filter(v=>!remove.has(v));return next.length>=3?next:loop;});
  // Reject any incomplete edge pairing before a file is offered for download.
  const uses=new Map();for(let i=0;i<faces.length;i++)for(const loop of faces[i].loops)for(let k=0;k<loop.length;k++){
   const a=loop[k],b=loop[(k+1)%loop.length],key=edgeKey(a,b);if(!uses.has(key))uses.set(key,[]);uses.get(key).push({f:i,a,b});
  }
  for(const e of uses.values())if(e.length!==2||e[0].a!==e[1].b||e[0].b!==e[1].a)throw Error('CAD edge sharing failed. No STEP file was created.');
  // Each printable component must remain one connected closed shell.
  const seen=new Set([0]),todo=[0],faceNeighbours=faces.map(()=>[]);
  for(const e of uses.values()){faceNeighbours[e[0].f].push(e[1].f);faceNeighbours[e[1].f].push(e[0].f);}
  while(todo.length)for(const n of faceNeighbours[todo.pop()])if(!seen.has(n)){seen.add(n);todo.push(n);}
  if(seen.size!==faces.length)throw Error('A printable part contains disconnected CAD shells.');
  const volume=info.reduce((v,f)=>v+dot(pts[f.ids[0]],cross(pts[f.ids[1]],pts[f.ids[2]]))/6,0);
  if(volume<=0)throw Error('The CAD solid is inverted or empty.');
  return {vertices:pts,faces,volume,sourceTriangles:triangles.length,repaired,unmergedPlanarGroups};
 }
 const num=n=>{if(!Number.isFinite(n))throw Error('Non-finite STEP coordinate.');if(Math.abs(n)<5e-12)return '0.';let s=Number(n.toFixed(10)).toString().replace('e','E');if(s.includes('E')){const [m,e]=s.split('E');return (m.includes('.')?m:m+'.')+'E'+e;}return s.includes('.')?s:s+'.';};
 const text=s=>"'"+String(s).replace(/[^\x20-\x7e]/g,'_').replaceAll("'","''")+"'";
 const ref=i=>'#'+i,refs=a=>'('+a.map(ref).join(',')+')';
 class Writer {
  constructor(name){
   this.name=name;this.lines=[];this.colours=new Map();
   this.app=this.add("APPLICATION_CONTEXT('core data for automotive mechanical design processes')");
   this.add("APPLICATION_PROTOCOL_DEFINITION('international standard','automotive_design',2000,"+ref(this.app)+")");
   this.productContext=this.add("PRODUCT_CONTEXT('',"+ref(this.app)+",'mechanical')");
   this.definitionContext=this.add("PRODUCT_DEFINITION_CONTEXT('part definition',"+ref(this.app)+",'design')");
   const mm=this.add('(LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI.,.METRE.))'),rad=this.add('(NAMED_UNIT(*) PLANE_ANGLE_UNIT() SI_UNIT($,.RADIAN.))'),sr=this.add('(NAMED_UNIT(*) SI_UNIT($,.STERADIAN.) SOLID_ANGLE_UNIT())');
   const tol=this.add("UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(0.00002),"+ref(mm)+",'distance_accuracy_value','Boundary accuracy')");
   this.context=this.add('(GEOMETRIC_REPRESENTATION_CONTEXT(3) GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT('+refs([tol])+') GLOBAL_UNIT_ASSIGNED_CONTEXT('+refs([mm,rad,sr])+") REPRESENTATION_CONTEXT('','3D millimetres'))");
   this.origin=this.axis([0,0,0],[0,0,1],[1,0,0]);
  }
  add(s){this.lines.push(s);return this.lines.length;}
  point(p){return this.add("CARTESIAN_POINT('',("+p.map(num).join(',')+'))');}
  direction(v){return this.add("DIRECTION('',("+unit(v).map(num).join(',')+'))');}
  axis(p,n,x){return this.add("AXIS2_PLACEMENT_3D('',"+[this.point(p),this.direction(n),this.direction(x)].map(ref).join(',')+')');}
  product(name,representation){const product=this.add('PRODUCT('+text(name)+','+text(name)+",'',"+refs([this.productContext])+')'),formation=this.add("PRODUCT_DEFINITION_FORMATION('','',"+ref(product)+')'),definition=this.add("PRODUCT_DEFINITION('design','',"+ref(formation)+','+ref(this.definitionContext)+')'),shape=this.add("PRODUCT_DEFINITION_SHAPE('','',"+ref(definition)+')');this.add('SHAPE_DEFINITION_REPRESENTATION('+ref(shape)+','+ref(representation)+')');this.add("PRODUCT_RELATED_PRODUCT_CATEGORY('part',$,"+refs([product])+')');return {definition,representation};}
  style(solid,type){
   const rgb=type==='panel'?[.84,.79,.71]:type==='panelKey'?[.58,.47,.30]:[.22,.26,.29];const key=rgb.join(',');let style=this.colours.get(key);
   if(!style){const c=this.add("COLOUR_RGB('',"+rgb.map(num).join(',')+')');
    const fc=this.add("FILL_AREA_STYLE_COLOUR('',"+ref(c)+')'),fa=this.add("FILL_AREA_STYLE('',"+refs([fc])+')'),ss=this.add('SURFACE_STYLE_FILL_AREA('+ref(fa)+')'),side=this.add("SURFACE_SIDE_STYLE('',"+refs([ss])+')'),use=this.add('SURFACE_STYLE_USAGE(.BOTH.,'+ref(side)+')');style=this.add('PRESENTATION_STYLE_ASSIGNMENT('+refs([use])+')');this.colours.set(key,style);}
   const item=this.add("STYLED_ITEM('',"+refs([style])+','+ref(solid)+')');this.add("MECHANICAL_DESIGN_GEOMETRIC_PRESENTATION_REPRESENTATION('',"+refs([item])+','+ref(this.context)+')');
  }
  body(name,top,type='frame',transform=p=>p,mirrored=false){
   const pts=top.vertices.map(transform),pointIDs=new Map(),vertexIDs=new Map(),edgeIDs=new Map(),faces=[];
   const point=id=>{if(!pointIDs.has(id))pointIDs.set(id,this.point(pts[id]));return pointIDs.get(id);};
   const vertex=id=>{if(!vertexIDs.has(id))vertexIDs.set(id,this.add("VERTEX_POINT('',"+ref(point(id))+')'));return vertexIDs.get(id);};
   const edge=(a,b)=>{const key=edgeKey(a,b);if(!edgeIDs.has(key)){const lo=Math.min(a,b),hi=Math.max(a,b),v=this.add("VECTOR('',"+ref(this.direction(sub(pts[hi],pts[lo])))+',1.)'),line=this.add("LINE('',"+ref(point(lo))+','+ref(v)+')'),ec=this.add("EDGE_CURVE('',"+[vertex(lo),vertex(hi),line].map(ref).join(',')+',.T.)');edgeIDs.set(key,ec);}return this.add("ORIENTED_EDGE('',*,*,"+ref(edgeIDs.get(key))+','+(a<b?'.T.':'.F.')+')');};
   for(const face of top.faces){
    const loops=face.loops.map(l=>mirrored?[...l].reverse():l),outer=loops[0],a=pts[outer[0]];
    // A concave outer loop's first non-collinear triple is not necessarily
    // convex. Newell's area vector gives the correct outward plane normal.
    let area=[0,0,0];for(let k=0;k<outer.length;k++){const c=cross(sub(pts[outer[k]],a),sub(pts[outer[(k+1)%outer.length]],a));area=area.map((v,j)=>v+c[j]);}const n=unit(area);
    let x=unit(sub(pts[outer[1]],a));x=unit(sub(x,n.map(v=>v*dot(x,n))));
    const plane=this.add("PLANE('',"+ref(this.axis(a,n,x))+')'),bounds=[];
    for(let k=0;k<loops.length;k++){const l=loops[k],oriented=l.map((v,i)=>edge(v,l[(i+1)%l.length])),wire=this.add("EDGE_LOOP('',"+refs(oriented)+')');bounds.push(this.add((k===0?'FACE_OUTER_BOUND':'FACE_BOUND')+"('',"+ref(wire)+',.T.)'));}
    faces.push(this.add("ADVANCED_FACE('',"+refs(bounds)+','+ref(plane)+',.T.)'));
   }
   const shell=this.add("CLOSED_SHELL('',"+refs(faces)+')'),solid=this.add('MANIFOLD_SOLID_BREP('+text(name)+','+ref(shell)+')'),rep=this.add("ADVANCED_BREP_SHAPE_REPRESENTATION('',"+refs([this.origin,solid])+','+ref(this.context)+')');
   this.style(solid,type);return this.product(name,rep);
  }
  link(root,part,name,i){
   const usage=this.add('NEXT_ASSEMBLY_USAGE_OCCURRENCE('+text(String(i))+','+text(name)+",'',"+ref(root.definition)+','+ref(part.definition)+',$)'),shape=this.add("PRODUCT_DEFINITION_SHAPE('Placement','',"+ref(usage)+')'),tf=this.add("ITEM_DEFINED_TRANSFORMATION('','',"+ref(this.origin)+','+ref(this.origin)+')'),rel=this.add("(REPRESENTATION_RELATIONSHIP('','',"+ref(part.representation)+','+ref(root.representation)+') REPRESENTATION_RELATIONSHIP_WITH_TRANSFORMATION('+ref(tf)+') SHAPE_REPRESENTATION_RELATIONSHIP())');this.add('CONTEXT_DEPENDENT_SHAPE_REPRESENTATION('+ref(rel)+','+ref(shape)+')');
  }
  finish(){const date=new Date().toISOString().slice(0,19);return "ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION(('Frame and UV Panel Builder - solid BREP; millimetres'),'2;1');\nFILE_NAME("+text(this.name)+','+text(date)+",(''),(''),'Frame Builder 3.37 STEP Export','Frame Builder','');\nFILE_SCHEMA(('AUTOMOTIVE_DESIGN'));\nENDSEC;\nDATA;\n"+this.lines.map((s,i)=>'#'+(i+1)+' = '+s+';').join('\n')+'\nENDSEC;\nEND-ISO-10303-21;\n';}
 }
 function write(items,name='Frame_Assembly'){
  if(!items.length)throw Error('No parts are available for STEP export.');
  const w=new Writer(name);let root=null;
  if(items.length>1){const rep=w.add("SHAPE_REPRESENTATION('',"+refs([w.origin])+','+ref(w.context)+')');root=w.product(name,rep);}
  items.forEach((p,i)=>{const part=w.body(p.name,p.topology,p.type,p.transform,p.mirrored);if(root)w.link(root,part,p.name,i+1);});return w.finish();
 }
 function printTransform(part){const lo=part.bounds.min,s=part.bounds.size,rotate=part.rotation===90;return p=>{let q=sub(p,lo);if(part.printFlip)q=[q[0],s[1]-q[1],s[2]-q[2]];return rotate?[s[1]-q[1],q[0],q[2]]:q;};}
 return {topology,write,printTransform,tolerance_mm:TOL};
})();
if(typeof module!=='undefined')module.exports=FrameSTEP;
