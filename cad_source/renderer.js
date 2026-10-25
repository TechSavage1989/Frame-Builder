// Offline viewer. Both render paths use the same live, dimensioned assembly.
const canvas=$('view');
let SCENE=[],yaw=-.44,pitch=.18,zoom=1,panX=0,panY=0,raf=0,rafWindow=null;
let sceneCenter=[0,0,0],baseScale=1,depthRange=1500,previewTimer=0,lastPreview=null;
let projection='orthographic',cameraDistance=500,cameraNear=1,cameraFar=2000;
let program=null,meshes=[],softCtx=null,activeMode='rotate',drag=null;
const pointers=new Map();
const gl=canvas.getContext('webgl',{antialias:true,alpha:false,preserveDrawingBuffer:true});
const colors={frameKey:[88,137,148],faceplate:[176,146,105],frame:[55,65,73],clip:[106,121,133],key:[209,145,60],panel:[214,202,181],panelKey:[71,132,147],foot:[55,65,73],spacer:[106,121,133]};
canvas.dataset.renderer=gl?'webgl':'software-depth-buffer';
function shader(type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;}
if(gl){
  program=gl.createProgram();
  gl.attachShader(program,shader(gl.VERTEX_SHADER,`attribute vec3 aPosition;attribute vec3 aNormal;uniform vec4 uRot;uniform vec2 uScale;uniform vec2 uPan;uniform vec3 uCenter;uniform float uDepth;uniform vec3 uCamera;uniform float uPerspective;uniform vec3 uColor;varying vec3 vColor;
  vec3 turn(vec3 p){float x=uRot.x*p.x+uRot.y*p.z;float z=-uRot.y*p.x+uRot.x*p.z;return vec3(x,uRot.z*p.y-uRot.w*z,uRot.w*p.y+uRot.z*z);}
  void main(){vec3 p=turn(aPosition-uCenter);vec3 n=normalize(turn(aNormal));float l=.62+.36*abs(dot(n,normalize(vec3(.25,.48,-.84))));vColor=uColor*l+vec3(.045);if(uPerspective>.5){float z=p.z+uCamera.x;float a=(uCamera.z+uCamera.y)/(uCamera.z-uCamera.y);float b=-2.*uCamera.z*uCamera.y/(uCamera.z-uCamera.y);gl_Position=vec4(p.xy*uScale*uCamera.x+uPan*z,a*z+b,z);}else{gl_Position=vec4(p.x*uScale.x+uPan.x,p.y*uScale.y+uPan.y,p.z/uDepth,1.);}}`));
  gl.attachShader(program,shader(gl.FRAGMENT_SHADER,'precision mediump float;varying vec3 vColor;void main(){gl_FragColor=vec4(vColor,1.);}'));
  gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
  gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);
}else{softCtx=canvas.getContext('2d');}
const locations=gl?Object.fromEntries(['uRot','uScale','uPan','uCenter','uDepth','uCamera','uPerspective','uColor'].map(k=>[k,gl.getUniformLocation(program,k)])):{};
const attributes=gl?{position:gl.getAttribLocation(program,'aPosition'),normal:gl.getAttribLocation(program,'aNormal')}:{};
function visible(obj){if($('partSelect').value!=='all')return true;return !((obj.type==='panel'||obj.type==='panelKey')&&!$('panelToggle').checked||obj.type==='foot'&&!$('feetToggle').checked);}
function turn(v){const cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch);const x=cy*v[0]+sy*v[2],z=-sy*v[0]+cy*v[2];return [x,cp*v[1]-sp*z,sp*v[1]+cp*z];}
function updateBuffers(){
  if(gl)for(const mesh of meshes)gl.deleteBuffer(mesh.buffer);
  meshes=[];
  for(const obj of SCENE){
    const data=[];obj.normals=[];
    for(const face of obj.faces){
      const a=obj.vertices[face[0]],b=obj.vertices[face[1]],c=obj.vertices[face[2]],u=b.map((k,i)=>k-a[i]),v=c.map((k,i)=>k-a[i]);
      let n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],length=Math.hypot(...n)||1;n=n.map(k=>k/length);obj.normals.push(n);
      if(gl)for(const p of [a,b,c])data.push(...p,...n);
    }
    if(gl){const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.STATIC_DRAW);meshes.push({type:obj.type,buffer,count:data.length/6});}
  }
}
function calculateFit(recenter=true){
  const objects=SCENE.filter(visible);if(!objects.length)return;
  const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
  for(const obj of objects)for(const p of obj.vertices)for(let a=0;a<3;a++){lo[a]=Math.min(lo[a],p[a]);hi[a]=Math.max(hi[a],p[a]);}
  if(recenter)sceneCenter=lo.map((v,a)=>(v+hi[a])/2);
  // Keep the complete model inside the camera's near/far planes at every orbit
  // angle. Perspective uses a real homogeneous divide, not a skewed drawing.
  let radius=1;
  for(const obj of objects)for(const p of obj.vertices)radius=Math.max(radius,Math.hypot(...p.map((v,a)=>v-sceneCenter[a])));
  cameraDistance=Math.max(50,radius/Math.sin(Math.PI/8));
  cameraNear=Math.max(.1,cameraDistance-radius*1.05);cameraFar=cameraDistance+radius*1.05;
  let ex=1,ey=1,ez=1;
  for(const obj of objects)for(const p of obj.vertices){const q=turn(p.map((v,a)=>v-sceneCenter[a])),factor=projection==='perspective'?cameraDistance/(cameraDistance+q[2]):1;ex=Math.max(ex,Math.abs(q[0]*factor));ey=Math.max(ey,Math.abs(q[1]*factor));ez=Math.max(ez,Math.abs(q[2]));}
  const r=canvas.getBoundingClientRect();baseScale=Math.min(r.width*.88/(2*ex),r.height*.84/(2*ey));
  depthRange=Math.max(1500,Math.hypot(...hi.map((v,a)=>v-lo[a]))*2,ez*2);
}
function fitView(){zoom=1;panX=0;panY=0;calculateFit();redraw();}
function setStatus(state,text){canvas.dataset.previewStatus=state;$('previewStatus').dataset.state=state;$('previewStatus').textContent=text;}
function schedulePreview(o){
 clearTimeout(previewTimer);setStatus('updating','Updating');const next={...o};
 previewTimer=setTimeout(()=>{
  if(!current)return;
  try{
   const sizeChanged=!lastPreview||lastPreview.w!==next.w||lastPreview.h!==next.h;
   const model=FrameV3.make(next),cache=new WeakMap(),raw=model.parts.map(p=>{const m=FrameV3.mesh(p.spec,cache);FrameV3.validatePanelFront(p,m,model.params);const b=FrameV3.bounds(m),pm=FrameV3.printMesh(m,model.params,p);return {...p,mesh:m,displayMesh:p.displaySpec?FrameV3.mesh(p.displaySpec,cache):null,bounds:b,printMesh:pm,printBounds:FrameV3.bounds(pm),rotation:pm.rotation};});
   MODEL=model;RAW=raw;populate(model.params,raw);SCENE=sceneFromRaw();updateBuffers();
   if(sizeChanged){zoom=1;panX=0;panY=0;}calculateFit();lastPreview=model.params;
   $('viewerSize').textContent='Panel: '+fmt(next.w)+' x '+fmt(next.h)+' x '+fmt(next.t)+' mm | Frame: '+fmt(next.ow)+' x '+fmt(next.oh)+' mm';
   canvas.dataset.panelSize=[next.w,next.h,next.t].join(',');canvas.dataset.partCount=String(model.params.count);canvas.dataset.panelParts=String(model.params.panelCount);canvas.dataset.usableBed=[model.params.usableX,model.params.usableY].join(',');
   setStatus('ready','Ready');setExports(true);redraw();
  }catch(error){setStatus('error','Update failed');$('viewerSize').textContent=error.message+' The last valid view may still be visible.';setExports(false);console.error(error);}
 },100);
}
function invalidPreview(){clearTimeout(previewTimer);setStatus('invalid','Check dimensions');$('viewerSize').textContent='Check the dimensions. The last valid model is shown.';}
function paintSoftware(){
  if(!softCtx)return;
  const r=canvas.getBoundingClientRect(),W=Math.max(1,Math.round(r.width)),H=Math.max(1,Math.round(r.height));
  if(canvas.width!==W)canvas.width=W;if(canvas.height!==H)canvas.height=H;
  const image=softCtx.createImageData(W,H),pixels=image.data,depth=new Float32Array(W*H);depth.fill(Infinity);
  for(let i=0;i<pixels.length;i+=4){pixels[i]=232;pixels[i+1]=237;pixels[i+2]=240;pixels[i+3]=255;}
  const scale=baseScale*zoom,perspective=projection==='perspective';
  for(const obj of SCENE){
    if(!visible(obj))continue;
    const vertices=obj.vertices.map(p=>{const q=turn(p.map((v,a)=>v-sceneCenter[a])),factor=perspective?cameraDistance/(cameraDistance+q[2]):1;return [W/2+q[0]*scale*factor+panX,H/2-q[1]*scale*factor+panY,perspective?-1/(cameraDistance+q[2]):q[2]];}),base=colors[obj.type]||colors.frame;
    for(let fi=0;fi<obj.faces.length;fi++){
      const f=obj.faces[fi],a=vertices[f[0]],b=vertices[f[1]],c=vertices[f[2]],den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);if(Math.abs(den)<1e-7)continue;
      const xmin=Math.max(0,Math.floor(Math.min(a[0],b[0],c[0]))),xmax=Math.min(W-1,Math.ceil(Math.max(a[0],b[0],c[0]))),ymin=Math.max(0,Math.floor(Math.min(a[1],b[1],c[1]))),ymax=Math.min(H-1,Math.ceil(Math.max(a[1],b[1],c[1])));if(xmin>xmax||ymin>ymax)continue;
      const n=turn(obj.normals[fi]),light=.62+.36*Math.abs((.25*n[0]+.48*n[1]-.84*n[2])/Math.hypot(.25,.48,.84)),col=base.map(k=>Math.round(Math.min(255,k*light+11.5)));
      const inv=1/den,aa=(b[1]-c[1])*inv,ab=(c[0]-b[0])*inv,ba=(c[1]-a[1])*inv,bb=(a[0]-c[0])*inv;
      for(let y=ymin;y<=ymax;y++){
        const dy=y+.5-c[1];let w0=aa*(xmin+.5-c[0])+ab*dy,w1=ba*(xmin+.5-c[0])+bb*dy,idx=y*W+xmin;
        for(let x=xmin;x<=xmax;x++,idx++,w0+=aa,w1+=ba){const w2=1-w0-w1;if(w0>=-1e-6&&w1>=-1e-6&&w2>=-1e-6){const z=w0*a[2]+w1*b[2]+w2*c[2];if(z<depth[idx]){depth[idx]=z;const k=idx*4;pixels[k]=col[0];pixels[k+1]=col[1];pixels[k+2]=col[2];}}}
      }
    }
  }
  softCtx.putImageData(image,0,0);
}
function paint(){
  raf=0;rafWindow=null;if(!gl){paintSoftware();return;}
  const r=canvas.getBoundingClientRect(),dpr=Math.min((canvas.ownerDocument.defaultView||window).devicePixelRatio||1,2),W=Math.max(1,r.width),H=Math.max(1,r.height);
  const pw=Math.round(W*dpr),ph=Math.round(H*dpr);if(canvas.width!==pw)canvas.width=pw;if(canvas.height!==ph)canvas.height=ph;
  gl.viewport(0,0,canvas.width,canvas.height);gl.clearColor(.91,.93,.94,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(program);
  const scale=baseScale*zoom;gl.uniform4f(locations.uRot,Math.cos(yaw),Math.sin(yaw),Math.cos(pitch),Math.sin(pitch));
  gl.uniform2f(locations.uScale,2*scale/W,2*scale/H);gl.uniform2f(locations.uPan,2*panX/W,-2*panY/H);gl.uniform3f(locations.uCenter,...sceneCenter);gl.uniform1f(locations.uDepth,depthRange);gl.uniform3f(locations.uCamera,cameraDistance,cameraNear,cameraFar);gl.uniform1f(locations.uPerspective,projection==='perspective'?1:0);
  gl.enableVertexAttribArray(attributes.position);gl.enableVertexAttribArray(attributes.normal);
  for(const m of meshes){if(!visible(m))continue;const c=colors[m.type]||colors.frame;gl.uniform3f(locations.uColor,c[0]/255,c[1]/255,c[2]/255);gl.bindBuffer(gl.ARRAY_BUFFER,m.buffer);gl.vertexAttribPointer(attributes.position,3,gl.FLOAT,false,24,0);gl.vertexAttribPointer(attributes.normal,3,gl.FLOAT,false,24,12);gl.drawArrays(gl.TRIANGLES,0,m.count);}
}
function cancelViewerFrame(){if(raf&&rafWindow)rafWindow.cancelAnimationFrame(raf);raf=0;rafWindow=null;}
function redraw(){if(!raf){rafWindow=canvas.ownerDocument.defaultView||window;raf=rafWindow.requestAnimationFrame(paint);}}
function selectMode(mode){activeMode=mode;$('modeRotate').setAttribute('aria-pressed',String(mode==='rotate'));$('modePan').setAttribute('aria-pressed',String(mode==='pan'));canvas.dataset.mode=mode;}
function selectProjection(mode){
  if(mode!=='orthographic'&&mode!=='perspective')return;
  projection=mode;canvas.dataset.projection=mode;
  $('cameraOrtho').setAttribute('aria-pressed',String(mode==='orthographic'));
  $('cameraPerspective').setAttribute('aria-pressed',String(mode==='perspective'));
  $('cameraBadge').textContent=mode==='orthographic'?'Orthographic':'Perspective';
  // Retain orbit, pan and user zoom. Only refit the projection's baseline scale.
  calculateFit();redraw();
}
function pointerPoint(e){return {x:e.clientX,y:e.clientY,pointerType:e.pointerType,button:e.button,shift:e.shiftKey};}
function startGesture(){
  const points=[...pointers.values()];if(!points.length){drag=null;canvas.style.cursor='grab';return;}
  canvas.style.cursor='grabbing';
  if(points.length>=2){const [a,b]=points;drag={kind:'touch',x:(a.x+b.x)/2,y:(a.y+b.y)/2,distance:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y)),panX,panY,zoom};}
  else {const p=points[0];drag={kind:p.button===1||p.button===2||p.shift||activeMode==='pan'?'pan':'rotate',x:p.x,y:p.y,yaw,pitch,panX,panY};}
}
canvas.addEventListener('pointerdown',e=>{
  if(e.pointerType==='mouse'&&![0,1,2].includes(e.button))return;
  e.preventDefault();canvas.focus({preventScroll:true});pointers.set(e.pointerId,pointerPoint(e));canvas.setPointerCapture(e.pointerId);startGesture();
});
canvas.addEventListener('pointermove',e=>{
  if(!pointers.has(e.pointerId)||!drag)return;
  e.preventDefault();const previous=pointers.get(e.pointerId);pointers.set(e.pointerId,{...previous,x:e.clientX,y:e.clientY});
  const points=[...pointers.values()];
  if(drag.kind==='touch'&&points.length>=2){
    const [a,b]=points,cx=(a.x+b.x)/2,cy=(a.y+b.y)/2,r=canvas.getBoundingClientRect();
    zoom=Math.max(.15,Math.min(12,drag.zoom*Math.max(1,Math.hypot(a.x-b.x,a.y-b.y))/drag.distance));const ratio=zoom/drag.zoom;
    panX=cx-r.left-r.width/2-(drag.x-r.left-r.width/2-drag.panX)*ratio;
    panY=cy-r.top-r.height/2-(drag.y-r.top-r.height/2-drag.panY)*ratio;
  }else if(drag.kind==='pan'){
    panX=drag.panX+e.clientX-drag.x;panY=drag.panY+e.clientY-drag.y;
  }else{
    // Reverse both drag axes relative to the original V2 viewer.
    yaw=drag.yaw-(e.clientX-drag.x)*.008;
    pitch=Math.max(-1.55,Math.min(1.55,drag.pitch-(e.clientY-drag.y)*.008));
  }
  redraw();
});
function endPointer(e){if(!pointers.has(e.pointerId))return;pointers.delete(e.pointerId);if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);startGesture();}
for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,endPointer);
canvas.addEventListener('contextmenu',e=>e.preventDefault());canvas.addEventListener('auxclick',e=>e.preventDefault());
canvas.addEventListener('wheel',e=>{
  e.preventDefault();const r=canvas.getBoundingClientRect(),delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?r.height:1),old=zoom;
  zoom=Math.max(.15,Math.min(12,zoom*Math.exp(-delta*.001)));const ratio=zoom/old;
  const x=e.clientX-r.left-r.width/2,y=e.clientY-r.top-r.height/2;panX=x-(x-panX)*ratio;panY=y-(y-panY)*ratio;redraw();
},{passive:false});
canvas.addEventListener('keydown',e=>{
  const key=e.key.toLowerCase();let handled=true;
  if(key==='arrowleft')panX-=20;else if(key==='arrowright')panX+=20;else if(key==='arrowup')panY-=20;else if(key==='arrowdown')panY+=20;
  else if(key==='+'||key==='=')zoom=Math.min(12,zoom*1.15);else if(key==='-')zoom=Math.max(.15,zoom/1.15);
  else if(key==='f'||key==='0')fitView();else if(key==='p')selectMode('pan');else if(key==='r')selectMode('rotate');
  else if(key==='o')selectProjection(projection==='orthographic'?'perspective':'orthographic');
  else if(key==='escape'){for(const id of pointers.keys())if(canvas.hasPointerCapture(id))canvas.releasePointerCapture(id);pointers.clear();startGesture();}
  else handled=false;if(handled){e.preventDefault();redraw();}
});
$('cameraOrtho').onclick=()=>selectProjection('orthographic');$('cameraPerspective').onclick=()=>selectProjection('perspective');
$('modeRotate').onclick=()=>selectMode('rotate');$('modePan').onclick=()=>selectMode('pan');$('vFit').onclick=fitView;
function presetView(y,p){yaw=y;pitch=p;fitView();}
$('vShelf').onclick=()=>presetView(-.44,.18);$('vFront').onclick=()=>presetView(0,['all','panels'].includes($('partSelect').value)?-(MODEL?.params.isBorderless?MODEL.params.borderlessStandAngle:8)*Math.PI/180:0);$('vBack').onclick=()=>presetView(Math.PI,['all','panels'].includes($('partSelect').value)?(MODEL?.params.isBorderless?MODEL.params.borderlessStandAngle:8)*Math.PI/180:0);$('vSide').onclick=()=>presetView(Math.PI/2,0);
$('panelToggle').onchange=$('feetToggle').onchange=fitView;
let viewportObserver=null;
function observeViewport(){
 if(viewportObserver)viewportObserver.disconnect();
 const host=canvas.ownerDocument.defaultView||window;
 viewportObserver=new host.ResizeObserver(()=>{calculateFit();redraw();});
 viewportObserver.observe(canvas.parentElement);
}
observeViewport();
selectMode('rotate');selectProjection('orthographic');update();
// Read-only diagnostics for support and regression testing.
window.CanvasFrameViewer=Object.freeze({version:'3.51.0',geometryVersion:'3.51.0',getState:()=>({viewerLocation:canvas.ownerDocument===document?($('viewerPane').classList.contains('is-expanded')?'expanded':'embedded'):'detached',yaw,pitch,zoom,panX,panY,mode:activeMode,projection,cameraDistance,cameraNear,cameraFar,renderer:canvas.dataset.renderer,status:canvas.dataset.previewStatus,params:lastPreview?{...lastPreview}:null,parts:SCENE.length,triangles:SCENE.reduce((n,o)=>n+o.faces.length,0),center:[...sceneCenter],baseScale,frameParts:MODEL?MODEL.params.count:0,stlBounds:RAW.map(p=>({name:p.name,size:p.printBounds.size,rotation:p.rotation})),inspected:$('partSelect').value,explode:Number($('explode').value),loading:isLoading}),getModel:()=>MODEL,getMeshes:()=>RAW.map(p=>({name:p.name,type:p.type,mesh:p.mesh,bounds:p.bounds,printMesh:p.printMesh,printBounds:p.printBounds,rotation:p.rotation})),getScene:()=>SCENE.map(p=>({name:p.name,type:p.type,vertices:p.vertices,faces:p.faces}))});
