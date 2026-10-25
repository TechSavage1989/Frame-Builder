/* Canvas Frame v3.51.6 - one parametric geometry definition for preview and exports.
   All dimensions are millimetres. Export orientation is defined by each frame type.
   One geometry definition drives the preview, solid STEP and STL exports. */
const FrameV3 = (() => {
 const F=2.4,J=14,EPS=.001,PANEL_JOINT_WIDTH=64,PANEL_SPLIT_MIN_T=3.0;
 const box=(x,y,z,dx,dy,dz)=>({op:'box',min:[x,y,z],size:[dx,dy,dz]});
 const prism=(points,start,length,axis='z')=>({op:'prism',points,start,length,axis});

 // Analytic profile definitions. Mesh output is tessellated at <=0.002 mm chord error.
 // Fusion and the optional native STEP writer consume the circle/Bezier/arc descriptors.
 const cylinder=(center,radius,start,length)=>({op:'cylinder',center,radius,start,length});
 const curvePrism=(segments,start,length)=>({op:'curve_prism',segments,start,length});
 const lineCurve=(a,b)=>({kind:'line',points:[a,b]});
 const bezierCurve=points=>({kind:'bezier',points});
 const arcCurve=(a,m,b,radius)=>({kind:'arc',points:[a,m,b],radius});
 function splitBezier(points,t){
  const lerp=(a,b)=>a.map((v,i)=>v+(b[i]-v)*t),a=lerp(points[0],points[1]),b=lerp(points[1],points[2]),c=lerp(points[2],points[3]),d=lerp(a,b),e=lerp(b,c),f=lerp(d,e);
  return [[points[0],a,d,f],[f,e,c,points[3]]];
 }
 function curvePoints(s,tolerance=.002){
  if(s.op==='cylinder'){
   const n=Math.max(96,Math.ceil(Math.PI/Math.acos(Math.max(-1,1-tolerance/s.radius))));
   return Array.from({length:n},(_,i)=>[s.center[0]+s.radius*Math.cos(2*Math.PI*i/n),s.center[1]+s.radius*Math.sin(2*Math.PI*i/n)]);
  }
  const points=[];const append=p=>{if(!points.length||Math.hypot(...p.map((v,i)=>v-points[points.length-1][i]))>1e-9)points.push(p);};
  const flatten=(c,depth=0)=>{
   const [a,,,b]=c,dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy);
   const dist=p=>len?Math.abs((p[0]-a[0])*dy-(p[1]-a[1])*dx)/len:Math.hypot(p[0]-a[0],p[1]-a[1]);
   if(depth>=16||Math.max(dist(c[1]),dist(c[2]))<=tolerance){append(a);append(b);return;}
   const halves=splitBezier(c,.5);flatten(halves[0],depth+1);flatten(halves[1],depth+1);
  };
  for(const seg of s.segments){
   if(seg.kind==='line'){seg.points.forEach(append);continue;}
   if(seg.kind==='bezier'){flatten(seg.points);continue;}
   if(seg.kind!=='arc')throw Error('Unknown profile curve '+seg.kind);
   const [a,m,b]=seg.points,det=2*(a[0]*(m[1]-b[1])+m[0]*(b[1]-a[1])+b[0]*(a[1]-m[1]));
   if(Math.abs(det)<1e-10)throw Error('Degenerate circular arc.');
   const q=p=>p[0]*p[0]+p[1]*p[1],cx=(q(a)*(m[1]-b[1])+q(m)*(b[1]-a[1])+q(b)*(a[1]-m[1]))/det,cy=(q(a)*(b[0]-m[0])+q(m)*(a[0]-b[0])+q(b)*(m[0]-a[0]))/det;
   const r=Math.hypot(a[0]-cx,a[1]-cy),ang=p=>Math.atan2(p[1]-cy,p[0]-cx),norm=x=>(x%(2*Math.PI)+2*Math.PI)%(2*Math.PI),start=ang(a),sweep=norm(ang(b)-start),mid=norm(ang(m)-start),travel=mid<=sweep+1e-9?sweep:sweep-2*Math.PI;
   const n=Math.max(12,Math.ceil(Math.abs(travel)/(2*Math.acos(Math.max(-1,1-tolerance/r)))));
   for(let i=0;i<=n;i++)append(i===0?a:i===n?b:[cx+r*Math.cos(start+travel*i/n),cy+r*Math.sin(start+travel*i/n)]);
  }
  if(points.length>1&&Math.hypot(...points[0].map((v,i)=>v-points[points.length-1][i]))<1e-8)points.pop();
  return points;
 }
 const curveAsPrism=s=>prism(curvePoints(s),s.start,s.length);
 const union=(...items)=>({op:'union',items:items.flat().filter(Boolean)});
 const cut=(base,...items)=>({op:'cut',base,items:items.flat().filter(Boolean)});
 const intersect=(a,b)=>({op:'intersect',items:[a,b]});
 const copy=x=>JSON.parse(JSON.stringify(x));
 const clean=n=>Math.round(n*1e6)/1e6;
 function derive(p){
  if(p?.frameStyle==='borderless')return borderlessDerive(p);
  let o={w:203.2,h:254,t:3,b:12,ov:2,pc:.35,kc:.16,rg:.20,sectionMode:'auto',twoPartDirection:'auto',
    bedX:256,bedY:256,margin:3,customMargins:false,marginLeft:3,marginRight:3,marginFront:3,marginBack:3,
    printedPanel:false,panelSplit:'auto',panelJoint:.12,panelCenterClearance:.08,panelPostLength:56,includeStand:true,standType:'rigid',standHinge:.4,frameStyle:'original',structure:'reinforced',jointGrip:0,panelGrip:.08,faceplateStyle:'none',faceplateFit:.10,retainerClearance:.10,frameRampClearance:.40,frameBaseRelief:.25,...p};
  if(p&&p.standType===undefined&&p.includeStand===false)o.standType='none';
  if(!['none','rigid','fold'].includes(o.standType))throw Error('Select a valid shelf stand.');
  o.includeStand=o.standType!=='none';o.standHinge=Number(o.standHinge);
  if(!Number.isFinite(o.standHinge)||o.standHinge<.25||o.standHinge>.6)throw Error('Hinge thickness must be 0.25 to 0.60 mm.');
  if(!['original','solid','light'].includes(o.frameStyle))throw Error('Select a valid frame style.');
  if(!['none','plain','chamfered','stepped'].includes(o.faceplateStyle))throw Error('Select a valid faceplate style.');
  o.faceplateFit=Number(o.faceplateFit);
  if(!Number.isFinite(o.faceplateFit)||o.faceplateFit<0||o.faceplateFit>.20)throw Error('Faceplate grip must be 0 to 0.20 mm.');
  o.styleName={original:'Original snap frame',solid:'Top-loading frame',light:'Lightweight - adaptive depth'}[o.frameStyle];
  o.isLight=o.frameStyle==='light';o.closedFront=o.frameStyle!=='original';
  o.dualMounts=o.closedFront&&p?.dualMounts!==false;
  o.displayOrientation=p?.displayOrientation||'portrait';
  if(!['portrait','landscape'].includes(o.displayOrientation))throw Error('Select Portrait or Landscape display orientation.');
  o.mountQuarterTurn=o.dualMounts&&(o.displayOrientation==='landscape'?Number(o.h)>=Number(o.w):Number(o.w)>Number(o.h));
  o.structure='reinforced';
  o.reinforced=o.closedFront;
  o.sectionMode=String(p?.sectionMode??o.sectionMode??'auto');
  o.twoPartDirection=String(p?.twoPartDirection??o.twoPartDirection??'auto');
  if(!['auto','1','2','4'].includes(o.sectionMode))throw Error('Frame sections must be Auto, 1, 2 or 4.');
  if(!['auto','horizontal','vertical'].includes(o.twoPartDirection))throw Error('Choose an automatic, horizontal or vertical two-part split.');
  o.sectionTemplateInfo=p?.sectionTemplateInfo||null;
  for(const k of ['jointGrip','panelGrip']){o[k]=Number(o[k]);if(!Number.isFinite(o[k])||o[k]<0||o[k]>.12)throw Error('Seating grip must be 0 to 0.12 mm per side.');}
  o.jointLength=o.closedFront?18:14;
  o.panelJointLength=14;

  o.loading=o.isLight?'rear':'top';o.front=o.isLight?.8:o.closedFront?3.6:F;
  // Legacy V3 inputs used a NET square area, not a nominal bed dimension.
  if(p && p.bed!==undefined && p.bedX===undefined){o.bedX=Number(p.bed);o.bedY=Number(p.bed);o.margin=0;o.customMargins=false;}
  for(let k of ['bedX','bedY','margin','marginLeft','marginRight','marginFront','marginBack','panelJoint','panelPostLength']){
    o[k]=Number(o[k]);if(!Number.isFinite(o[k]))throw Error('Enter valid printer and panel dimensions.');
  }
  if(o.bedX<100||o.bedY<100||o.bedX>1200||o.bedY>1200)throw Error('Nominal printer width and depth must be 100 to 1200 mm.');
  for(let k of ['margin','marginLeft','marginRight','marginFront','marginBack'])if(o[k]<0||o[k]>250)throw Error('Bed margins must be 0 to 250 mm.');
  o.margins=o.customMargins?{left:o.marginLeft,right:o.marginRight,front:o.marginFront,back:o.marginBack}:{left:o.margin,right:o.margin,front:o.margin,back:o.margin};
  o.usableX=clean(o.bedX-o.margins.left-o.margins.right);
  o.usableY=clean(o.bedY-o.margins.front-o.margins.back);
  if(o.usableX<100||o.usableY<100)throw Error('After margins, this design needs at least 100 x 100 mm of usable print area.');
  o.bed=Math.min(o.usableX,o.usableY); // retained only for reading older scripts
  o.sectionSafety=typeof FrameBedSafety!=='undefined'?FrameBedSafety.resolve({...o,...p},o.sectionTemplateInfo):null;
  if(!['auto','single'].includes(o.panelSplit))throw Error('Select a valid printed-panel splitting mode.');
  if(o.panelJoint<.04||o.panelJoint>.35)throw Error('Panel joint clearance must be 0.04 to 0.35 mm.');
  if(o.panelPostLength<28||o.panelPostLength>72)throw Error('UV structural edge-post length must be 28 to 72 mm.');
  o.panelCenterClearance=Number(o.panelCenterClearance);
  if(!Number.isFinite(o.panelCenterClearance)||o.panelCenterClearance<.06||o.panelCenterClearance>.20)
   throw Error('Flat tongue vertical clearance must be 0.06 to 0.20 mm per face.');
  for(let k of ['w','h','t','b','ov','pc','kc','rg']){o[k]=Number(o[k]);if(!Number.isFinite(o[k]))throw Error('Enter a number for every dimension.');}
  if(o.w<80||o.h<80||o.w>1000||o.h>1000)throw Error('Panel width and height must be 80 to 1000 mm.');
  if(o.t<.8||o.t>12)throw Error('Panel thickness must be 0.8 to 12 mm.');
  for(const [k,min,max,label] of [['retainerClearance',.05,.30,'Retaining-clip clearance'],['frameRampClearance',.15,.45,'Connector underside clearance'],['frameBaseRelief',0,.30,'Ramp base relief']]){
   o[k]=Number(o[k]);if(!Number.isFinite(o[k])||o[k]<min||o[k]>max)throw Error(label+' must be '+min.toFixed(2)+' to '+max.toFixed(2)+' mm.');
  }
  o.requestedT=o.t;o.panelStructuralMinimum=PANEL_SPLIT_MIN_T;o.panelAutoThickened=false;
  // Finished panel thickness is authoritative. The generator never changes it.
  // Split generated panels use locking perimeter posts and a continuous captured seam within
  // the selected thickness. If the chosen thickness cannot support the joint,
  // layout generation reports that explicitly instead of silently thickening it.
  if(o.b<(o.isLight?8:10)||o.b>32)throw Error('Bezel width must be '+(o.isLight?'8':'10')+' to 32 mm.');
  if(o.ov<.5||o.ov>5)throw Error('Artwork overlap must be 0.5 to 5 mm per edge.');
  if(o.pc<.20||o.pc>.75)throw Error('Panel edge clearance must be 0.20 to 0.75 mm.');
  if(o.kc<.04||o.kc>.35)throw Error('Joint clearance must be 0.04 to 0.35 mm.');
  if(o.rg<.1||o.rg>.6)throw Error('Panel back clearance must be 0.10 to 0.60 mm.');
  o.q=clean(o.b-o.ov-o.pc);
  if(o.reinforced&&o.q<8.4-1e-8)throw Error('Reinforced rear structure needs at least 8.4 mm outside the panel pocket. Increase bezel width or reduce overlap.');
  if(o.q<(o.isLight?6.4:8.4)-1e-8)throw Error('Increase bezel width or reduce artwork overlap. At least '+(o.isLight?'6.4':'8.4')+' mm is needed outside the panel pocket for the joints.');
  if(o.ov<o.pc+.15-1e-8)throw Error('Artwork overlap must exceed the edge clearance by at least 0.15 mm.');
  o.ow=clean(o.w+2*(o.b-o.ov));o.oh=clean(o.h+2*(o.b-o.ov));o.vw=clean(o.w-2*o.ov);o.vh=clean(o.h-2*o.ov);
  o.rl=clean(o.pc+(o.isLight?.30:1.05));o.zr=clean(o.front+o.t+o.rg);
  // Keep the thin face and retaining profile; deepen only the panel-fit section.
  // A 3 mm panel is 4.9 mm deep with default clearances, not a maximum height.
  delete o.lightMaxPanel; // Ignore a retired 5 mm constraint in older geometry files.
  o.d=clean(o.isLight?Math.max(4.5,o.zr+o.rl+.25):Math.max(9,o.zr+o.rl+.8));
  if(o.isLight)o.d=clean(Math.max(o.d,o.zr+o.rl+.8,o.front+o.t+o.retainerClearance+.60+1.20));
  // Main connectors use the final wall height, including reinforcement.
  // The top-loading entrance strip uses its own local front height.
  if(o.reinforced)o.d=clean(Math.max(o.d,o.isLight?8:11));
  o.frameJointDepth=o.d;
  o.depthMode=o.reinforced?'panel_fit_reinforced':'panel_fit';o.connectionRevision=o.closedFront?'V347_FULL_HEIGHT_FRAME':'ORIGINAL_SNAP';o.panelConnectionRevision='V337_ADJUSTABLE_TONGUE_CLEARANCE';o.standMountRevision='V347_LATCH_SEATING_ALLOWANCE';
  o.jointDescription=o.closedFront?'Press-lock head with ramp base relief and 2 mm socket sidewalls':'Original integrated snap';
  o.weightRating_kg=null;

  o.blindFrameJoint=blindFrameDetails({H:o.frameJointDepth,width:o.q,g:o.kc,L:o.jointLength,rampClearance:o.frameRampClearance,baseRelief:o.frameBaseRelief});
  o.j=o.closedFront?o.blindFrameJoint.L+o.blindFrameJoint.bite:J;o.standSeat=o.isLight?2:6;
  o.hangerR=Math.min(o.isLight?2.7:3.4,(o.q-2)/2);o.hangerHead=clean(2*o.hangerR-.3);o.hangerSpacing=clean(o.ow-o.q);
  const hl=o.isLight?o.front+.2:o.d-5.2,hz=o.d-(o.hangerR-1.7)-.6;
  o.hangerHeadThickness=clean(Math.min(2.4,hz-hl-.2));o.hangerShank=3.2;
  o.jn=4;o.jbarb=.65;o.jslot=1.6;o.jflange=.65;
  o.layout=chooseLayout(o);o.nx=o.layout.nx;o.ny=o.layout.ny;o.count=o.layout.cells.length;
  o.panelLayout=o.printedPanel?choosePanelLayout(o):null;
  o.panelCount=o.panelLayout?o.panelLayout.cells.length:0;
  o.panelConnectors=o.panelCount>1?panelConnectorLayout(o.panelLayout,o):[];
  o.panelKeyCount=0;o.panelJointCount=o.panelConnectors.length;
  o.panelLockCount=o.panelConnectors.filter(j=>j.lockingPost).length;
  o.panelSkin=o.t;
  o.panelFaceGap=0;o.uvFacesOnBed=true;o.panelLockingBaseline='V3.51.5';
  o.frameConnectors=frameConnectors(o);o.frameKeyCount=0;o.frameJointCount=o.frameConnectors.length;
  if(o.closedFront)for(const j of o.frameConnectors){
   const width=j.axis==='x'&&j.at[1]>o.oh-o.b-.1&&!o.isLight?o.b:o.q;
   const d=blindFrameDetails({H:j.height,width,g:o.kc,L:o.jointLength,rampClearance:o.frameRampClearance,baseRelief:o.frameBaseRelief});
   if(d.femaleSideWall<2-1e-8)throw Error('Increase bezel width or reduce artwork overlap to provide 2.0 mm frame socket sidewalls.');
   if(d.engagement<.10-1e-8)throw Error('For the thinnest frame joint, reduce running clearance to '+(d.bite-.10).toFixed(2)+' mm or less to keep positive engagement.');
  }
  o.faceplateCount=o.frameStyle==='original'&&o.faceplateStyle!=='none'?o.frameConnectors.length:0;
  standPlan(o);
  const mountPose=standMountPose(o,o.mountQuarterTurn);
  o.standDisplayRearReach=clean(o.standRearReach+mountPose.dz/CA);
  hangerPlan(o);
  o.retainerLocations=o.isLight?lightRetainers(o):[];o.retainerCount=o.retainerLocations.length;
  o.totalCount=o.count+o.frameKeyCount+o.faceplateCount+o.panelCount+o.panelKeyCount+o.standCount;
  return o;
 }
 // V3.50: independent front-loading frame style. Assembly coordinates retain
 // the legacy convention (front toward -Z). Only frame print meshes are turned
 // rear-face-down. The existing three frame types use their unchanged paths.
 function borderlessDerive(p){
  const o=derive({...p,frameStyle:'original',standType:'none',includeStand:false,b:12,ov:2,printedPanel:false,sectionMode:'auto',twoPartDirection:'auto'});
  const number=(key,def,min,max,label)=>{const n=Number(p[key]??def);if(!Number.isFinite(n)||n<min||n>max)throw Error(label+' must be '+min+' to '+max+' mm.');return n;};
  o.isBorderless=true;
  o.sectionSafety=typeof FrameBedSafety!=='undefined'?FrameBedSafety.resolve({...o,...p},p.sectionTemplateInfo||null):null;
  o.sectionTemplateInfo=p.sectionTemplateInfo||null;
  o.frameStyle='borderless';o.styleName='Front Snap Borderless';o.loading='front';o.isLight=false;o.closedFront=false;
  o.borderlessRim=number('borderlessRim',1.2,1,2.4,'Front rim wall');
  o.borderlessOverlap=number('borderlessOverlap',.25,.2,.6,'Retaining edge overlap');
  o.borderlessBack=number('borderlessBack',3.2,3.2,5,'Reinforced connector thickness');
  o.borderlessWall=number('borderlessWall',1.2,.8,2.4,'Rear wall thickness');
  o.borderlessBase=number('borderlessBase',1.6,.8,3.2,'Rear base thickness');
  // Optional rear-plane perimeter flexures. Default ON for backward compatibility.
  o.frameSpringsEnabled=p.frameSpringsEnabled!==false;
  o.hangerThickness=number('hangerThickness',o.borderlessBase,.8,5,'Hanger total thickness');
  o.matchEaselBase=p.matchEaselBase!==false;
  o.easelThickness=o.matchEaselBase?o.borderlessBase:number('easelThickness',1.6,.8,3.2,'Easel web thickness');
  o.easelReinforcement=3.2; // Full-height head, spring, perimeter and cross brace.
  o.sectionMode=String(p.sectionMode??'auto');
  o.twoPartDirection=String(p.twoPartDirection??'auto');
  if(!['auto','1','2','4'].includes(o.sectionMode))throw Error('Frame sections must be Auto, 1, 2 or 4.');
  if(!['auto','horizontal','vertical'].includes(o.twoPartDirection))throw Error('Choose an automatic, horizontal or vertical two-part split.');
  o.sacrificialTabThickness=number('sacrificialTabThickness',.4,.2,1,'Sacrificial tab thickness');
  o.sacrificialTabWidth=number('sacrificialTabWidth',.8,.4,2,'Sacrificial tab width');
  o.borderlessCorner=number('borderlessCorner',12,4,30,'Corner lip relief');
  o.latchArm=number('latchArm',1.8,1.2,2.4,'Latch arm thickness');
  o.latchEngagement=number('latchEngagement',1.6,1.0,2.0,'Latch engagement depth');
  o.latchSpringBias=number('latchSpringBias',.50,0,.60,'Latch spring bias');
  if(o.borderlessBase>o.borderlessBack)throw Error('Rear base cannot be thicker than the reinforced connector pads.');
  o.borderlessStandAngle=Number(p.borderlessStandAngle??12);
  if(!Number.isFinite(o.borderlessStandAngle)||o.borderlessStandAngle<8||o.borderlessStandAngle>15)throw Error('Stand angle must be 8 to 15 degrees.');
  o.standType=p.standType==='none'||p.includeStand===false?'none':'breakaway';o.includeStand=o.standType!=='none';o.standCount=o.includeStand?1:0;
  o.printedPanel=!!p.printedPanel;o.requestedT=o.t;o.panelAutoThickened=false;
  o.q=o.borderlessRim;o.ov=o.borderlessOverlap;o.b=clean(o.q+o.pc+o.ov);
  o.ow=clean(o.w+2*(o.q+o.pc));o.oh=clean(o.h+2*(o.q+o.pc));o.vw=clean(o.w-2*o.ov);o.vh=clean(o.h-2*o.ov);
  o.snapProjection=clean(o.pc+o.ov);o.snapPeak=.25;
  o.rimWeb=.8;o.rimRampBottom=.80;o.rimRootRadius=.8;o.rimFreeHeight=5.2;
  // A shallow wall is paired with long, tangential springs in the rear plane.
  // Do not shorten the old fixed-root wall alone: the rear slots are integral
  // to this compact profile and must remain clear after printing.
  o.rearFlexure={outerCarrier:1.6,innerRail:4.6,beamWidth:1.0,rootRadius:.8,
   rootWidth:2.4,span:26,minWindow:18,maxWindow:100,slotClearance:1.0};
  o.depthProfile='thin_base_local_reinforcement';
  // Front coordinate zero is shared by the entire rim. The artwork sits just
  // behind its continuous lip; no separate tab reaches ahead of that plane.
  o.front=clean(o.rimRampBottom+o.ov+o.retainerClearance);
  o.rearRail=12;o.crossWidth=14;o.backThickness=o.borderlessBack;
  o.rearBaseThickness=o.borderlessBase;o.rearWallThickness=o.borderlessWall;
  o.latchMountClearance=.15;o.hookThickness=1.8;o.hookExtension=o.hookThickness+o.latchMountClearance;
  if(2*o.borderlessCorner+20>Math.min(o.w,o.h))throw Error('Reduce corner relief to retain at least 20 mm of straight lip per side.');
  const neckEnd=o.rimRampBottom+o.snapProjection+o.q-o.rimWeb;
  const rearPlane=Math.max(o.front+o.t+2.4,neckEnd+o.rimFreeHeight+o.rimRootRadius);
  o.headSpace=clean(rearPlane-o.front-o.t);
  o.d=clean(Math.max(rearPlane+o.backThickness,o.front+o.t+2.4+o.hangerThickness));o.frameJointDepth=o.backThickness;
  o.hangerPlane=clean(o.d-o.hangerThickness);
  o.headSpace=clean(o.hangerPlane-o.front-o.t);
  o.frontRetention=borderlessRimDetails(o);
  o.zr=clean(o.front+o.t);o.depthMode='front_snap_back_down';o.structure='rear_cross_brace';o.reinforced=true;
  o.connectionRevision='V350_REAR_PLANE_SNAP';o.standMountRevision='V3510_ADAPTIVE_EASEL_CLOSED_PROFILES';
  o.jointDescription='Integral rear-plane snap tongues; straight front butt seam';o.j=J;o.jointLength=J;
  o.faceplateStyle='none';o.faceplateCount=0;o.frameKeyCount=0;
  o.dualMounts=true;o.mountQuarterTurn=o.displayOrientation==='landscape'?o.h>=o.w:o.w>o.h;
  // Finished geometry belongs to the artwork, never to the printer grid.
  // Select seams around these fixed centered ribs and shared receiver axes.
  const short=Math.min(o.ow,o.oh),long=Math.max(o.ow,o.oh);
  o.parkingHeadEnvelope=5+o.hookExtension;
  o.parkX=clean(short/2-o.crossWidth/2-1.2-o.parkingHeadEnvelope);o.parkY=o.rearRail+2;
  o.parkSwap=o.ow>o.oh;
  const inset=clean(Math.min(22,Math.max(14,long/2-o.crossWidth/2-o.parkY-42.3)));
  o.adaptiveStandReach=clean(Math.min(Math.max(32,long*.20),o.parkX-o.rearRail-1.5));
  if(o.includeStand && (inset+40.8>long/2-o.crossWidth/2-o.parkY-1.0 || o.adaptiveStandReach<16))
   throw Error('This opening is too small or too narrow for the fixed-size latch and mounting head. Use wall display or a larger panel. The 4 x 6 through 12 x 16 family is supported.');
  o.frameCenter={x:clean(o.ow/2),y:clean(o.oh/2)};
  o.hangerLocations=[{edge:'top',role:'shared',at:[o.ow/2,clean(o.oh-inset)],angle:0,entryInset_mm:inset},
   {edge:'right',role:'shared',at:[clean(o.ow-inset),o.oh/2],angle:90,entryInset_mm:inset}];
  o.standMountHeight=inset;
  o.standRearReach=o.adaptiveStandReach;
  o.layout=borderlessLayout(o);o.nx=o.layout.nx;o.ny=o.layout.ny;o.count=o.layout.cells.length;
  o.splitValidation=borderlessValidateLayout(o,o.layout);
  o.frameConnectors=o.layout.cells.flatMap(c=>borderlessJoints(o,c).filter(j=>j.kind==='male'));o.frameJointCount=o.frameConnectors.length;
  o.retainerLocations=borderlessRetainers(o);o.retainerCount=o.retainerLocations.length;
  o.panelLayout=o.printedPanel?choosePanelLayout(o):null;if(o.panelLayout?.error)throw Error(o.panelLayout.error);o.panelCount=o.panelLayout?o.panelLayout.cells.length:0;
  o.panelConnectors=o.panelCount>1?panelConnectorLayout(o.panelLayout,o):[];o.panelJointCount=o.panelConnectors.length;
  o.panelLockCount=o.panelConnectors.filter(j=>j.lockingPost).length;o.panelKeyCount=0;o.panelSkin=o.t;
  o.panelFaceGap=0;o.uvFacesOnBed=true;o.panelLockingBaseline='V3.51.5';
  // Two identical shared receivers, one per display axis. The frame is
  // reversible: wall orientation has the receivers at top/right; turn the
  // backing 180 degrees before installing artwork for tabletop use. No
  // additional wall-only or stand-only aperture is generated.
  const ports=o.hangerLocations;
  o.hangerLocations=ports;o.sharedConnectorCount=2;o.sharedConnectorShape='single_connected_waisted_keyhole';
  o.sharedMounting='reverse_backing_180_degrees_for_tabletop';o.assemblyFrameRotation=o.includeStand?180:0;
  o.standMountHeight=ports[0].entryInset_mm;
  o.standRearReach=o.adaptiveStandReach;
  o.standDisplayRearReach=clean(o.standRearReach/Math.cos(o.borderlessStandAngle*Math.PI/180));
  o.standPorts=[o.standMountHeight];o.standLatch=borderlessLatchDetails(o);
  o.hangerHead=7;o.hangerHeadThickness=2.1;o.hangerShank=3.4;o.hangerSpacing=0;o.hangerSpacings={portrait:0,landscape:0};
  o.wallHangerInsets={top:ports[0].entryInset_mm,right:ports[1].entryInset_mm};
  o.wallHangerInsetsByOrientation={portrait:o.standMountHeight,landscape:o.standMountHeight};
  o.activeWallHangerEdge=o.mountQuarterTurn?'right':'top';
  o.wallHangerPlacement='shared_upper_centerline';o.wallHangerTargetInset=inset;
  o.frontRetention.rearFlexureWindows=borderlessFlexureWindows(o);
  o.frontRetention.rearFlexureCount=o.frontRetention.rearFlexureWindows.length;
  o.standParking=o.includeStand?(o.layout.parking||borderlessParking(o)):null;
  o.totalCount=o.count+o.panelCount;o.physicalPrintTested=false;
  return o;
 }
 // The cutter grid is independent of the centered master frame. Offset seams,
 // not ribs, around the central crossing. Both offset directions are available
 // so a small bed does not force a connector or parked stand through a seam.
 function borderlessGrid(o,nx,ny,biasX=18,biasY=18){
  const breaks=(n,M,bias)=>Array.from({length:n+1},(_,i)=>i===0?0:i===n?M:clean(i*M/n+(Math.abs(i*M/n-M/2)<18?bias:0)));
  const xs=breaks(nx,o.ow,biasX),ys=breaks(ny,o.oh,biasY),cells=[];
  for(let row=0;row<ny;row++)for(let col=0;col<nx;col++){
   const x=xs[col],y=ys[row],w=clean(xs[col+1]-x),h=clean(ys[row+1]-y);
   const hitX=x<o.ow/2+o.crossWidth/2&&x+w>o.ow/2-o.crossWidth/2,hitY=y<o.oh/2+o.crossWidth/2&&y+h>o.oh/2-o.crossWidth/2;
   if(col>0&&col<nx-1&&row>0&&row<ny-1&&!hitX&&!hitY)continue;
   cells.push({x,y,w,h,col,row,nx,ny,dx:clean(w+(col<nx-1?J:0)),dy:clean(h+(row<ny-1?J:0))});
  }
  return cells;
 }
 function borderlessJointBounds(o,j){
  const half=o.jn/2+o.jbarb+o.jflange+o.kc+.02,end=J+o.kc+.1;
  return j.axis==='x'?{min:[j.at[0]-.8,j.at[1]-half],max:[j.at[0]+end,j.at[1]+half]}
   :{min:[j.at[0]-half,j.at[1]-.8],max:[j.at[0]+half,j.at[1]+end]};
 }
 function borderlessReceiverBounds(h,pad=1){
  // Complete connected keyhole, not just the round screw-head entry. This
  // catches the long lower bay that a center-distance-only check missed.
  const c=Math.cos(h.angle*Math.PI/180),s=Math.sin(h.angle*Math.PI/180);
  const points=[[-4,-18.6],[4,-18.6],[4,8.2],[-4,8.2]].map(([x,y])=>[h.at[0]+c*x+s*y,h.at[1]-s*x+c*y]);
  return {min:[0,1].map(a=>Math.min(...points.map(p=>p[a]))-pad),max:[0,1].map(a=>Math.max(...points.map(p=>p[a]))+pad)};
 }
 function borderlessValidateLayout(o,layout){
  const fail=text=>{throw Error('Unsafe frame division: '+text);},pairs=new Map(),cells=layout.cells,adj=cells.map(()=>[]);
  const overlap=(a,b)=>a.min.every((v,i)=>v<b.max[i]-1e-6&&a.max[i]>b.min[i]+1e-6);
  const receiverBounds=(o.hangerLocations||[]).map(h=>borderlessReceiverBounds(h));
  for(let i=0;i<cells.length;i++){
   const c=cells[i];
   if(c.w<50-1e-6||c.h<50-1e-6||bedRotation(c.dx,c.dy,o)===null)fail('a section, including its tongues, does not fit the usable bed.');
   for(const j of borderlessJoints(o,c)){
    const key=j.axis+':'+j.at.map(clean).join(','),entry={...j,cell:i};
    if(!pairs.has(key))pairs.set(key,[]);pairs.get(key).push(entry);
    if(j.kind==='male'&&receiverBounds.some(h=>overlap(borderlessJointBounds(o,j),h)))fail('a section joint enters a shared hanger/stand opening.');
    if(j.kind==='female'){
     // A socket must be wholly contained in its receiving section. A tiny
     // throat overcut through the butt plane is intentional and excluded here.
     const box=borderlessJointBounds(o,j),axis=j.axis==='x'?0:1;
     box.min[axis]=j.at[axis];
     if(box.min.some((v,k)=>v<[c.x,c.y][k]-1e-6)||box.max.some((v,k)=>v>[c.x+c.w,c.y+c.h][k]+1e-6))fail('a receiver is cut off by another section seam.');
    }
   }
  }
  const male=[];
  for(const entries of pairs.values()){
   const a=entries.filter(j=>j.kind==='male'),b=entries.filter(j=>j.kind==='female');
   if(a.length!==1||b.length!==1||a[0].cell===b[0].cell)fail('every tongue must have exactly one matching socket.');
   adj[a[0].cell].push(b[0].cell);adj[b[0].cell].push(a[0].cell);male.push(a[0]);
  }
  for(let i=0;i<male.length;i++)for(let j=i+1;j<male.length;j++)
   if(overlap(borderlessJointBounds(o,male[i]),borderlessJointBounds(o,male[j])))fail('connector envelopes intersect.');
  const visited=new Set(),pending=[0];while(pending.length){const i=pending.pop();if(visited.has(i))continue;visited.add(i);pending.push(...adj[i].filter(j=>!visited.has(j)));}
  if(visited.size!==cells.length)fail('a frame section is not connected to the assembled frame.');
  if(o.hangerLocations?.length===2){
   const [v,h]=o.hangerLocations;
   if(Math.abs(v.at[0]-o.ow/2)>1e-6||Math.abs(h.at[1]-o.oh/2)>1e-6)fail('hanger axes are not centered.');
  }
  return {revision:'V3505_CENTERED_SPLIT_VALIDATION',matchedJointPairs:pairs.size,allTonguesMatched:true,
   socketsContained:true,connectorEnvelopesClear:true,receiverEnvelopesClear:true,connectedSections:visited.size,
   crossbarCenter_mm:[clean(o.ow/2),clean(o.oh/2)],hangersCentered:true};
 }
 function borderlessLayout(o){
  const candidates=[];
  for(let nx=1;nx<=16;nx++)for(let ny=1;ny<=16;ny++){
   if(o.sectionMode!=='auto'&&nx*ny!==Number(o.sectionMode))continue;
   if(o.sectionMode==='4'&&(nx!==2||ny!==2))continue;
   if(o.sectionMode==='2'&&o.twoPartDirection==='horizontal'&&ny!==2)continue;
   if(o.sectionMode==='2'&&o.twoPartDirection==='vertical'&&nx!==2)continue;
   for(const bx of nx%2===0?[18,-18]:[18])for(const by of ny%2===0?[18,-18]:[18]){
    const cells=borderlessGrid(o,nx,ny,bx,by);
    if(cells.some(c=>c.w<50||c.h<50||bedRotation(c.dx,c.dy,o)===null))continue;
    const layout={nx,ny,cells,score:cells.length*1e6+Math.max(...cells.map(c=>Math.max(c.dx,c.dy)))*10+Math.abs(nx-ny)+(bx<0?1:0)+(by<0?1:0)};
    candidates.push(layout);
   }
  }
  candidates.sort((a,b)=>a.score-b.score);
  let parkingFailed=false;
  for(const layout of candidates){
   try{borderlessValidateLayout(o,layout);}catch(_){continue;}
   if(o.includeStand){const parking=borderlessParking({...o,layout},false);if(!parking){parkingFailed=true;continue;}layout.parking=parking;}
   return layout;
  }
  if(o.sectionMode!=='auto')throw Error('The requested '+o.sectionMode+'-section frame cannot fit this bed with valid joints and easel clearance. Increase the bed, change the two-part direction, or select Auto. Parts are never scaled or silently divided differently.');
  if(parkingFailed)throw Error('The frame can be divided safely, but the one-piece breakaway easel cannot fit in a supported frame section at this size and bed. Select None - wall display, enlarge the usable bed, or adjust the panel size. No incompatible parts were generated.');
  throw Error('No safe frame division fits this usable bed while keeping the crossbars and shared hangers centered. Increase the usable bed or reduce the panel dimensions. No incompatible joints were generated.');
 }
 function borderlessJoints(o,c){
  const out=[],push=(kind,at,axis)=>out.push({kind,at:at.map(clean),axis,height:o.backThickness,railHeight:o.backThickness});
  for(const y of [o.rearRail/2,o.oh/2,o.oh-o.rearRail/2])if(y>c.y+.01&&y<c.y+c.h-.01){
   if(c.col>0)push('female',[c.x,y],'x');if(c.col<c.nx-1)push('male',[c.x+c.w,y],'x');
  }
  for(const x of [o.rearRail/2,o.ow/2,o.ow-o.rearRail/2])if(x>c.x+.01&&x<c.x+c.w-.01){
   if(c.row>0)push('female',[x,c.y],'y');if(c.row<c.ny-1)push('male',[x,c.y+c.h],'y');
  }
  return out;
 }
 function borderlessRetainers(o){
  // The four sides of the border are the retainers. They share one front
  // plane and a continuous lip; only required frame-section seams interrupt it.
  return ['bottom','top','left','right'].map(edge=>({edge,at:0,length:['left','right'].includes(edge)?o.oh:o.ow,
   type:'corner_relieved_border_lip',frontPlaneZ:0,overlap:o.ov,cornerReliefLength:o.borderlessCorner,exposedClip:false}));
 }
 function borderlessRimDetails(o){
  const neckEnd=clean(o.rimRampBottom+o.snapProjection+o.q-o.rimWeb),rootStart=clean(o.d-o.rearBaseThickness-o.rimRootRadius);
  return {type:o.frameSpringsEnabled?'corner_relieved_flexible_perimeter':'corner_relieved_solid_rear_perimeter',profile:'thin_base_local_reinforcement',frontPlaneZ:0,raisedClips:false,
   frameSpringsEnabled:o.frameSpringsEnabled,solidRearPerimeter:!o.frameSpringsEnabled,
   nominalVisibleBorder_mm:o.b,artworkOverlapPerEdge_mm:o.ov,panelFaceRecess_mm:o.front,
   wallFlexureThickness_mm:o.rimWeb,wallFlexureClearLength_mm:clean(rootStart-neckEnd),
   rootTransition_mm:o.rimRootRadius,minimumRearSeparation_mm:clean(Math.max(o.q+.8,o.rearFlexure.innerRail+.2)-o.rimWeb),
   rearFlexureBeamWidth_mm:o.frameSpringsEnabled?o.rearFlexure.beamWidth:0,rearFlexureSpan_mm:o.frameSpringsEnabled?o.rearFlexure.span:0,
   rearFlexureRootRadius_mm:o.rearFlexure.rootRadius,rearFlexureClearance_mm:o.rearFlexure.slotClearance,
   cornerReliefGaps:false,cornerLipRelief_mm:o.borderlessCorner,cornerReliefCount:4,rearWallThickness_mm:o.rearWallThickness,rearBaseThickness_mm:o.rearBaseThickness,mechanismPadThickness_mm:o.backThickness,hangerThickness_mm:o.hangerThickness,sacrificialTabThickness_mm:o.sacrificialTabThickness,sacrificialTabWidth_mm:o.sacrificialTabWidth,frontInterruptions:'frame section seams only; outer corners remain intact',panelBackSupport:'perimeter stops and raised cross-brace rails',
   maxGrowingFaceOverhangFromVertical_degrees:45,printFace:'rear',
   note:o.frameSpringsEnabled?'Rear-plane spring windows are enabled. Print a closed-border fit test; no insertion-force or fatigue rating.':'Rear-plane springs and their cutout windows are disabled. The rear perimeter is solid; front-loading may require more force. Test panel insertion before printing a full frame.',physicalPrintTested:false};
 }
 function borderlessRim(o){
  const W=o.ow,H=o.oh,p=o.snapProjection,web=o.rimWeb,rear=o.d-o.rearBaseThickness;
  const rect=w=>[[w,w],[W-w,w],[W-w,H-w],[w,H-w]];
  // In rear-face-down printing, the neck and retention underside grow at 1:1.
  // Thin walls rise from the rear plate. There are no floating lip islands,
  // bridges across the picture opening, exposed cantilever cuts or raised nibs.
  const stations=[[-.1,o.q],[0,o.q],[o.snapPeak,o.q+p],[o.rimRampBottom,o.q+p],
   [o.rimRampBottom+p,o.q],[o.rimRampBottom+p+o.q-web,web],
   [rear-o.rimRootRadius,web],[rear,web+o.rimRootRadius],[rear+.1,web+o.rimRootRadius]];
  const holes=[];
  for(let i=0;i<stations.length-1;i++){
   const [z0,w0]=stations[i],[z1,w1]=stations[i+1];
   holes.push(loft(rect(w0),z0,rect(w1),z1));
  }
  const L=o.borderlessCorner, q=o.q, depth=o.rimRampBottom+p+.05;
  const corners=[box(q,q,-.02,L,L,depth+.02),box(W-q-L,q,-.02,L,L,depth+.02),
   box(q,H-q-L,-.02,L,L,depth+.02),box(W-q-L,H-q-L,-.02,L,L,depth+.02)];
  return cut(box(0,0,0,W,H,rear+.05),union(holes),corners);
 }
 function borderlessHanger(o,h){
  const B=o.hangerThickness;
  // Exact circular entry, shared by screw and captured stand head.
  const local=union(cylinder([0,0],4,-.1,B+.2),
   box(-1.8,0,-.1,3.6,8.2,B+.2),box(-1.8,-18.2,-.1,3.6,11.6,B+.2),
   box(-2.2,-18.6,-.1,4.4,3.6,B+.2),box(-.5,-7.2,-.1,1.0,4.2,B+.2));
  const a=h.angle*Math.PI/180,c=Math.cos(a),sn=Math.sin(a);
  return {op:'transform',base:local,matrix:[c,sn,0,h.at[0],-sn,c,0,h.at[1],0,0,1,o.d-B,0,0,0,1]};
 }
 function borderlessFlexureWindows(o){
  if(o.frameSpringsEnabled===false)return [];
  const f=o.rearFlexure,windows=[];
  for(const edge of ['bottom','top','left','right']){
   const horizontal=edge==='bottom'||edge==='top',M=horizontal?o.ow:o.oh;
   const relevant=o.frameConnectors.filter(j=>horizontal?j.axis==='x'&&Math.abs(j.at[1]-(edge==='bottom'?o.rearRail/2:o.oh-o.rearRail/2))<.01:j.axis==='y'&&Math.abs(j.at[0]-(edge==='left'?o.rearRail/2:o.ow-o.rearRail/2))<.01);
   const blocked=[[0,12],[M-12,M],...relevant.map(j=>{const t=j.at[horizontal?0:1];return [t-3,t+J+3];})].sort((a,b)=>a[0]-b[0]);
   let cursor=0;const free=[];
   for(const [lo,hi] of blocked){if(lo>cursor)free.push([cursor,lo]);cursor=Math.max(cursor,hi);}
   if(cursor<M)free.push([cursor,M]);
   for(const [a,b] of free){
    if(b-a<f.minWindow)continue;
    const n=(!relevant.length && (!o.frameConnectors.length) && Math.min(o.w,o.h)>=100)?2:1,pitch=(b-a)/n,width=Math.min(f.maxWindow,pitch-2);
    if(width<f.minWindow)continue;
    for(let i=0;i<n;i++)windows.push({edge,start:clean(a+i*pitch+(pitch-width)/2),length:clean(width)});
   }
  }
  return windows;
 }
 function borderlessRearFlexures(o){
  if(o.frameSpringsEnabled===false)return {pockets:[],springs:[]};
  const f=o.rearFlexure,rear=o.d-o.rearBaseThickness,pockets=[],springs=[];
  const place=(s,edge)=>{
   const matrix=edge==='bottom'?[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]
    :edge==='top'?[1,0,0,0,0,-1,0,o.oh,0,0,1,0,0,0,0,1]
    :edge==='left'?[0,1,0,0,1,0,0,0,0,0,1,0,0,0,0,1]
    :[0,-1,0,o.ow,1,0,0,0,0,0,1,0,0,0,0,1];
   return {op:'transform',base:s,matrix};
  };
  for(const w of borderlessFlexureWindows(o)){
   const L=Math.min(f.span,w.length-8.4),a=w.start+(w.length-L-f.rootWidth)/2,t=f.rootWidth,r=f.rootRadius;
   const low=f.outerCarrier+f.slotClearance,high=low+f.beamWidth;
   const pts=[[a,f.outerCarrier-.05],[a+t,f.outerCarrier-.05],[a+t,low-r]];
   for(let i=1;i<=8;i++){const q=Math.PI-i*Math.PI/16;pts.push([a+t+r+r*Math.cos(q),low-r+r*Math.sin(q)]);}
   pts.push([a+L+t,low],[a+L+t,f.innerRail+.05],[a+L,f.innerRail+.05],[a+L,high+r]);
   for(let i=1;i<=8;i++){const q=-i*Math.PI/16;pts.push([a+L-r+r*Math.cos(q),high+r+r*Math.sin(q)]);}
   pts.push([a,high]);
   pockets.push(place(box(w.start,f.outerCarrier,rear-.02,w.length,f.innerRail-f.outerCarrier,o.rearBaseThickness+.04),w.edge));
   springs.push(place(prism(pts,rear,o.rearBaseThickness),w.edge));
  }
  return {pockets,springs};
 }
 function borderlessBody(o){
  const W=o.ow,H=o.oh,D=o.d,R=o.rearRail,B=o.backThickness,C=o.crossWidth,q=o.q;
  const ring=(width,z,dz)=>cut(box(0,0,z,W,H,dz),box(width,width,z-.01,W-2*width,H-2*width,dz+.02));
  const b0=o.rearBaseThickness;
  const unrelieved=union(ring(R,D-b0,b0),box(W/2-C/2,0,D-b0,C,H,b0),box(0,H/2-C/2,D-b0,W,C,b0));
  const pads=o.frameConnectors.map(j=>{
   const [x,y]=j.at,edge=j.axis==='x'?Math.abs(y-H/2)>C:Math.abs(x-W/2)>C,wide=edge?R:C;
   return j.axis==='x'?box(x-2,y-wide/2,D-B,J+4.0,wide,B):box(x-wide/2,y-2,D-B,wide,J+4.0,B);
  });
  const receiverRecesses=[];
  for(const h of o.hangerLocations){const angle=h.angle*Math.PI/180,c=Math.cos(angle),sn=Math.sin(angle);
   receiverRecesses.push({op:'transform',base:box(-C/2+.4,-22,D-b0-.02,C-.8,34,b0+.04),matrix:[c,sn,0,h.at[0],-sn,c,0,h.at[1],0,0,1,0,0,0,0,1]});
   pads.push({op:'transform',base:box(-C/2,-22,D-o.hangerThickness,C,34,o.hangerThickness),matrix:[c,sn,0,h.at[0],-sn,c,0,h.at[1],0,0,1,0,0,0,0,1]});
  }
  const flex=borderlessRearFlexures(o);
  const base=union(cut(unrelieved,flex.pockets,receiverRecesses),flex.springs,pads);
  const walls=borderlessRim(o);
  // The rigid panel stops are independent of the flexible outside wall.
  // Move the stops onto the rigid inner rail, clear of the rear spring band.
  // The panel never bears on a flexure. The visible rim has no new cuts.
  const a=Math.max(q+.8,o.rearFlexure.innerRail+.2),b=a+o.rearWallThickness,z=o.front+o.t;
  const stops=cut(box(a,a,z,W-2*a,H-2*a,D-z),box(b,b,z-.01,W-2*b,H-2*b,D-z+.02));
  // Tall, narrow rails support the panel back without tying the flexible rim
  // to the stops. Keep a clear central well for the hooks and screw heads.
  const t=o.rearWallThickness;
  const risers=union(box(W/2-C/2,a,z,t,H-2*a,D-z),box(W/2+C/2-t,a,z,t,H-2*a,D-z),
   box(a,H/2-C/2,z,W-2*a,t,D-z),box(a,H/2+C/2-t,z,W-2*a,t,D-z));
  const headClearance=o.hangerLocations.map(h=>{
   const angle=h.angle*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
   return {op:'transform',base:box(-5,-22,z-.01,10,36,D-o.hangerThickness-z+.03),matrix:[c,s,0,h.at[0],-s,c,0,h.at[1],0,0,1,0,0,0,0,1]};
  });
  const panelSupports=cut(risers,headClearance);
  // Do not put a shelf over a socket: its roof would be an unsupported island.
  // Stop ledges end beside each rear-plane connector; the remaining ledges set
  // panel depth. The narrow front wall remains continuous to the butt seam.
  const stopReliefs=o.frameConnectors.filter(j=>j.axis==='y'?Math.abs(j.at[0]-W/2)>C:Math.abs(j.at[1]-H/2)>C).map(j=>{
   const z=o.front+o.t-.02,dz=D-B-z+.06;
   return j.axis==='y'?box(j.at[0]<W/2?q:W-R,j.at[1]-.03,z,R-q,J+o.kc+.3,dz)
    :box(j.at[0]-.03,j.at[1]<H/2?q:H-R,z,J+o.kc+.3,R-q,dz);
  });
  return cut(union(base,walls,cut(stops,headClearance),panelSupports),stopReliefs,o.hangerLocations.map(h=>borderlessHanger(o,h)));
 }
 // Signed bias bends the whole free arm toward the receiver (-X). The fixed
 // sample stations preserve feature topology at zero bias and across edits.
 // This is a printable resting profile, not a stress or fatigue simulation.
 const latchStations=[15,15.6,15.8,17.4,18.4,18.6,19.4,20.8,22,24,26,28,30,32,34,36,37];
 function latchShapeFactor(y){const s=Math.max(0,Math.min(1,(37-y)/22));return s*s*(3-s)/2;}
 function latchSeatedBias(o){return Math.min(o.latchSpringBias,.25/latchShapeFactor(18.6));}
 function borderlessLatchDetails(o){
  const k=o.standMountHeight,phi=latchShapeFactor(18.4),seat=latchSeatedBias(o);
  const free=o.latchEngagement-.25+o.latchSpringBias*phi;
  return {type:'curved_arm_single_keyed_head_releasable_latch',travel_mm:8,insertDirection:'down toward frame bottom',
   guideSlot:false,separateStabilizerOpening:false,connectedReceiverOpenings:1,positiveRetention:true,
   capturedAttachmentPoints:2,normalClearancePerFace_mm:o.latchMountClearance,upperCaptureOverlap_mm:3.3,lowerCaptureOverlap_mm:2.2,
   hookThickness_mm:o.hookThickness,receiverThickness_mm:o.hangerThickness,curveDefinition:'cubic Bezier with circular root',meshChordTolerance_mm:.002,waistWidth_mm:1.0,minimumWaistShoulderEngagementPerSide_mm:1.1,
   lowerHookPreventsPeeling:true,upperRearBearingPad:true,positiveAndNegativeNormalBearing:true,
   releaseDirection:'away from frame',beamRootY:clean(k+38.4),beamCurveRootY:clean(k+37),beamTipY:clean(k+15),
   beamThickness_mm:o.latchArm,beamWidth_mm:3.2,rootRadius_mm:1.4,toothBottomY:clean(k+18.4),
   toothReachFromArm_mm:o.latchEngagement,toothProjection_mm:clean(free),
   springBias_mm:o.latchSpringBias,springBiasDirection:'toward receiver (-X in stand-local coordinates)',
   seatedBiasEstimate_mm:clean(seat),seatingTipDeflectionEstimate_mm:clean(o.latchSpringBias-seat),
   seatedToothProjectionEstimate_mm:clean(o.latchEngagement-.25+seat*phi),
   preloadBlock:false,contactFeature:'curved spring arm face against solid rib at the locking-bay edge',
   displayState:'estimated seated profile; not an elastic simulation',
   freeState:'printed arm and tooth biased inward together; no separate preload pad',
    easelWebThickness_mm:o.easelThickness,easelReinforcementThickness_mm:3.2,
    easelStructure:'thin bed-facing membrane with full-height perimeter, central brace, mounting head and spring',
   receiverBottomOffset_mm:-18.6,receiverTopOffset_mm:-15,receiverWidth_mm:4.4,seatedVerticalPlay_mm:.2,
   releaseTipTravelEstimate_mm:clean(o.latchSpringBias+(o.latchEngagement-.10)/phi),
   releaseStopTravel_mm:clean(3+o.latchSpringBias),physicalPrintTested:false};
 }
 // Material savings are confined to two membrane panels. The uncut perimeter,
 // foot edge, head, latch and middle brace retain the 3.2 mm structural envelope.
 // Both membrane and skeleton start on the bed. No roof or support is introduced.
 function borderlessEaselWeb(o){
  const R=o.standRearReach,k=o.standMountHeight,t=Math.tan(o.borderlessStandAngle*Math.PI/180);
  const a=3.45,b=R-4,top=k+10;
  const sideAtTop=R+(10-R)*(top-R*t)/(k+40.8-R*t)-3.2;
  const lowA=a*t+3.2,lowB=b*t+3.2;
  const cut=[[a,lowA],[b,lowB],[sideAtTop,top],[a,top]];
  const web=[[a-.2,lowA-.2],[b+.2,lowB-.2],[sideAtTop+.2,top+.2],[a-.2,top+.2]];
  const middle=(Math.max(lowA,lowB)+top)/2;
  const rightAt=y=>b+(sideAtTop-b)*(y-lowB)/(top-lowB);
  const brace=[[a-.2,middle-1.2],[rightAt(middle-1.2)+.2,middle-1.2],
   [rightAt(middle+1.2)+.2,middle+1.2],[a-.2,middle+1.2]];
  return {cut,web,brace};
 }
 function borderlessStandLocal(o,profile='free'){
  const k=o.standMountHeight,R=o.standRearReach,B=o.hangerThickness,tan=Math.tan(o.borderlessStandAngle*Math.PI/180),T=3.2;
  const x=.25,right=x+o.latchArm,r=1.4;
  const bias=typeof profile==='number'?profile:profile==='seated'?latchSeatedBias(o):o.latchSpringBias;
  const offset=y=>bias*latchShapeFactor(y);
  const controls=face=>[[face,k+37],[face,k+37-22/3],[face-bias/2,k+37-44/3],[face-bias,k+15]];
  // One exact cubic for each long arm face. Only the intentional tip chamfer is straight.
  const outer=controls(x),trim=splitBezier(outer,(37-15.8)/22)[0];
  const a=[x,x*tan],b=[R,R*tan],c=[10,k+40.8],d=[x,k+40.8],tip=[x-bias+.4,k+15],base=[x,k+13.8];
  const inside=[...controls(right)].reverse(),p0=[8.2,k+38.4],p1=[8.2,k+13.8];
  const arcEnd=[right+r,k+37+r],arcMid=[right+r-r/Math.sqrt(2),k+37+r/Math.sqrt(2)];
  // One closed boundary, not overlapping outline/pocket profiles.
  const outline=[lineCurve(a,b),lineCurve(b,c),lineCurve(c,d),lineCurve(d,trim[0]),
   bezierCurve(trim),lineCurve(trim[3],tip),lineCurve(tip,inside[0]),bezierCurve(inside),
   arcCurve(inside[3],arcMid,arcEnd,r),lineCurve(arcEnd,p0),lineCurve(p0,p1),lineCurve(p1,base),lineCurve(base,a)];
  const pocket=borderlessEaselWeb(o),shell=cut(curvePrism(outline,0,T),prism(pocket.cut,-.1,T+.2));
  const body=union(shell,prism(pocket.web,0,o.easelThickness),prism(pocket.brace,0,T));
  const headBox=(a,b,dx,dy)=>box(a,k-b-dy,0,dx,dy,T),ext=o.hookExtension;
  const neck=headBox(-B-ext,6,B+ext+.6,2),hook=headBox(-B-ext,6,o.hookThickness,5.5);
  const rearPad=headBox(o.latchMountClearance,6,2.0,5.5);
  const innerNeck=headBox(-B-ext,-10,B+ext+.6,2.8),innerHook=headBox(-B-ext,-10,o.hookThickness,5.6);
  const innerRearPad=headBox(o.latchMountClearance,-10,2.0,5.6);
  const E=o.latchEngagement,dx=offset(18.4);
  const tooth=prism([[x-E-dx,k+18.4],[x+.6-dx,k+18.4],[x+.6-dx,k+15.6],[x+.4-dx,k+15.6],[x-E-dx,k+17.6]],0,T);
  const releasePad=headBox(right-.6-bias,-17.4,5.2-right+.6,2.4);
  return union(body,neck,hook,rearPad,innerNeck,innerHook,innerRearPad,tooth,releasePad);
 }
 function borderlessReverseFrame(o,s){
  return {op:'transform',base:s,matrix:[-1,0,0,o.ow,0,-1,0,o.oh,0,0,1,0,0,0,0,1]};
 }
 function borderlessParking(o,fail=true){
  const k=o.standMountHeight,R=o.standRearReach,B=o.hangerThickness,C=o.crossWidth;
  const x0=o.parkX,y0=o.parkY,Q=Math.min(o.ow,o.oh)/2-C/2+o.rearRail;
  const localLo=[-B-o.hookExtension,0],localHi=[R,k+40.8],swap=o.parkSwap;
  const preferred=swap?[0,1,0,y0,1,0,0,Q-x0,0,0,-1,o.d,0,0,0,1]
   :[-1,0,0,x0,0,1,0,y0,0,0,-1,o.d,0,0,0,1];
  const bound={min:swap?[y0,Q-x0-B-o.hookExtension]:[x0-R,y0],max:swap?[y0+k+40.8,Q-x0+R]:[x0+B+o.hookExtension,y0+k+40.8]};
  const index=o.layout.cells.findIndex(c=>bound.min[0]>c.x+.8&&bound.max[0]<c.x+c.w-.8&&bound.min[1]>c.y+.8&&bound.max[1]<c.y+c.h-.8);
  if(index>=0 && bound.min[0]>=o.rearRail+1 && bound.min[1]>=o.rearRail+1 && bound.max[0]<=o.ow/2-C/2-1 && bound.max[1]<=o.oh/2-C/2-1){
   const edge=Math.min(o.ow,o.oh)/2-C/2,stand=x0-.25,overlap=.4,t=o.sacrificialTabThickness,w=o.sacrificialTabWidth;
   const tabs=[5,k-2,k+39.8].map(v=>swap?box(y0+v-w/2,Q-edge-overlap,o.d-t,w,edge-stand+2*overlap,t)
    :box(stand-overlap,y0+v-w/2,o.d-t,edge-stand+2*overlap,w,t));
   return {matrix:preferred,bounds:bound,cellIndex:index,tabs,tabThickness:t,tabWidth:w,
    adaptive:true,parkTurnDegrees:swap?90:0,tabPlacement:'shared live stand/rib datums; 0.4 mm embedded overlap at both ends'};
  }
  const quads=[{x:o.rearRail,y:o.rearRail,w:o.ow/2-C/2-o.rearRail,h:o.oh/2-C/2-o.rearRail},
   {x:o.ow/2+C/2,y:o.rearRail,w:o.ow/2-C/2-o.rearRail,h:o.oh/2-C/2-o.rearRail},
   {x:o.rearRail,y:o.oh/2+C/2,w:o.ow/2-C/2-o.rearRail,h:o.oh/2-C/2-o.rearRail},
   {x:o.ow/2+C/2,y:o.oh/2+C/2,w:o.ow/2-C/2-o.rearRail,h:o.oh/2-C/2-o.rearRail}];
  const rotations=[[-1,0,0,1],[0,-1,-1,0],[1,0,0,-1],[0,1,1,0]];
  const localCorners=[[-B-o.hookExtension,0],[R,0],[R,k+40.8],[-B-o.hookExtension,k+40.8]];
  for(let qi=0;qi<quads.length;qi++)for(let ri=0;ri<rotations.length;ri++){
   const q=quads[qi],[a,b,c,d]=rotations[ri],normal=[-a,-c],axis=Math.abs(normal[0])?0:1,other=1-axis,sign=normal[axis];
   const pts=localCorners.map(([x,y])=>[a*x+b*y,c*x+d*y]),lo=[0,1].map(i=>Math.min(...pts.map(p=>p[i]))),hi=[0,1].map(i=>Math.max(...pts.map(p=>p[i])));
   const qlo=[q.x,q.y],qhi=[q.x+q.w,q.y+q.h],edge=sign>0?qhi[axis]:qlo[axis];
   for(let ci=0;ci<o.layout.cells.length;ci++){
    const frameCell=o.layout.cells[ci],clo=[frameCell.x,frameCell.y],chi=[frameCell.x+frameCell.w,frameCell.y+frameCell.h],t=[0,0];
    t[axis]=edge-sign*1.2-(sign>0?hi[axis]:lo[axis]);
    const low=Math.max(qlo[other]+1,clo[other]+.9)-lo[other],high=Math.min(qhi[other]-1,chi[other]-.9)-hi[other];
    if(low>high+1e-7)continue;t[other]=Math.min(high,low+1);
    const min=lo.map((n,i)=>clean(n+t[i])),max=hi.map((n,i)=>clean(n+t[i]));
    if(min.some((n,i)=>n<Math.max(qlo[i]+1,clo[i]+.8)-1e-6)||max.some((n,i)=>n>Math.min(qhi[i]-1,chi[i]-.8)+1e-6))continue;
    const landing=edge+sign*.3;if(landing<=clo[axis]+.01||landing>=chi[axis]-.01)continue;
    const matrix=[a,b,0,clean(t[0]),c,d,0,clean(t[1]),0,0,-1,o.d,0,0,0,1];
    const tabs=[5,k-2,k+39.8].map(y=>{
     const p=[a*.25+b*y+t[0],c*.25+d*y+t[1]],start=p[axis]-sign*.15;
     const tw=o.sacrificialTabWidth,tt=o.sacrificialTabThickness;
     const pos=[p[0]-tw/2,p[1]-tw/2,o.d-tt],size=[tw,tw,tt];pos[axis]=Math.min(start,landing);size[axis]=Math.abs(landing-start);
     return box(...pos,...size);
    });
    return {matrix,bounds:{min,max},cellIndex:ci,quadrant:qi,rotationDegrees:ri*90,tabs,
     tabThickness:o.sacrificialTabThickness,tabWidth:o.sacrificialTabWidth,tabPlacement:'alternate split-section placement; mounting head unchanged'};
   }
  }
  if(!fail)return null;
  throw Error('The adaptive breakaway easel does not fit inside a safe frame section at this size/bed combination. Select None - wall display or enlarge the usable bed.');
 }
 function borderlessParked(o,local){const p=o.standParking;return {op:'transform',base:local,matrix:p.matrix||[-1,0,0,p.x0,0,1,0,p.y0,0,0,-1,o.d,0,0,0,1]};}
 function borderlessStandDisplay(o,local){
  const T=3.2;
  const matrix=o.mountQuarterTurn?[0,1,0,0,0,0,-1,o.oh/2+T/2,1,0,0,o.d,0,0,0,1]
   :[0,0,1,o.ow/2-T/2,0,1,0,0,1,0,0,o.d,0,0,0,1];
  return {op:'transform',base:local,matrix};
 }
 function borderlessMake(o){
  const base=borderlessBody(o),parts=[];
  for(const [i,c] of o.layout.cells.entries()){
   const joints=borderlessJoints(o,c),rear=o.d-o.backThickness;
   let spec=intersect(base,box(c.x,c.y,-.05,c.w,c.h,o.d+.1));
   spec=union(spec,joints.filter(j=>j.kind==='male').map(j=>shift(male(o,j.at,j.axis,o.backThickness),0,0,rear)));
   spec=cut(spec,joints.filter(j=>j.kind==='female').map(j=>shift(female(o,j.at,j.axis,o.backThickness),0,0,rear)));
   parts.push({name:partName(o,c,i).replace('Frame_','Frame_Front_Snap_'),type:'frame',spec,cell:c,joints,printFlip:true,printFace:'rear face on bed'});
  }
  if(o.includeStand){
   for(const frame of parts){
    frame.displaySpec=borderlessReverseFrame(o,frame.spec);
    const c=frame.cell;
    frame.displayCell={...c,x:clean(o.ow-c.x-c.w),y:clean(o.oh-c.y-c.h),col:c.nx-1-c.col,row:c.ny-1-c.row};
   }
   const local=borderlessStandLocal(o),parked=borderlessParked(o,local),p=o.standParking;
   // Keep every sacrificial link on rigid material, away from the new spring.
   const tabYs=[5,o.standMountHeight-2,o.standMountHeight+39.8];
   const index=p.cellIndex,frame=parts[index],tabs=p.tabs||tabYs.map(localY=>{
    const y=p.y0+localY,x=p.x0-.25;
    return box(x-.15,y-o.sacrificialTabWidth/2,o.d-o.sacrificialTabThickness,o.ow/2-o.crossWidth/2-x+.3,o.sacrificialTabWidth,o.sacrificialTabThickness);
   });
   frame.spec=union(frame.spec,parked,tabs);frame.includesBreakawayStand=true;
   parts.push({name:'Breakaway_Easel_Replacement',type:'foot',spec:local,displaySpec:borderlessStandDisplay(o,borderlessStandLocal(o,'seated')),displayOffset:[0,0,0],bundledIn:frame.name,printFace:'flat side on bed',standType:'breakaway'});
  }
  parts.push(...panelParts(o));
  return {params:o,parts,panel:box(o.b-o.ov,o.b-o.ov,o.front,o.w,o.h,o.t)};
 }
 function borderlessRetainerTest(o){
  // A closed perimeter is essential here. A one-edge coupon does not test
  // the coupled flexibility of a rectangular retaining border.
  const w=80,h=80,W=clean(w+2*(o.q+o.pc)),H=clean(h+2*(o.q+o.pc));
  const q={...o,w,h,ow:W,oh:H,hangerLocations:[],frameConnectors:[],includeStand:false};
  q.frontRetention={...o.frontRetention,rearFlexureWindows:borderlessFlexureWindows(q)};
  q.frontRetention.rearFlexureCount=q.frontRetention.rearFlexureWindows.length;
  return [{name:'Front_Snap_Continuous_Border_Test',type:'test',testGroup:'front_snap',testRole:'retainer',
    couponPanelSize_mm:[w,h,o.t],spec:borderlessBody(q),printFlip:true,printFace:'rear face on bed'},
   {name:'Front_Snap_Panel_Gauge',type:'test',testGroup:'front_snap',testRole:'gauge',
    couponPanelSize_mm:[w,h,o.t],spec:box(0,0,0,w,h,o.t),printFace:'flat face on bed'}];
 }
 function borderlessJointTests(o){
  if(!o.frameJointCount)return [];
  const rear=o.d-o.backThickness,H=o.backThickness;
  const a=union(box(-24,-6,rear,24,12,H),shift(male(o,[0,0],'x',H),0,0,rear));
  const b=cut(box(0,-6,rear,28,12,H),shift(female(o,[0,0],'x',H),0,0,rear));
  return [{name:'Front_Snap_Rear_Joint_Male',type:'test',testGroup:'frame_joint',testRole:'male',spec:a,printFlip:true},
   {name:'Front_Snap_Rear_Joint_Socket',type:'test',testGroup:'frame_joint',testRole:'socket',spec:b,printFlip:true}];
 }
 function borderlessStandTest(o){
  if(!o.includeStand)return [];
  const k=o.standMountHeight;
  const coupon=cut(box(o.ow/2-9,k-14,o.d-o.hangerThickness,18,36,o.hangerThickness),
   borderlessHanger(o,{at:[o.ow/2,k],angle:180}));
  return [{name:'Front_Snap_Shared_Keyhole_Test',type:'test',testGroup:'stand_mount',testRole:'socket',spec:coupon,printFlip:true},
   {name:'Front_Snap_Shared_Easel_Test',type:'test',testGroup:'stand_mount',testRole:'support',spec:borderlessStandLocal(o),printFace:'flat side on bed'}];
 }
 function borderlessTests(o,mode='all'){
  const parts=mode==='border_stand'?[...borderlessRetainerTest(o),...borderlessStandTest(o)]:mode==='joints'?borderlessJointTests(o):mode==='stand'?borderlessStandTest(o):[...borderlessJointTests(o),...borderlessRetainerTest(o),...(mode==='all'?borderlessStandTest(o):[])];
  return {params:o,parts,testSelection:{mode:'front_snap_'+mode,frameJointTypes:!['stand','border_stand'].includes(mode)&&o.frameJointCount?1:0,panelJointTypes:0,standType:['stand','all','border_stand'].includes(mode)?o.standType:'none',reusePanelAsThicknessGauge:false,partCount:parts.length}};
 }

 function gridCells(o,nx,ny){
  const out=[],w=o.ow/nx,h=o.oh/ny;
  for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){
   if(x>0&&x<nx-1&&y>0&&y<ny-1)continue;
   const a={x:x*w,y:y*h,w,h,col:x,row:y,nx,ny};
   if(nx===1&&ny>2&&y>0&&y<ny-1){out.push({...a,w:o.b,side:'left'},{...a,x:o.ow-o.b,w:o.b,side:'right'});}
   else if(ny===1&&nx>2&&x>0&&x<nx-1){out.push({...a,h:o.b,side:'bottom'},{...a,y:o.oh-o.b,h:o.b,side:'top'});}
   else out.push(a);
  }
  for(let c of out){let top=c.row<ny-1,right=c.col<nx-1;
   c.dx=c.w+(right?o.j:0);c.dy=c.h+(top?o.j:0);
   if(c.side==='left'||c.side==='right')c.dx=c.w;
   if(c.side==='top'||c.side==='bottom')c.dy=c.h;
  }
  return out;
 }
 function chooseLayout(o){
  const candidates=[];
  for(let nx=1;nx<=12;nx++)for(let ny=1;ny<=12;ny++){
   const count=nx*ny;
   if(o.sectionMode!=='auto'&&count!==Number(o.sectionMode))continue;
   if(o.sectionMode==='4'&&(nx!==2||ny!==2))continue;
   if(o.sectionMode==='2'&&o.twoPartDirection==='horizontal'&&ny!==2)continue;
   if(o.sectionMode==='2'&&o.twoPartDirection==='vertical'&&nx!==2)continue;
   const cells=gridCells(o,nx,ny);
   if(cells.some(c=>bedRotation(c.dx,c.dy,o)===null||Math.min(c.w,c.h)<Math.min(40,o.b)))continue;
   candidates.push({nx,ny,cells,score:cells.length*1e6+Math.max(...cells.map(c=>Math.max(c.dx,c.dy)))*100+(o.closedFront&&nx>1?20000:0)+Math.abs(nx-ny)});
  }
  if(!candidates.length){
   if(o.sectionMode!=='auto')throw Error('The requested '+o.sectionMode+'-section frame cannot fit this bed with the current frame geometry. Increase the usable bed, change the two-part direction, or select Automatic. Parts are never scaled or silently divided differently.');
   throw Error('No supported flat-print frame layout fits these dimensions and protected bed area.');
  }
  candidates.sort((a,b)=>a.score-b.score);return candidates[0];
 }
 // XY rotations keep front-face-down support-free printing. No diagonal packing.
 function bedRotation(x,y,o){
  if(o.sectionSafety&&typeof FrameBedSafety!=='undefined'){
   return FrameBedSafety.envelopePosition(x,y,o,o.sectionSafety)?.angle??null;
  }
  if(x<=o.usableX+1e-6&&y<=o.usableY+1e-6)return 0;
  if(y<=o.usableX+1e-6&&x<=o.usableY+1e-6)return 90;
  return null;
 }
 // V3.37 split UV panels use three connection zones per seam.
 // Two long structural post arms sit at the seam ends. At the outside perimeter
 // they start exactly at the panel edge; at internal grid intersections they are
 // moved inward only enough to avoid colliding with an orthogonal seam joint.
 // Stronger split panel: longer outer-edge locking rails and deeper captured center tongue.
 // Only the posts on the true outside perimeter have locking hooks: they can
 // flex outward into free space. Internal grid posts remain solid alignment
 // rails. The perimeter locks retain the joined rows/columns as a whole.
 // A continuous captured seam aligns the faces and backs the butt seam.
 // The selected finished thickness is authoritative and is never changed.
 function panelConnectorLayout(l,o){
  const result=[],w=o.w/l.nx,h=o.h/l.ny,d=panelRailDetails({H:o.t,g:o.panelJoint,grip:o.panelGrip,centerGap:o.panelCenterClearance,postLength:o.panelPostLength});
  const internalInset=24.0; // Keep the interior crossover posts clear of orthogonal seams; only perimeter posts are long.
  const pushSeam=(axis,seam,row,col,start,end)=>{
   const outerStart=axis==='x'?row===0:col===0;
   const outerEnd=axis==='x'?row===l.ny-1:col===l.nx-1;
   const a0=start+(outerStart?0:internalInset),a1=end-(outerEnd?0:internalInset),mid=(start+end)/2;
   if(axis==='x'){
    result.push({x:seam,y:clean(a0),axis,at:[seam,clean(a0)],role:'edge_start',sideSign:1,lockingPost:outerStart,assemblyStage:'slide_then_edge_hooks_lock'});
    result.push({x:seam,y:clean(mid),axis,at:[seam,clean(mid)],role:'center',seamLength:end-start,sideSign:0,lockingPost:false,assemblyStage:'slide_then_edge_hooks_lock'});
    result.push({x:seam,y:clean(a1),axis,at:[seam,clean(a1)],role:'edge_end',sideSign:-1,lockingPost:outerEnd,assemblyStage:'slide_then_edge_hooks_lock'});
   }else{
    result.push({x:clean(a0),y:seam,axis,at:[clean(a0),seam],role:'edge_start',sideSign:-1,lockingPost:outerStart,assemblyStage:'slide_then_edge_hooks_lock'});
    result.push({x:clean(mid),y:seam,axis,at:[clean(mid),seam],role:'center',seamLength:end-start,sideSign:0,lockingPost:false,assemblyStage:'slide_then_edge_hooks_lock'});
    result.push({x:clean(a1),y:seam,axis,at:[clean(a1),seam],role:'edge_end',sideSign:1,lockingPost:outerEnd,assemblyStage:'slide_then_edge_hooks_lock'});
   }
  };
  for(let row=0;row<l.ny;row++)for(let col=1;col<l.nx;col++)pushSeam('x',clean(col*w),row,col,clean(row*h),clean((row+1)*h));
  for(let row=1;row<l.ny;row++)for(let col=0;col<l.nx;col++)pushSeam('y',clean(row*h),row,col,clean(col*w),clean((col+1)*w));
  return result;
 }
 function choosePanelLayout(o){
  const candidates=[];
  for(let nx=1;nx<=16;nx++)for(let ny=1;ny<=16;ny++){
   if(nx*ny>64||(o.panelSplit==='single'&&nx*ny!==1))continue;
   if(nx*ny>1&&o.t<PANEL_SPLIT_MIN_T-1e-8)continue;
   const w=o.w/nx,h=o.h/ny,cells=[];
   if(nx*ny>1&&(w<72||h<72))continue;
   if(nx>1&&w<o.panelPostLength+10-1e-7)continue;
   if(ny>1&&h<o.panelPostLength+10-1e-7)continue;
   const pd=panelRailDetails({H:o.t,g:o.panelJoint,grip:o.panelGrip,centerGap:o.panelCenterClearance,postLength:o.panelPostLength});
   // Preserve the minimum web between the widened center socket and the
   // nearest rounded post-root socket, including their independent gaps.
   const innerInset=24.0;
   const halfReserve=innerInset+pd.edgeRailWidth+pd.rootCornerRadius+pd.g+pd.minWall;
   if(nx>1&&ny>1&&(w<2*halfReserve||h<2*halfReserve))continue;
   for(let row=0;row<ny;row++)for(let col=0;col<nx;col++)cells.push({x:col*w,y:row*h,w,h,col,row,nx,ny,dx:w+(col<nx-1?pd.edgePostLength:0),dy:h+(row<ny-1?pd.edgePostLength:0)});
   if(cells.some(c=>bedRotation(c.dx,c.dy,o)===null))continue;
   const seams=ny*(nx-1)+nx*(ny-1),jointCount=seams*3;
   candidates.push({nx,ny,cells,jointCount,score:nx*ny*1e6+jointCount*2500+Math.max(...cells.map(c=>Math.max(c.dx,c.dy)))*10+Math.abs(nx-ny)});
  }
  if(!candidates.length)return {nx:0,ny:0,cells:[],error:o.panelSplit==='single'?'The one-piece panel does not fit the usable bed. Enlarge the bed, reduce the panel size, or allow sections.':o.t<PANEL_SPLIT_MIN_T?'A split generated panel needs at least '+PANEL_SPLIT_MIN_T.toFixed(1)+' mm finished thickness for the integral edge-post joints. The selected thickness is never changed automatically.':'No supported rectangular panel layout fits the usable bed.'};
  candidates.sort((a,b)=>a.score-b.score);return candidates[0];
 }
 function shift(s,x,y,z){
  if(s.op==='transform'){let m=[...s.matrix];m[3]+=x;m[7]+=y;m[11]+=z;return {...s,matrix:m};}
  if(s.op==='box')return {...s,min:s.min.map((v,i)=>v+[x,y,z][i])};
  if(s.op==='prism'){
   const offset=s.axis==='x'?[y,z]:s.axis==='y'?[x,z]:[x,y],v=s.axis==='x'?x:s.axis==='y'?y:z;
   return {...s,start:s.start+v,points:s.points.map(p=>p.map((a,i)=>a+offset[i]))};
  }
  if(s.op==='cylinder'||s.op==='curve_prism')return {op:'transform',base:s,matrix:[1,0,0,x,0,1,0,y,0,0,1,z,0,0,0,1]};
  if(s.op==='loft')return {...s,z0:s.z0+z,z1:s.z1+z,points0:s.points0.map(p=>[p[0]+x,p[1]+y]),points1:s.points1.map(p=>[p[0]+x,p[1]+y])};
  if(s.op==='cut')return {...s,base:shift(s.base,x,y,z),items:s.items.map(a=>shift(a,x,y,z))};
  return {...s,items:s.items.map(a=>shift(a,x,y,z))};
 }
 // Press-lock joint: the receiver is a solid, backed socket. Controlled
 // deflection occurs in an integral MALE tongue, never in a female post.
 // Insert normal to the face from the back. Its ramp bends the male tongue
 // toward the seam; the square upper hook face captures a supported ledge.
 // The rear blind U relief preserves the unbroken artwork-side skin.
 function jointDetails({H,width,g,L=14}){
  const head=Math.max(1.6,width/2-2.0),neck=head*.82,flare=.08;
  const skin=Math.min(.70,H*.22),post=H>=6?.85:H>=4?.60:.45;
  const bite=H>=6?.65:H>=4?.42:.25;
  const cap=H>=6?1.25:H>=4?.90:.64;
  const lockZ=H-cap-.06,half=Math.max(.80,Math.min(3.3,head-.62));
  return {H,width,g,L,head,neck,flare,skin,post,bite,cap,lockZ,half,
   engagement:Math.max(0,bite-g),deflection:Math.max(0,bite-g+.03),
   relief:Math.max(.85,bite+.25),shoulderGap:.06,
   socketBridge:Math.max(0,bite+.08-g),femaleSideWall:width/2-head-flare-g};
 }
 function integralJoint(args,variant='male'){
  const {at,axis,H,width,g,grip,L=14}=args;
  const d=jointDetails(args),{head,neck,flare,skin,post,bite,cap,lockZ,half,relief}=d;
  const place=p=>transform2(p,at,axis);
  const matrix=axis==='x'?[1,0,0,at[0],0,1,0,at[1],0,0,1,0,0,0,0,1]:[0,-1,0,at[0],1,0,0,at[1],0,0,1,0,0,0,0,1];
  const xz=(pts,halfWidth)=>({op:'transform',base:prism(pts,-halfWidth,2*halfWidth,'y'),matrix});
  const rect=(x0,x1,y0,y1,z,height)=>prism(place([[x0,y0],[x1,y0],[x1,y1],[x0,y1]]),z,height);
  function profile(e=0,tip=0){return place([[-.50,-neck-e],[4,-neck-e],[4,-head+.35-e],[4.35,-head-e],[L-.6+tip,-head-e],[L+tip,-head+.6-e],[L+tip,head-.6+e],[L-.6+tip,head+e],[4.35,head+e],[4,head-.35+e],[4,neck+e],[-.50,neck+e]]);}
  const za=.45,zb=Math.max(za+.2,H-.75);
  // The front footprint is complementary. Behind it, running clearance is
  // separate from the localized compression ribs and from hook engagement.
  let body=profileStack([profile(0,-.30),profile(0,0),profile(flare,0),profile(flare,0)],[0,za,zb,H]);
  const reliefWell=union(
   rect(L-post-relief,L-post,-half-.50,half+.50,skin,H-skin+.05),
   rect(L-post-.03,L+.20,-half-.50,-half,skin,H-skin+.05),
   rect(L-post-.03,L+.20,half,half+.50,skin,H-skin+.05)
  );
  body=cut(body,reliefWell);
  // Ramp is self-supporting. The flat upper shoulder is deliberately NOT
  // another withdrawal ramp. A generous female end wall carries the stop.
  const zStart=lockZ-bite-.28;
  const hook=xz([[L-.10,zStart],[L,zStart],[L+bite,lockZ-.18],[L+bite,lockZ],[L-.10,lockZ]],half);
  const core=union(body,hook),ribs=[];
  for(const u of [6.3,L-3.3])for(const sign of [-1,1]){
   const rp=(z,extra)=>{const e=flare*Math.max(0,Math.min(1,(z-za)/(zb-za)));return place([[u-.75,sign*(head+e-.14)],[u,sign*(head+e+extra)],[u+.75,sign*(head+e-.14)],[u,sign*(head+e-.22)]]);};
   const z0=Math.min(.65,H*.22),rise=Math.max(.35,g+grip+.06),z1=z0+rise,z2=Math.max(z1+.1,H-.95),z3=H-.25;
   if(grip>0)ribs.push(profileStack([rp(z0,0),rp(z1,g+grip),rp(z2,g+grip),rp(z3,0)],[z0,z1,z2,z3]));
  }
  if(variant==='maleCore')return core;
  if(variant==='ribs')return union(ribs);
  if(variant==='male')return union(core,ribs);
  if(variant==='well')return reliefWell;
  if(variant==='hook')return hook;
  let socket=profileStack([profile(0,-.30),profile(0,-.30),profile(g,g),profile(flare+g,g),profile(flare+g,g)],[-.025,0,za,zb,H+.04]);
  // Blind receiving cavity. No isolated female tongue, thin post, or loose key.
  // Its flat roof is a short local print ledge (max 0.69 mm), not a long bridge.
  // The rest of the lip is continuous with the full rail/tile end wall.
  const pocket=xz([[L-.08,zStart-.10],[L+bite+.08,zStart-.10],[L+bite+.08,lockZ+.06],[L-.08,lockZ+.06]],half+.12);
  if(variant==='socket')return union(socket,pocket);
  if(variant==='tooth')return union([]); // retained API, but no added female flexure
  if(variant==='capturePocket')return pocket;
  throw Error('Unknown press-lock joint geometry.');
 }
 // Blind-front frame joint. The receiver keeps a continuous front floor.
 // A rising underside and a raked male spring grow from the rail during
 // face-down printing; the head is not a floating horizontal shelf.
 // UV tiles use the same closed-floor principle, through blindPanelJoint.
 function blindFrameDetails({H,width,g,L:requested=18,rampClearance=.40,baseRelief=.25}){
  const projectionFloor=H>=6?1.0:H>=4?.8:.6,floor=Math.max(.8,projectionFloor),underClear=rampClearance,rampSlope=1;
  const flare=.05,socketSideWall=2.0,head=Math.max(1.55,width/2-socketSideWall-flare-g),neck=head*.80;
  const post=H>=6?1.40:.80;
  const bite=H>=6?.45:H>=4?.34:.28,cap=H>=6?1.25:.90;
  // Keep the full head projection independent of underside clearance.
  // A 45-degree ramp preserves both projection and the front socket floor
  // at the selected frame depth. The hook remains backed by the spring.
  const L=clean(Math.min(requested,Math.max(.85,H-projectionFloor-cap-bite-1.10)));
  const lockZ=H-cap-.06,half=Math.max(.65,Math.min(2.5,head-1.20));
  const rootZ=floor+.30,relief=Math.max(.90,bite+.30),sideGap=.40;
  const baseReliefRun=clean(Math.min(2,L*.80)),baseReliefFull=clean(baseReliefRun*.45);
  return {H,width,g,L,requested,head,neck,flare,floor,underClear,rampSlope,baseRelief,baseReliefRun,baseReliefFull,post,bite,cap,lockZ,half,rootZ,relief,sideGap,
   engagement:Math.max(0,bite-g),deflection:Math.max(0,bite-g+.03),
   shoulderGap:.12,socketBridge:Math.max(0,bite+.16-g),
   femaleSideWall:width/2-head-flare-g,frontFloor_mm:floor,baseRelief_mm:baseRelief,
   tipDepth_mm:clean(H-floor-underClear-rampSlope*L),undersideVerticalClearance_mm:underClear,undersideNormalClearance_mm:underClear/Math.sqrt(1+rampSlope*rampSlope),minimumGrip:.0};
 }
 function blindFrameJoint(args,variant='male'){
  const {at,axis,H,width,g,grip=0,printTune=false,sideGapOverride=null,panelRobust=false}=args,d=panelRobust?blindPanelDetails(args):blindFrameDetails(args);
  const openingHeight=Math.max(H,args.openingHeight||H);
  const panelTune=printTune==='panel',tuned=!!printTune;
  const {L,head,neck,flare,floor,underClear,post,bite,cap,lockZ,half,rootZ,relief}=d,rampSlope=d.rampSlope||1;
  const sideGap=Number.isFinite(sideGapOverride)?sideGapOverride:d.sideGap;
  const place=p=>transform2(p,at,axis);
  const matrix=axis==='x'?[1,0,0,at[0],0,1,0,at[1],0,0,1,0,0,0,0,1]:[0,-1,0,at[0],1,0,0,at[1],0,0,1,0,0,0,0,1];
  const xz=(p,hw=width+3)=>({op:'transform',base:prism(p,-hw,2*hw,'y'),matrix});
  const rect=(a,b,c,e)=>place([[a,c],[b,c],[b,e],[a,e]]);
  const R=floor+post+relief+2,a=floor+underClear,s=L*.20,c=Math.min(.30,L*.18);
  function profile(e=0){return place([[-R,-neck-e],[s,-neck-e],[s,-head+c-e],[s+c,-head-e],[L-c,-head-e],[L,-head+c-e],[L,head-c+e],[L-c,head+e],[s+c,head+e],[s,head-c+e],[s,neck+e],[-R,neck+e]]);}
  const za=floor+.25,zb=H-.60;
  const aboveRamp=(z0)=>xz([[-R,z0-rampSlope*R],[L+2,z0+rampSlope*(L+2)],[L+2,H+5],[-R,H+5]]);
  // Matching ramps rise 1 mm per mm of projection.
  // The underside gap is independent of XY running clearance and grip ribs.
  // Widen the head gradually in XY so the first overhanging layers grow
  // from the rail, and retain a supported connection beneath the hook.
  function printProfile(e=0){
   const grow=Math.max(.80,head-neck+.20),x2=Math.min(L-c,s+grow);
   // Thin UV heads can use the full available ramp length, making x2 and
   // L-c coincide. Remove coincident vertices rather than changing the
   // structural outline or the final mating dimensions.
   const pts=[[-R,-neck-e],[s,-neck-e],[x2,-head-e],[L-c,-head-e],[L,-head+c-e],[L,head-c+e],[L-c,head+e],[x2,head+e],[s,neck+e],[-R,neck+e]];
   const cleanPts=pts.filter((p,i,a)=>!i||Math.abs(p[0]-a[i-1][0])>1e-7||Math.abs(p[1]-a[i-1][1])>1e-7);
   return place(cleanPts);
  }
  const panelTuneZ=Math.min(zb-.08,Math.max(za+.25,a+Math.min(L,.80)+.45));
  const tunedProfile=profileStack([printProfile(),printProfile(),printProfile(flare),printProfile(flare)],[0,za,zb,H]);
  const standardProfile=profileStack([profile(),profile(),profile(flare),profile(flare)],[0,za,zb,H]);
  const aboveZ=z0=>xz([[-R,z0],[L+2,z0],[L+2,H+5],[-R,H+5]]);
  // UV heads keep the print-tuned lower corner only near the underside, then
  // recover the original full-width mating shape above panelTuneZ. The small
  // overlap avoids a coplanar Boolean boundary while preserving the proven fit.
  const maleEnvelope=panelTune
   ?union(intersect(tunedProfile,aboveRamp(a)),intersect(standardProfile,aboveZ(panelTuneZ-.05)))
   :intersect(tuned?tunedProfile:standardProfile,aboveRamp(a));
  // Spring thickness is increased, with a 20% thicker root transition.
  // Its inner and side reliefs follow the rising underside, preserving
  // layer-to-layer support and an anchored root inside the owning section.
  const outer=z=>Math.min(L,(z-a)/rampSlope);
  const thick=z=>post*(1+(panelRobust?.25:.20)*Math.max(0,1-(z-rootZ)/1.20));
  const knots=[rootZ,rootZ+1.2,a+rampSlope*L,H+.06].filter(z=>z>=rootZ&&z<=H+.06).sort((x,y)=>x-y).filter((z,i,v)=>!i||z-v[i-1]>1e-6);
  const inner=knots.map(z=>rect(outer(z)-thick(z)-relief,outer(z)-thick(z),-half-sideGap,half+sideGap));
  const sides=[-1,1].map(sign=>knots.map(z=>rect(outer(z)-thick(z)-.025,L+bite+.25,sign<0?-half-sideGap:half,sign<0?-half:half+sideGap)));
  const reliefWell=union(profileStack(inner,knots),...sides.map(ps=>profileStack(ps,knots)));
  const body=cut(maleEnvelope,reliefWell),zStart=panelRobust?Math.max(lockZ-bite-.10,a+Math.max(.55,L-.15)):lockZ-bite-.28;
  const hook=xz([[L-.12,zStart],[L,zStart],[L+bite,lockZ-.18],[L+bite,lockZ],[L-.12,lockZ]],half);
  const core=union(body,hook),ribs=[];
  // Short heads may still be widening where the grip ribs start. Anchor
  // those ribs to the actual shoulder and grow them up to the socket wall.
  const shoulderEnd=Math.min(L-c,s+Math.max(.80,head-neck+.20));
  const shoulderWidth=x=>x<=s?neck:x<shoulderEnd?neck+(head-neck)*(x-s)/(shoulderEnd-s):x>L-c?head-(x-(L-c)):head;
  for(const u of [L*.48,L*.78])for(const sign of [-1,1]){
   const rx=Math.min(.45,L*.12),tapered=tuned&&!panelTune&&head-shoulderWidth(u)>.12;
   const ribWidth=x=>tapered?shoulderWidth(x):head;
   const baseZ=a+rampSlope*(u+rx)+.10,z0=panelTune?Math.max(baseZ,panelTuneZ+.06):baseZ,z1=z0+Math.max(.35,g+grip+.06+(tapered?head-ribWidth(u):0)),z2=Math.max(z1+.08,H-.65),z3=H-.18;
   const rp=(z,extra,atRoot=false)=>{const f=flare*Math.max(0,Math.min(1,(z-za)/(zb-za)));return place([[u-rx,sign*(ribWidth(u-rx)+f-.12)],[u,sign*((atRoot?ribWidth(u):head)+f+extra)],[u+rx,sign*(ribWidth(u+rx)+f-.12)],[u,sign*(ribWidth(u)+f-.20)]]);};
   if(grip>0&&z2<z3)ribs.push(profileStack([rp(z0,0,true),rp(z1,g+grip),rp(z2,g+grip),rp(z3,0,true)],[z0,z1,z2,z3]));
  }
  if(variant==='maleCore')return core;
  if(variant==='ribs')return union(ribs);
  if(variant==='male')return union(core,ribs);
  if(variant==='well'){
   if(openingHeight===H)return reliefWell;
   // Keep the spring accessible through any extra rear rail material.
   return union(reliefWell,profileStack([inner.at(-1),inner.at(-1)],[H,openingHeight+.06]),
    ...sides.map(ps=>profileStack([ps.at(-1),ps.at(-1)],[H,openingHeight+.06])));
  }
  if(variant==='hook')return hook;
  const socketEnvelope=profileStack([profile(g),profile(g),profile(flare+g),profile(flare+g)],[0,za,zb,openingHeight+.06]);
  // Small tip clearance is separate from the hook's positive engagement.
  const endClear=xz([[L-.15,0],[L+g,0],[L+g,openingHeight+.06],[L-.15,openingHeight+.06]],head-c+g);
  // Relieve only the bottom of the receiver near the seam. Its continuous
  // front floor and 2 mm sidewalls remain intact; the far end still locates
  // the head at the selected ramp clearance. The male length is unchanged.
  const baseRelief=d.baseRelief||0,baseRun=d.baseReliefRun||0,baseFull=d.baseReliefFull||0;
  const floorPoints=baseRelief>0?[[0,floor],[baseRelief,floor],[baseFull,floor+baseFull-baseRelief],[baseRun,floor+baseRun]]:[[0,floor]];
  const socketRamp=xz([[-R,floor-rampSlope*R],...floorPoints,[L+2,floor+rampSlope*(L+2)],[L+2,openingHeight+5],[-R,openingHeight+5]]);
  const socket=intersect(union(socketEnvelope,endClear),socketRamp);
  const pocket=xz([[L-.08,zStart-.16],[L+bite+.16,zStart-.16],[L+bite+.16,lockZ+d.shoulderGap],[L-.08,lockZ+d.shoulderGap]],half+.16);
  if(variant==='socket')return union(socket,pocket);
  if(variant==='tooth')return union([]);
  if(variant==='capturePocket')return pocket;
  if(variant==='frontFloor')return xz([[0,0],[L+bite+.10,0],[L+bite+.10,floor+rampSlope*(L+bite+.10)],...floorPoints.slice().reverse()],head);
  throw Error('Unknown blind-front frame joint variant.');
 }

 function frameIntegral(o,j,variant='male'){
  const width=j.axis==='x'&&j.at[1]>o.oh-o.b-.1&&!o.isLight?o.b:o.q;
  return blindFrameJoint({at:j.at,axis:j.axis,H:j.height,openingHeight:j.railHeight,width,g:o.kc,grip:o.jointGrip,L:o.jointLength,rampClearance:o.frameRampClearance,baseRelief:o.frameBaseRelief,printTune:'frame'},variant);
 }

 // V3.37: the posts provide both alignment and positive retention.
 // The 24 mm free cantilevers flex OUTWARD during insertion. Inward-facing
 // square hook shoulders then catch the receiver's continuous wall. There is
 // no slit through the post and no bonded-to-skin pseudo-spring. Hooks exist
 // only at the true outside perimeter, where outward spring travel is free.
 // Their entire bed-facing footprint is supported from z=0. The captured
 // inward flange grows at 45 degrees; neither face exceeds the chosen H.
 // Both UV faces remain on the bed. V3.28 hook and channel fit is unchanged.
 // Male post roots use 1.50 mm XY rounds; receivers use 1.70 mm rounds.
 // The full seam is captured above and below, with locally relieved entrances.
 function panelRailDetails({H,g=.12,grip=.08,centerGap=.08,postLength=56}){
  const minWall=.8,frontSkin=.8,rearLedge=.8;
  if(H<3-1e-8)return {H,g,grip,minWall,frontSkin,rearLedge,error:'Split locking-post joints require at least 3.0 mm finished thickness.'};
  const edgePostLength=postLength,edgeRootDepth=8.0,edgeWeb=2.4,edgeFlange=.8,edgeRailWidth=edgeWeb+edgeFlange;
  const flangeZ0=.8,flangeZ1=H-.8;
  const edgeHookProjection=.8+Math.max(0,Math.min(grip,.12));
  const hookShoulder=edgePostLength-4.0,hookCrestEnd=edgePostLength-3.2,hookAxialClear=.12;
  const hookEngagement=edgeHookProjection-g;
  const rootCornerRadius=1.50,rootCornerSegments=24;
  // A continuous captured bevel replaces the discrete center spring and guides.
  // Clearances and radii are not thin solid features. The blunt lip is >=0.4 mm.
  const seamProjection=.70,seamRootDepth=.80,seamRootBevel=.04,seamNoseBevel=.04;
  const seamLow=H/2-.50,seamHigh=H/2+.46,seamTopSlope=.20;
  const seamClearance=centerGap,seamSocketDepth=.95,seamMouthRelief=.08;
  // Tighten only the locating section; retain the V3.36 root-mouth envelope.
  const seamMouthClearance=Math.max(.20,seamClearance+seamMouthRelief);
  const femaleRootCornerRadius=1.70,seamMinimumTip=.40;
  return {H,g,grip,minWall,frontSkin,rearLedge,edgePostLength,edgeRootDepth,edgeWeb,edgeFlange,edgeRailWidth,flangeZ0,flangeZ1,
   edgeHookProjection,hookShoulder,hookCrestEnd,hookAxialClear,hookEngagement,rootCornerRadius,rootCornerSegments,femaleRootCornerRadius,
   seamProjection,seamRootDepth,seamRootBevel,seamNoseBevel,seamLow,seamHigh,seamTopSlope,seamClearance,seamSocketDepth,seamMouthRelief,seamMouthClearance,seamMinimumTip,
   frontFloor_mm:frontSkin,minimumStructuralWidth_mm:minWall,minimumWallTarget_mm:minWall,
   flexibleArmWidth_mm:edgeWeb,stationLength_mm:edgePostLength,railProjection_mm:edgePostLength,edgePostWidth_mm:edgeRailWidth,
   hookProjection_mm:edgeHookProjection,positiveEngagement_mm:hookEngagement,nominalAxialPlay_mm:hookAxialClear,
   lockLocation:'true perimeter edge posts',lockStyle:'inward hook with square withdrawal shoulder',
   centerRole:'continuous captured bevel and light-blocking overlap; no spring preload',
   assemblyMotion:'join tiles into full rows first, then slide complete rows together with UV faces coplanar until both outside hooks seat',
   edgePostSystem:true,frontSeamShape:'nominal zero-gap butt seam backed by continuous captured overlap',rearSurface:'flat closed back',
   lockingGeometryBaseline:'V3.51.5 long outer rails and deep captured center tongue',
   rootCornerRadius_mm:rootCornerRadius,femaleRootCornerRadius_mm:femaleRootCornerRadius,
   rootCornerTreatment:'1.50 mm male and 1.70 mm receiver rounds, with 0.20 mm receiver-root setback and existing straight-land clearance',postTipClearance_mm:g+.10,
   seamProjection_mm:seamProjection,seamMinimumTip_mm:seamMinimumTip,seamSocketDepth_mm:seamSocketDepth,
   tongueClearancePerFace_mm:seamClearance,seamMouthClearance_mm:seamMouthClearance,seamVerticalClearance_mm:seamClearance,seamLowerNormalClearance_mm:seamClearance/Math.SQRT2,
   seamUpperNormalClearance_mm:seamClearance/Math.sqrt(1+seamTopSlope*seamTopSlope),
   seamMinimumSkin_mm:.8,seamFullLength:true,seamSpring:false,seamCornerExtraRelief_mm:seamMouthRelief,
   seamPhysicalFitVerified:false,printOrientation:'all UV faces directly on PEI bed',sidePostsConcealed:false,
   printNozzle_mm:.40,printLayer_mm:.20,noSeparateConnectors:true,requiredSplitThickness_mm:PANEL_SPLIT_MIN_T};
 }

 function panelRailMatrix(c){
  const at=c.at||[c.x,c.y];
  return c.axis==='x'?[1,0,0,at[0],0,1,0,at[1],0,0,1,0,0,0,0,1]:[0,-1,0,at[0],1,0,0,at[1],0,0,1,0,0,0,0,1];
 }
 function panelLocalPrism(c,points,start,length,axis='x'){
  return {op:'transform',base:prism(points,start,length,axis),matrix:panelRailMatrix(c)};
 }
 function panelLocalBox(c,x,y,z,dx,dy,dz){return {op:'transform',base:box(x,y,z,dx,dy,dz),matrix:panelRailMatrix(c)};}
 function edgePostSection(d,sign,clear=0,hook=0,extraInward=0){
  const web=d.edgeWeb+hook+extraInward,wide=d.edgeRailWidth+hook+extraInward;
  const pts=[[-clear,-clear],[web+clear,-clear],[wide+clear,d.flangeZ0-clear],[wide+clear,d.flangeZ1+clear],[web+clear,d.H+clear],[-clear,d.H+clear]];
  const out=pts.map(([y,z])=>[y*sign,z]);return sign<0?out.reverse():out;
 }
 function panelAxialLoft(c,p0,x0,p1,x1){
  // Map a Z loft's (u,v,z) coordinates to local (x,y,z)=(z,u,v).
  const axial={op:'transform',base:loft(p0,x0,p1,x1),matrix:[0,0,1,0,1,0,0,0,0,1,0,0,0,0,0,1]};
  return {op:'transform',base:axial,matrix:panelRailMatrix(c)};
 }
 function roundedPostPlan(d,sign,width,outside,start,end,R=d.rootCornerRadius){
  // A tangent quarter-circle relieves the post root. The opposing receiver
  // uses a larger round, with extra clearance concentrated at the root.
  const bevel=.12,rootShift=R>d.rootCornerRadius?.20:0,pts=[[start,outside],[end-bevel,outside],[end,outside+bevel],[end,width-bevel],[end-bevel,width],[R+rootShift,width]];
  for(let i=1;i<=d.rootCornerSegments;i++){
   const a=-Math.PI/2-i*Math.PI/(2*d.rootCornerSegments);
   pts.push([clean(rootShift+R+R*Math.cos(a)),clean(width+R+R*Math.sin(a))]);
  }
  pts.push([start,width+R]);
  const out=pts.map(([x,y])=>[x,y*sign]);return sign<0?out.reverse():out;
 }
 function roundedEdgeRail(d,c,clear,start,end){
  const sign=c.sideSign||1;
  const low=roundedPostPlan(d,sign,d.edgeWeb+clear,-clear,start,end,clear?d.femaleRootCornerRadius:d.rootCornerRadius);
  const wide=roundedPostPlan(d,sign,d.edgeRailWidth+clear,-clear,start,end,clear?d.femaleRootCornerRadius:d.rootCornerRadius);
  // Retain the original 45-degree flange in Z, including its exact running
  // clearances. Rounding is in XY only; every UV face stays directly on PEI.
  return {op:'transform',base:profileStack([low,wide,wide,low],
   [-clear,d.flangeZ0-clear,d.flangeZ1+clear,d.H+clear]),matrix:panelRailMatrix(c)};
 }
 function panelEdgePostMale(o,c){
  const d=panelRailDetails({H:o.t,g:o.panelJoint,grip:o.panelGrip,centerGap:o.panelCenterClearance,postLength:o.panelPostLength}),sign=c.sideSign||1;
  const plain=edgePostSection(d,sign),rail=roundedEdgeRail(d,c,0,-d.edgeRootDepth,d.edgePostLength);
  if(!c.lockingPost)return rail;
  const hook=edgePostSection(d,sign,0,d.edgeHookProjection);
  return union(rail,panelLocalPrism(c,hook,d.hookShoulder,d.hookCrestEnd-d.hookShoulder,'x'),
   panelAxialLoft(c,hook,d.hookCrestEnd,plain,d.edgePostLength));
 }
 function panelEdgePostSocket(o,c){
  const d=panelRailDetails({H:o.t,g:o.panelJoint,grip:o.panelGrip,centerGap:o.panelCenterClearance,postLength:o.panelPostLength}),sign=c.sideSign||1;
  const plain=edgePostSection(d,sign,d.g),end=d.edgePostLength+d.g+.10;
  // The larger female root radius adds clearance locally. Straight bearing
  // lands, hook shoulders, axial play and tip depth preserve the established fit.
  const channel=roundedEdgeRail(d,c,d.g,-.05,end);
  if(!c.lockingPost)return channel;
  const hook=edgePostSection(d,sign,d.g,d.edgeHookProjection),start=d.hookShoulder-d.hookAxialClear,crest=d.hookCrestEnd+d.g;
  // The pocket starts behind a solid retaining shoulder, not at the seam mouth.
  return union(channel,panelLocalPrism(c,hook,start,crest-start,'x'),panelAxialLoft(c,hook,crest,plain,end));
 }
 // Bevel both opposing section corners without fine circular tessellation.
 function bevelSection(points,radii){
  const out=[];
  for(let i=0;i<points.length;i++){
   const p=points[i],a=points[(i+points.length-1)%points.length],b=points[(i+1)%points.length],r=radii[i]||0;
   if(!r){out.push(p);continue;}
   const u=[a[0]-p[0],a[1]-p[1]],v=[b[0]-p[0],b[1]-p[1]],lu=Math.hypot(...u),lv=Math.hypot(...v),d=Math.min(r,lu*.4,lv*.4);
   out.push([clean(p[0]+d*u[0]/lu),clean(p[1]+d*u[1]/lu)],[clean(p[0]+d*v[0]/lv),clean(p[1]+d*v[1]/lv)]);
  }return out;
 }
 function panelSeamSection(d,socket=false){
  const lo=d.seamLow,hi=d.seamHigh,p=d.seamProjection,b=d.seamNoseBevel,g=d.seamClearance;
  if(!socket){
   // Include the panel body at the root so the concave bevels remain material.
   const q=[[-d.seamRootDepth,0],[0,0],[0,lo],[p-b,lo+p-b],[p,lo+p+b],
    [p,hi-.2*p-b],[p-b,hi-.2*(p-b)],[0,hi],[0,d.H],[-d.seamRootDepth,d.H]];
   return bevelSection(q,[0,0,d.seamRootBevel,0,0,0,0,d.seamRootBevel,0,0]);
  }
  // Extra mouth and end space removes potential print bulges behind the face.
  // The .8 mm skins are never reduced, even at the maximum clearance setting.
  const floor=Math.max(.8,lo-d.seamMouthClearance),roof=Math.min(d.H-.8,hi+d.seamMouthClearance),x=.24,end=d.seamSocketDepth;
  const q=[[-.10,floor],[0,floor],[x,lo+x-g],[end,lo+x-g],[end,hi-.2*x+g],[x,hi-.2*x+g],[0,roof],[-.10,roof]];
  return bevelSection(q,[0,.04,.04,.04,.04,.04,.04,0]);
 }
 function panelContinuousSeam(o,c,socket=false,pad=0){
  const d=panelRailDetails({H:o.t,g:o.panelJoint,grip:o.panelGrip,centerGap:o.panelCenterClearance,postLength:o.panelPostLength}),len=c.seamLength;
  if(!Number.isFinite(len)||len<=0)throw Error('Continuous seam needs its actual tile span.');
  const extra=socket?d.seamSocketDepth+.4:pad;
  return panelLocalPrism(c,panelSeamSection(d,socket),-len/2-extra,len+2*extra,'y');
 }
 function panelSeamCrossCorner(o,males){
  const x=males.find(c=>c.role==='center'&&c.axis==='x'),y=males.find(c=>c.role==='center'&&c.axis==='y');
  if(!x||!y)return [];
  // Intersection of both extruded profiles owns the diagonal corner of a grid.
  // Female cuts extend across this patch, making all four cells complementary.
  const d=panelRailDetails({H:o.t,g:o.panelJoint,grip:o.panelGrip,centerGap:o.panelCenterClearance,postLength:o.panelPostLength});
  return [intersect(panelContinuousSeam(o,x,false,d.seamProjection),panelContinuousSeam(o,y,false,d.seamProjection))];
 }
 function panelRailMale(o,c){return c.role==='center'?panelContinuousSeam(o,c):panelEdgePostMale(o,c);}
 function panelRailSocket(o,c){return c.role==='center'?panelContinuousSeam(o,c,true):panelEdgePostSocket(o,c);}
 function panelCellJoints(o,c){
  const out=[];
  for(const j of o.panelConnectors){
   if(j.axis==='x'&&j.y>=c.y-1e-5&&j.y<=c.y+c.h+1e-5){
    if(Math.abs(j.x-c.x-c.w)<1e-5)out.push({...j,kind:'male'});
    if(Math.abs(j.x-c.x)<1e-5)out.push({...j,kind:'female'});
   }
   if(j.axis==='y'&&j.x>=c.x-1e-5&&j.x<=c.x+c.w+1e-5){
    if(Math.abs(j.y-c.y-c.h)<1e-5)out.push({...j,kind:'male'});
    if(Math.abs(j.y-c.y)<1e-5)out.push({...j,kind:'female'});
   }
  }return out;
 }
 function panelParts(o){
  if(!o.printedPanel||!o.panelCount)return [];
  const offset=o.b-o.ov,parts=[];
  for(const c of o.panelLayout.cells){
   const joints=panelCellJoints(o,c);let spec=box(c.x,c.y,0,c.w,c.h,o.t);
   const males=joints.filter(j=>j.kind==='male'),females=joints.filter(j=>j.kind==='female');
   if(males.length)spec=union(spec,males.map(j=>panelRailMale(o,j)),panelSeamCrossCorner(o,males));
   if(females.length)spec=cut(spec,females.map(j=>panelRailSocket(o,j)));
   parts.push({name:o.panelCount===1?'UV_Panel_One_Piece':'UV_Panel_R'+(c.row+1)+'_C'+(c.col+1),type:'panel',printFace:'UV face down on PEI',printFlip:false,uvPlaneZ:o.front,spec:shift(spec,offset,offset,o.front),cell:{...c,x:c.x+offset,y:c.y+offset},joints,frontSkin:o.panelCount>1?panelRailDetails({H:o.t,g:o.panelJoint,grip:o.panelGrip,centerGap:o.panelCenterClearance,postLength:o.panelPostLength}).frontSkin:o.t,faceGap:0,closedFront:true,frontAssemblyComplex:o.panelCount>1,frontOutline:o.panelCount>1?'assembled_flat_edge_post':'rectangular',frontRectangle:o.panelCount>1?null:{x:c.x+offset,y:c.y+offset,z:o.front,w:c.w,h:c.h}});
  }
  return parts;
 }
 function mmSkin(o){return o.panelJointCount?panelRailDetails({H:o.t,g:o.panelJoint,grip:o.panelGrip,centerGap:o.panelCenterClearance,postLength:o.panelPostLength}).frontSkin:o.t;}
 function panelFitTest(oInput){
  const o=derive(oInput),parts=[];
  if(o.printedPanel&&o.panelCount>1){
   const w=Math.max(105,o.panelPostLength+35),h=110,seam=0;
   const conns=[
    {x:seam,y:0,axis:'x',at:[seam,0],role:'edge_start',sideSign:1,lockingPost:true},
    {x:seam,y:h/2,axis:'x',at:[seam,h/2],role:'center',seamLength:h,sideSign:0},
    {x:seam,y:h,axis:'x',at:[seam,h],role:'edge_end',sideSign:-1,lockingPost:true}
   ];
   let male=box(-w,0,0,w,h,o.t),female=box(0,0,0,w,h,o.t);
   male=union(male,conns.map(c=>panelRailMale(o,c)));
   female=cut(female,conns.map(c=>panelRailSocket(o,c)));
   parts.push({name:'UV_Locking_Post_Test_Male_Tile',type:'test',testGroup:'uv_joint',testRole:'male',printFace:'UV face down on PEI',printFlip:false,uvPlaneZ:0,spec:male},
    {name:'UV_Locking_Post_Test_Female_Tile',type:'test',testGroup:'uv_joint',testRole:'female',printFace:'UV face down on PEI',printFlip:false,uvPlaneZ:0,spec:female});
  }
  return {params:o,parts,testSelection:{mode:'current_settings_only',scope:'uv_joint_only',frameJointTypes:0,panelJointTypes:parts.length?1:0,standType:'none',reusePanelAsThicknessGauge:false,partCount:parts.length}};
 }
 function octagon(cx,cy,rx,ry,c=.8){return [[cx-rx+c,cy-ry],[cx+rx-c,cy-ry],[cx+rx,cy-ry+c],[cx+rx,cy+ry-c],[cx+rx-c,cy+ry],[cx-rx+c,cy+ry],[cx-rx,cy+ry-c],[cx-rx,cy-ry+c]];}
 function loft(points0,z0,points1,z1){return {op:'loft',points0,points1,z0,z1};}
 function hanger(o,x){
  const r=o.hangerR,n=1.7,cy=o.oh-(o.dualMounts&&!o.isLight?26:22),sy=cy+4,lower=o.isLight?o.front+.2:o.d-5.2,z1=o.d-(r-n)-.6,z2=o.d-.6;
  const wide=octagon(x,sy,r,4+r,r*(2-Math.SQRT2)),narrow=octagon(x,sy,n,4+n,n*(2-Math.SQRT2));
  return union(prism(wide,lower,z1-lower),loft(wide,z1,narrow,z2),prism(narrow,z2,o.d-z2+.02),prism(octagon(x,cy,r,r,.7),lower,o.d-lower+.03));
 }
 function frameBody(o){
  if(o.isLight)return lightBody(o);
  const {ow:W,oh:H,b:B,q,d:D,zr,rl,front:F}=o;
  let front=cut(box(0,0,0,W,H,F),box(B,B,-.05,W-2*B,H-2*B,F+.1));
  let walls=union(box(0,0,0,q,H,D),box(W-q,0,0,q,H,D),box(0,0,0,W,q,D));
  // The panel enters across the TOP edge. There is deliberately no top rear wall.
  // Lower faces of the three rear channel lips are 45-degree ramps.
  const left=prism([[q-.02,zr],[q+rl,zr+rl+.02],[q+rl,D],[q-.02,D]],0,H,'y');
  const right=prism([[W-q+.02,zr],[W-q-rl,zr+rl+.02],[W-q-rl,D],[W-q+.02,D]],0,H,'y');
  const bottom=prism([[q-.02,zr],[q+rl,zr+rl+.02],[q+rl,D],[q-.02,D]],0,W,'x');
  return cut(union(front,walls,left,right,bottom),hangerCuts(o));
 }
 function transform2(points,at,axis){return points.map(([x,y])=>axis==='x'?[at[0]+x,at[1]+y]:[at[0]-y,at[1]+x]);}
 function profileStack(profiles,zs){
  return union(profiles.slice(0,-1).map((p,i)=>loft(p,zs[i],profiles[i+1],zs[i+1])));
 }
 function male(o,at,axis,height){
  const n=o.jn/2,s=o.jslot/2,h=n+o.jbarb,fl=o.jflange,rise=.8;
  function arm(add,sign){
   let p=[[-.8,-n-add],[10.4,-n-add],[10.4,-h-add],[12.0,-h-add],[14,-Math.max(s+.55,n-.5)-add],[14,-s],[1.1,-s],[1.1,0],[-.8,0]];
   if(sign>0)p=p.map(([x,y])=>[x,-y]).reverse();return transform2(p,at,axis);
  }
  // Hourglass cross-sections capture the tongue in Z as well as in the frame plane.
  // The 0.65 mm flanges grow over 0.80 mm, staying more conservative than 45 degrees.
  return union([-1,1].map(sign=>profileStack([arm(fl,sign),arm(0,sign),arm(0,sign),arm(fl,sign)],[0,rise,height-rise,height])));
 }
 function female(o,at,axis,height){
  const n=o.jn/2+o.kc,h=o.jn/2+o.jbarb+o.kc,g=o.kc,fl=o.jflange,rise=.8;
  function profile(add){return transform2([[-.04,-n-add],[10.4-g,-n-add],[10.4-g,-h-add],[14+g+.1,-h-add],[14+g+.1,h+add],[10.4-g,h+add],[10.4-g,n+add],[-.04,n+add]],at,axis);}
  return profileStack([profile(fl+.02),profile(fl),profile(0),profile(0),profile(fl),profile(fl+.02)],[-.02,0,rise,height-rise,height,height+.02]);
 }
 function getJoints(o,c){
  const joints=[],{nx,ny}=c,xL=c.col*o.ow/nx,xR=(c.col+1)*o.ow/nx,yB=c.row*o.oh/ny,yT=(c.row+1)*o.oh/ny;
  const H=o.closedFront?o.frameJointDepth:o.d;
  const horiz=[];if(c.row===0&&c.side!=='top')horiz.push({y:o.q/2,height:H,railHeight:o.d});if(c.row===ny-1&&c.side!=='bottom')horiz.push({y:o.isLight?o.oh-o.q/2:o.oh-o.b/2,height:o.isLight?H:o.front,railHeight:o.isLight?o.d:o.front});
  for(let v of horiz){if(c.col>0)joints.push({kind:'female',at:[xL,v.y],axis:'x',height:v.height,railHeight:v.railHeight});if(c.col<nx-1)joints.push({kind:'male',at:[xR,v.y],axis:'x',height:v.height,railHeight:v.railHeight});}
  const vert=[];if(c.col===0&&c.side!=='right')vert.push(o.q/2);if(c.col===nx-1&&c.side!=='left')vert.push(o.ow-o.q/2);
  for(let x of vert){if(c.row>0)joints.push({kind:'female',at:[x,yB],axis:'y',height:H,railHeight:o.d});if(c.row<ny-1)joints.push({kind:'male',at:[x,yT],axis:'y',height:H,railHeight:o.d});}
  return joints;
 }
 function partName(o,c,i){
  if(o.count===1)return 'Frame_One_Piece';
  if(o.nx===1&&o.ny===2)return c.row===0?'Frame_Bottom_Half':'Frame_Top_Half';
  if(o.nx===2&&o.ny===1)return c.col===0?'Frame_Left_Half':'Frame_Right_Half';
  const r=c.row===0?'Bottom':c.row===o.ny-1?'Top':'Middle_'+c.row;
  const s=c.side?c.side[0].toUpperCase()+c.side.slice(1):c.col===0?'Left':c.col===o.nx-1?'Right':'Center_'+c.col;
  return 'Frame_'+r+'_'+s;
 }
 // Unique seam locations. Original integrated tongues remain exactly as before.
 function frameConnectors(o){return o.layout.cells.flatMap(c=>getJoints(o,c).filter(j=>j.kind==='male'));}
 function lightRetainerDetails(o){
  return {width:16,stem:.8,root:1.2,gap:1.0,overlap:.60,cap:.8,bevel:.4,
   projection:o.pc+.60,rampStart:o.front+o.t+o.retainerClearance-o.pc};
 }
 function lightRetainers(o){
  const d=lightRetainerDetails(o),half=d.width/2+d.gap;
  const seams=o.frameConnectors||frameConnectors(o),out=[];
  const top=[o.b+16,o.ow-o.b-16,o.ow*.4,o.ow*.6,o.ow*.28,o.ow*.72];
  for(const x of top){
   if(x<o.b+half||x>o.ow-o.b-half||out.some(v=>Math.abs(v.at-x)<2*half+2))continue;
   if(seams.some(j=>j.axis==='x'&&j.at[1]>o.oh-o.b-.1&&Math.abs(j.at[0]-x)<half+16))continue;
   if(o.dualMounts&&(o.standPorts.some(p=>Math.abs(x-p)<half+7)||Math.abs(x-(o.standPorts[0]+7))<half+6))continue;
   out.push({edge:'top',at:clean(x)});if(out.length===2)break;
  }
  if(!out.length||(out.length<2&&o.ow>=140))throw Error('Top retaining clips cannot clear the frame joints. Adjust the bezel or usable bed.');
  const blocked=[];
  for(const j of seams)if(j.axis==='y')blocked.push([j.at[1]-half-12,j.at[1]+half+12]);
  blocked.push([o.oh-22-(o.hangerR+8)-half,o.oh]);
  for(const y of o.alternateHangerStations||[])blocked.push([y-half-5,y+half+5]);
  for(const p of o.standPorts||[])blocked.push([p-5.8-half-2,p+1.4+half+2]);
  if(o.standPorts?.length)blocked.push([o.standPorts[0]+4-half-2,o.standPorts[0]+8+half+2]);
  let spans=[[o.b+half+2,o.oh-o.b-half-2]];
  for(const [lo,hi] of blocked){const next=[];for(const [a,b] of spans){if(hi<=a||lo>=b)next.push([a,b]);else{if(lo>a)next.push([a,lo]);if(hi<b)next.push([hi,b]);}}spans=next;}
  const stations=[];
  for(let row=0;row<o.ny;row++){
   const y0=row*o.oh/o.ny,y1=(row+1)*o.oh/o.ny,target=(y0+y1)/2;
   const available=spans.map(([a,b])=>[Math.max(a,y0+half+2),Math.min(b,y1-half-2)]).filter(([a,b])=>b>=a);
   available.sort((a,b)=>Math.abs(Math.max(a[0],Math.min(a[1],target))-target)-Math.abs(Math.max(b[0],Math.min(b[1],target))-target));
   if(available.length)stations.push(clean(Math.max(available[0][0],Math.min(available[0][1],target))));
  }
  if(!stations.length&&spans.length){spans.sort((a,b)=>(b[1]-b[0])-(a[1]-a[0]));stations.push(clean((spans[0][0]+spans[0][1])/2));}
  if(!stations.length)throw Error('Side retaining clips cannot clear the joints and rear mounts. Increase the panel height or usable bed.');
  for(const y of stations)for(const edge of ['left','right'])out.push({edge,at:y});
  return out;
 }
 function lightRetainer(o,r){
  const d=lightRetainerDetails(o),w=d.width/2,p=d.projection,z=d.rampStart,F=o.front,D=o.d;
  // Local x runs along the rail; local y points into the panel pocket.
  const matrix=r.edge==='top'?[1,0,0,r.at,0,-1,0,o.oh-o.q,0,0,1,0,0,0,0,1]
   :r.edge==='left'?[0,1,0,o.q,1,0,0,r.at,0,0,1,0,0,0,0,1]
   :[0,-1,0,o.ow-o.q,1,0,0,r.at,0,0,1,0,0,0,0,1];
  const place=base=>({op:'transform',base,matrix});
  const lip=prism([[-.04,z-.04],[p,z+p],[p,D-d.bevel],[p-d.bevel,D],[-.04,D]],-w,d.width,'x');
  const plan=prism([[-w,-.10],[w,-.10],[w,p-d.bevel],[w-d.bevel,p],[-w+d.bevel,p],[-w,p-d.bevel]],F,D-F+.02);
  const rear=prism([[-d.root-d.gap,F],[-d.root,F],[-d.stem,F+.8],[-d.stem,D+.05],[-d.root-d.gap,D+.05]],-w,d.width,'x');
  const sides=[-1,1].map(sign=>box(sign<0?-w-d.gap:w,-d.root-d.gap-.04,F,d.gap,p+d.root+d.gap+.08,D-F+.05));
  return {lip:place(intersect(lip,plan)),relief:place(union(rear,sides))};
 }
 function lightBody(o){
  const {ow:W,oh:H,b:B,q,d:D,zr,rl,front:F}=o;
  const front=cut(box(0,0,0,W,H,F),box(B,B,-.04,W-2*B,H-2*B,F+.08));
  const walls=union(box(0,0,0,q,H,D),box(W-q,0,0,q,H,D),box(0,0,0,W,q,D),box(0,H-q,0,W,q,D));
  const bottom=prism([[q-.02,zr],[q+rl,zr+rl+.02],[q+rl,D],[q-.02,D]],0,W,'x');
  const clips=(o.retainerLocations||lightRetainers(o)).map(r=>lightRetainer(o,r));
  return cut(union(front,walls,bottom,clips.map(r=>r.lip)),clips.map(r=>r.relief),hangerCuts(o));
 }
 function jointFaceplate(o,j){
  // Two small split friction pegs use only the existing 1.6 mm central slot.
  // Pegs stop before the rail back, including the thin top-loading rail.
  const at=j.at,axis=j.axis,L0=-3.8,L1=18.0,th=1.2;
  let v0,v1;
  if(axis==='x'){
   const origin=at[1]<o.oh/2?0:o.oh-o.b;v0=origin-at[1];v1=v0+o.b;
  }else{
   const origin=at[0]<o.ow/2?0:o.ow-o.b;v1=at[0]-origin;v0=v1-o.b;
  }
  const rectangle=(inset=0,chamfer=0)=>{
   const a=L0+inset,b=L1-inset,c=v0+inset,d=v1-inset,k=Math.min(chamfer,(d-c)/3);
   return [[a+k,c],[b-k,c],[b,c+k],[b,d-k],[b-k,d],[a+k,d],[a,d-k],[a,c+k]];
  };
  let cap;
  if(o.faceplateStyle==='chamfered')cap=loft(transform2(rectangle(.35,1.2),at,axis),-th,transform2(rectangle(0,1.2),at,axis),0);
  else if(o.faceplateStyle==='stepped')cap=union(prism(transform2(rectangle(.40,.6),at,axis),-th,.55),loft(transform2(rectangle(.40,.6),at,axis),-.65,transform2(rectangle(0,.6),at,axis),0));
  else cap=prism(transform2([[L0,v0],[L1,v0],[L1,v1],[L0,v1]],at,axis),-th,th);
  const depth=Math.min(3.2,j.height-.22),slot=o.jslot,width=slot+o.faceplateFit,base=slot-.16,tip=slot-.16;
  const pegProfile=(x,w)=>transform2([[x-1.1,-w/2],[x+1.1,-w/2],[x+1.1,w/2],[x-1.1,w/2]],at,axis);
  for(const x of [5.6,10.4]){
   let peg=profileStack([pegProfile(x,base),pegProfile(x,base),pegProfile(x,width),pegProfile(x,tip)],[-.06,depth*.40,depth*.68,depth]);
   peg=cut(peg,prism(transform2([[x-1.2,-.32],[x+1.2,-.32],[x+1.2,.32],[x-1.2,.32]],at,axis),.32,depth+.1));
   cap=union(cap,peg);
  }
  return cap;
 }
 function frameFitKinds(o){
  if(o.isBorderless)return o.frameJointCount?[{kind:'rear_plane'}]:[];
  // Left/right repeats and in-plane rotations use the same joint. Keep a
  // separate sample only for an actually different section height/width.
  const kinds=new Map();
  for(const j of o.frameConnectors){
   const top=j.axis==='x'&&j.at[1]>o.oh-o.b-.1&&!o.isLight;
   const width=top?o.b:o.q,key=[j.height,width].map(clean).join('|');
   if(!kinds.has(key))kinds.set(key,{height:j.height,railHeight:j.railHeight,width,top});
  }
  return [...kinds.values()].sort((a,b)=>Number(a.top)-Number(b.top));
 }
 function frameJointTests(o){
  const parts=[],kinds=frameFitKinds(o);
  for(const k of kinds){
   const label=kinds.length===1?'Frame_Joint':k.top?'Frame_Top_Joint':'Frame_Main_Joint';
   const center=k.width/2,at=[0,center],H=k.height,D=k.railHeight||H;
   const channel=k.top?box(-32,0,0,66,o.b,D):union(box(-32,0,0,66,o.b,o.front),box(-32,0,0,66,o.q,D),prism([[o.q-.02,o.zr],[o.q+o.rl,o.zr+o.rl+.02],[o.q+o.rl,D],[o.q-.02,D]],-32,66,'x'));
   const left=intersect(channel,box(-32,0,0,32,o.b,D)),right=intersect(channel,box(0,0,0,34,o.b,D));
   const shape=v=>o.closedFront?blindFrameJoint({at,axis:'x',H,openingHeight:D,width:k.width,g:o.kc,grip:o.jointGrip,L:o.jointLength,rampClearance:o.frameRampClearance,baseRelief:o.frameBaseRelief,printTune:'frame'},v):v==='male'?male(o,at,'x',H):female(o,at,'x',H);
   const a=o.closedFront?cut(union(left,shape('male')),shape('well')):union(left,shape('male'));
   const b=o.closedFront?union(cut(right,shape('socket')),shape('tooth')):cut(right,shape('socket'));
   parts.push({name:label+'_Male',type:'test',testGroup:label,testRole:'male',spec:a},
    {name:label+'_Socket',type:'test',testGroup:label,testRole:'socket',spec:b});
   if(o.faceplateCount){
    const y=k.top?o.oh-o.b/2:o.q/2;
    const cap=shift(jointFaceplate(o,{at:[0,y],axis:'x',height:H}),0,center-y,0);
    parts.push({name:label+'_Faceplate_'+o.faceplateStyle,type:'test',testGroup:label,testRole:'faceplate',spec:cap});
   }
  }
  return parts;
 }
 function frameRetainerTests(o){
  if(!o.isLight)return [];
  const x=o.retainerLocations.find(r=>r.edge==='top').at,span=lightRetainerDetails(o).width+8;
  return [{name:'Panel_Retainer_Test',type:'test',testGroup:'panel_retainer',testRole:'retainer',spec:intersect(lightBody(o),box(x-span/2,o.oh-o.b,0,span,o.b,o.d))},
   {name:'Panel_Thickness_Gauge',type:'test',testGroup:'panel_retainer',testRole:'gauge',spec:box(0,0,0,span,22,o.t)}];
 }
 // Rear-only easels. Frame coordinates: X across, Y up, Z behind the artwork.
 // Footprints and shelf poses use the frame's own bottom/back edge as Z=0 contact.
 const LEAN=8*Math.PI/180, SA=Math.sin(LEAN), CA=Math.cos(LEAN);
 const standTransform=(spec,matrix)=>({op:'transform',base:spec,matrix});
 function rearWorldToFrame(o,rear,height){return [rear*SA+(height-o.d*SA)*CA,rear*CA-(height-o.d*SA)*SA];}
 function previewOffset(part,o,distance){
  const ex=Number(distance)||0,c=part.displayCell||part.cell;
  if(!c||!ex)return [0,0,0];
  const cx=c.x+c.w/2,cy=c.y+c.h/2;
  return [Math.abs(cx-o.ow/2)<.1?0:Math.sign(cx-o.ow/2)*ex,
   Math.abs(cy-o.oh/2)<.1?0:Math.sign(cy-o.oh/2)*ex,
   o.closedFront?((c.row||0)+(c.col||0))*(-ex*.7):0];
 }
 function frameShelfPoint(v,o){
  const [x,y]=o.mountQuarterTurn?[o.oh-v[1],v[0]]:v;
  const a=o.isBorderless?o.borderlessStandAngle*Math.PI/180:LEAN,ca=Math.cos(a),sa=Math.sin(a);
  return [x-(o.mountQuarterTurn?o.oh:o.ow)/2,y*ca-v[2]*sa+o.d*sa,y*sa+v[2]*ca];
 }
 function mountTransform(o,s,quarter){
  return quarter?standTransform(s,[0,1,0,0,-1,0,0,o.oh,0,0,1,0,0,0,0,1]):s;
 }
 function standMountPose(o,quarter=false){
  const depth=quarter&&!o.isLight?o.front:o.d,dz=depth-o.d,dy=dz*Math.tan(LEAN);
  const lateral=Math.max(0,(9-o.q)/2+.15);
  const edge=quarter&&!o.isLight?Math.min(o.q/2,o.q+o.pc-.4-4.5-lateral):o.q/2;
  return {quarter,depth,dz,dy,centers:[edge,(quarter?o.oh:o.ow)-edge]};
 }
 function compactHanger(o,u){
  const r=Math.min(2.7,(o.q-3.6)/2),n=1.7,travel=2,v=o.ow-o.q/2-travel/2;
  const lower=Math.max(.8,o.isLight?o.front+.2:o.d-5.2),z2=o.d-.8,z1=z2-(r-n);
  const wide=octagon(u,v+travel/2,r,r+travel/2,r*(2-Math.SQRT2));
  const narrow=octagon(u,v+travel/2,n,n+travel/2,n*(2-Math.SQRT2));
  return mountTransform(o,union(prism(wide,lower,z1-lower),loft(wide,z1,narrow,z2),
   prism(narrow,z2,o.d-z2+.04),prism(octagon(u,v,r,r,.6),lower,o.d-lower+.04)),true);
 }
 function hangerCuts(o){return union(hanger(o,o.q/2),hanger(o,o.ow-o.q/2),
  (o.alternateHangerStations||[]).map(y=>compactHanger(o,o.oh-y)));}
 function hangerPlan(o){
  o.alternateHangerStations=[];o.hangerSpacings={primary:clean(o.ow-o.q)};
  if(!o.dualMounts)return;
  const r=Math.min(2.7,(o.q-3.6)/2),pad=r+1.2,cy=o.oh-(o.isLight?22:26);
  const blocked=[[cy-o.hangerR-pad,cy+8+o.hangerR+pad],
   ...o.standPorts.map(p=>[p-5.8-pad,p+1.4+pad]),
   [o.standPorts[0]+4-.65-pad,o.standPorts[0]+4+6.5+pad],
   ...o.frameConnectors.filter(j=>j.axis==='y').map(j=>[j.at[1]-j.height-5-pad,j.at[1]+j.height+5+pad])];
  const legal=[];for(let y=12;y<=o.oh-12;y+=.5)if(!blocked.some(([a,b])=>y>a&&y<b))legal.push(y);
  let best=null;
  for(const a of legal.filter(y=>y<o.oh/2-6))for(const b of legal.filter(y=>y>o.oh/2+6)){
   const score=5*Math.abs(a+b-o.oh)+Math.abs(a-o.oh*.25)+Math.abs(b-o.oh*.75);
   if(!best||score<best.score)best={a,b,score};
  }
  if(!best)throw Error('Two-orientation hangers cannot clear the frame joints and foot mounts at this size. Increase the panel dimensions or usable print area.');
  o.alternateHangerStations=[best.a,best.b];o.hangerSpacings.alternate=clean(best.b-best.a);
  o.hangerHead=clean(Math.min(o.hangerHead,2*r-.3));
  o.hangerSpacing=o.mountQuarterTurn?o.hangerSpacings.alternate:o.hangerSpacings.primary;
 }
 function receiver(o,x,p){
  // The top of the blind socket recedes 1.2 mm over 1.2 mm of build height.
  const g=o.kc,pts=[[p-5.8,o.d-2.4],[p+1.4,o.d-2.4],[p+1.4,o.d-1.3],[p+.2,o.d-.1],[p+.2,o.d+.05],[p-5.8,o.d+.05]];
  return prism(pts,x-2-g,4+2*g,'x');
 }
 function standHook(o,p){
  return [[p-1.8,o.d+1.5],[p-1.8,o.d-2.15],[p+1.05,o.d-2.15],[p+1.05,o.d-1.55],[p-.30,o.d-.20],[p-.30,o.d+1.5]];
 }
 function standCatchPocket(o,x){
  const {a,pocketDepth,pocketLength,seatingAllowance}=standLatchGeometry(o),z=o.d;
  // The pocket opens toward the printed rear face. Its relieved floor corners
  // clear the rounded tooth without an unsupported ceiling or a sharp stop.
  return prism([[a-seatingAllowance,z+.05],[a-seatingAllowance,z-pocketDepth+.4],[a-seatingAllowance+.4,z-pocketDepth],
   [a+pocketLength-.4,z-pocketDepth],[a+pocketLength,z-pocketDepth+.4],
   [a+pocketLength,z+.05]],x-2.2,4.4,'x');
 }
 function standReceiverCuts(o){
  const cuts=quarter=>{
   const pose=standMountPose(o,quarter),local={...o,d:pose.depth,standPorts:o.standPorts.map(p=>p+pose.dy)};
   const sockets=union(local.standPorts.flatMap(p=>pose.centers.map(x=>receiver(local,x,p))),pose.centers.map(x=>standCatchPocket(local,x)));
   let relief=null;
   if(quarter&&!o.isLight){
    // Recess the unused rear rail material to the shallow loading-strip plane.
    // The matching feet keep their tested shape; the mounting shift preserves
    // shelf contact. The inner retaining lip remains along the rest of the rail.
    const span=o.q+o.rl+.3,end=o.standHeight+pose.dy+5,rise=o.d-pose.depth;
    const profile=[[-.05,pose.depth],[end,pose.depth],[end+rise,o.d+.05],[-.05,o.d+.05]];
    relief=union(prism(profile,-.05,span+.05,'x'),prism(profile,o.oh-span,span+.05,'x'));
   }
   return mountTransform(o,union(sockets,relief),quarter);
  };
  return union(cuts(false),o.dualMounts?cuts(true):null);
 }
 // A 20 mm cantilever puts the tooth beyond the 2.15 mm hooks. The free
 // tongue leans 0.40 mm toward the frame; the 2.70 mm pocket holds it back
 // approximately 0.20 mm when seated. This is a nominal geometric preload,
 // not a force rating. Pull the tongue rearward before sliding the foot down.
 function standLatchGeometry(o,seated=false){
  const a=o.standPorts[0]+4,z=o.d,length=20,thickness=1.4,bias=.40,
   depth=2.50,pocketDepth=2.70,pocketLength=6.50,seatingAllowance=.65,preload=.20,root=a+length;
  const lean=y=>bias*Math.max(0,Math.min(1,(root-y)/length));
  const deflection=seated===true?preload:Number(seated)||0;
  // Display the nominal seated angle; this is not an elastic deformation model.
  const bend=y=>deflection*Math.max(0,Math.min(1,(root-y)/length));
  const front=y=>z+1.4-lean(y)+bend(y);
  // The folding support keeps its lower print surface on the bed. Its
  // frameward surface is raked, making the spring 1.4 to 1.8 mm thick.
  const back=y=>z+2.8-(o.standType==='fold'?0:lean(y))+bend(y);
  const tooth=bevelSection([[a,back(a)-.4],[a,z-depth-lean(a)+bend(a)],
   [a+1.4,z-depth-lean(a+1.4)+bend(a+1.4)],
   [a+5.7,front(a+5.7)],[a+6.1,front(a+6.1)],[a+6.1,back(a+6.1)-.4]],
   [0,.4,.4,.4,0,0]);
  const beam=[[a,front(a)],[root,z+1.4],[root+.8,z+1.4],
   [root+.8,z+(o.standType==='fold'?2.8:4.0)],[root-.8,back(root-.8)],
   [a,back(a)]];
  return {a,root,length,thickness,bias,depth,pocketDepth,pocketLength,seatingAllowance,preload,
   freeDepth:depth+bias,hookDepth:2.15,releaseTravel:depth+bias+.50,
   reliefGap:.8,tooth,beam,seated};
 }
 function foldingPath(o,H,R,footHeight){
  const W=9,T=1.4,hy=o.standHinge,Z=o.d+2.8,start=[3.5,Z],A=[H,Z],B=rearWorldToFrame(o,R,footHeight),C=[8,Z],radius=3.6;
  const sub=(a,b)=>a.map((v,i)=>v-b[i]),add=(a,b)=>a.map((v,i)=>v+b[i]),mul=(a,s)=>a.map(v=>v*s),norm=a=>mul(a,1/Math.hypot(...a)),left=a=>[-a[1],a[0]];
  const u1=norm(sub(A,start)),u2=norm(sub(B,A)),u3=norm(sub(C,B));
  function fillet(vertex,vi,vo){let theta=Math.atan2(vi[0]*vo[1]-vi[1]*vo[0],vi[0]*vo[0]+vi[1]*vo[1]);if(theta<=0)theta+=2*Math.PI;const trim=radius*Math.tan(theta/2),begin=sub(vertex,mul(vi,trim)),end=add(vertex,mul(vo,trim)),center=add(begin,mul(left(vi),radius));return {begin,end,center,theta,trim,vi,vo};}
  const f1=fillet(A,u1,u2),f2=fillet(B,u2,u3);
  if(f1.trim>H-15||f1.trim+f2.trim>Math.hypot(...sub(B,A))-9||f2.trim>Math.hypot(...sub(C,B))-9)return null;
  const pts=[],push=(p,thickness,tag,u)=>pts.push({p:p.map(clean),t:thickness,tag,u});
  let distance=0;
  function line(a,b,ta,tb,tag){if(!pts.length)push(a,ta,tag,distance);const len=Math.hypot(...sub(b,a));distance+=len;push(b,tb,tag,distance);}
  function arc(f){const startAngle=Math.atan2(f.begin[1]-f.center[1],f.begin[0]-f.center[0]),n=32;for(let i=1;i<=n;i++){const a=startAngle+f.theta*i/n;distance+=(radius+hy/2)*f.theta/n;push(add(f.center,[radius*Math.cos(a),radius*Math.sin(a)]),hy,'hinge',distance);}}
  line(start,sub(f1.begin,mul(u1,1.4)),T,T,'mount');line(sub(f1.begin,mul(u1,1.4)),f1.begin,T,hy,'ramp');arc(f1);
  line(f1.end,add(f1.end,mul(u2,2.4)),hy,2.4,'ramp');line(add(f1.end,mul(u2,2.4)),sub(f2.begin,mul(u2,2.4)),2.4,2.4,'leg');line(sub(f2.begin,mul(u2,2.4)),f2.begin,2.4,hy,'ramp');arc(f2);
  line(f2.end,add(f2.end,mul(u3,1.4)),hy,T,'ramp');line(add(f2.end,mul(u3,1.4)),C,T,T,'base');
  // Right-hand normals put the plate thickness outside the triangle. The
  // hinge surfaces are concentric, not disconnected flat panels in the viewer.
  const top=pts.map((v,i)=>{let tangent;if(i===0)tangent=u1;else if(i===pts.length-1)tangent=u3;else tangent=norm(sub(pts[i+1].p,pts[i-1].p));return add(v.p,mul([tangent[1],-tangent[0]],v.t));});
  const minHeight=Math.min(...[...pts.map(v=>v.p),...top].map(([y,z])=>y*CA-z*SA+o.d*SA));
  return {width:W,T,hy,Z,start,A,B,C,u1,u2,u3,pts,top,length:clean(distance),minHeight,firstHingeY:f1.begin[0],f1,f2,R,H};
 }
 function solveFoldingPath(o,H,R){
  let low=-12,high=12,path=null;
  for(let i=0;i<28;i++){const mid=(low+high)/2;path=foldingPath(o,H,R,mid);if(!path)return null;if(path.minHeight<0)low=mid;else high=mid;}
  return foldingPath(o,H,R,(low+high)/2);
 }
 function standPlan(o){
  const joints=o.frameConnectors||frameConnectors(o),span=o.dualMounts?Math.max(o.ow,o.oh):o.oh,R=clean(Math.max(55,span*.12+32));
  const maximum=Math.min(100,o.oh-36,o.dualMounts?o.ow-36:100),preferred=Math.min(maximum,Math.max(40,span*.24));
  let candidates=[];
  for(let H=Math.floor(maximum);H>=34;H--){
   const path=solveFoldingPath(o,H,R);if(!path)continue;
   if(o.dualMounts&&!o.isLight&&joints.some(j=>j.axis==='x'&&j.at[0]<H+o.d-o.front+14))continue;
   const possible=[];
   for(let y=13;y<path.firstHingeY-4;y+=.5){
    if(joints.some(j=>j.axis==='y'&&Math.abs(y-j.at[1])<26))continue;
    if(o.dualMounts&&joints.some(j=>j.axis==='x'&&Math.abs(y-j.at[0])<26))continue;
    if(Math.abs(y-(o.oh-18))<13)continue;
    possible.push(y);
   }
   if(possible.length<2)continue;
   const low=possible[0],high=possible[possible.length-1];if(high-low<27)continue;
   if(joints.some(j=>j.axis==='y'&&Math.abs((low+5.8)-j.at[1])<23))continue;
   if(o.dualMounts&&joints.some(j=>j.axis==='x'&&Math.abs((low+5.8)-j.at[0])<23))continue;
   const fit=bedRotation(9,path.length+2.4,o)!==null;
   candidates.push({path,ports:[clean(low),clean(high)],fit,score:Math.abs(H-preferred)+(fit?0:10000)});
  }
  if(!candidates.length)throw Error('Rear stand mounts cannot clear the frame joints at this size. Change the bezel, panel size or usable bed.');
  candidates.sort((a,b)=>a.score-b.score);const best=candidates[0];
  o.standPorts=best.ports;o.standPath=best.path;o.standHeight=best.path.H;o.standRear=R;o.standWidth=9;
  o.foldFits=best.fit;o.standCount=o.includeStand?2:0;o.standSeat=o.d*SA;
  o.standRearReach=clean(o.standType==='fold'?Math.max(...best.path.pts.map(v=>v.p[0]*SA+v.p[1]*CA),...best.path.top.map(v=>v[0]*SA+v[1]*CA)):R+4);
  const latch=standLatchGeometry(o);
  o.standLatch={springLength_mm:latch.length,springThickness_mm:latch.thickness,
   freeTipBias_mm:latch.bias,nominalPreload_mm:latch.preload,
   freeToothDepth_mm:latch.freeDepth,receiverDepth_mm:latch.pocketDepth,
   hookDepth_mm:latch.hookDepth,seatingAllowance_mm:latch.seatingAllowance,physicalPrintTested:false};
  const rigidSize=[o.standHeight-3.5,(R+4)*CA+o.d*SA*SA-(o.d-latch.freeDepth)];
  if(o.standType==='rigid'&&bedRotation(...rigidSize,o)===null)throw Error('The rigid support cannot fit this usable bed. Increase the bed area or reduce the frame size.');
  o.standFrontProjection=0;o.standPrintHeight=o.standType==='fold'?clean(2.8+latch.freeDepth):4;
  if(o.standType==='fold'&&!best.fit)throw Error('The unfolded stand needs '+clean(best.path.length+2.4)+' x 9 mm of usable bed. Choose Rigid rear supports, increase the bed area, or reduce the frame size.');
 }
 function rigidStand(o){
  const z=o.d+1.4,H=o.standHeight,R=o.standRear;
  const outer=[[3.5,z],[H,z],[H,z+4],rearWorldToFrame(o,R+4,3),rearWorldToFrame(o,R+4,0),rearWorldToFrame(o,R-4,0),[3.5,z+4]];
  const hole=[[14,z+5],[H-10,z+5],rearWorldToFrame(o,R-13,10)];
  let geometry=cut(prism(outer,0,4),prism(hole,-.03,4.06));
  const latch=standLatchGeometry(o),{a,root}=latch;
  // The rear rib bypasses the latch slot, so shelf load does not go through
  // the flexible tongue. The tongue and rear rib are cut in the print plane.
  geometry=union(geometry,box(a-2.2,o.d+5.0,0,latch.length+4.4,3.0,4));
  const opening=bevelSection([[a-.8,o.d-.2],[root,o.d-.2],
   [root,o.d+6.6],[a-.8,o.d+6.6]],[.4,0,.8,.4]);
  geometry=cut(geometry,prism(opening,-.03,4.06));
  const base=union(geometry,o.standPorts.map(p=>prism(standHook(o,p),0,4)));
  const shape=d=>union(base,prism(d.beam,0,4),prism(d.tooth,0,4));
  const spec=shape(latch);
  const display=standTransform(shape(standLatchGeometry(o,true)),[0,0,1,-2, 1,0,0,0, 0,1,0,0, 0,0,0,1]);
  return {spec,displaySpec:display};
 }
 function foldStand(o,lateral=0){
  const p=o.standPath,{width:W,T,Z,pts,top,length:L,u3,C}=p;
  // Flat extrusion is bed-supported along its whole length. Thin web regions
  // are integral; the thick rear strut and the locked tie carry display loads.
  const flatProfile=[];
  for(const v of [[0,0],[L,0],...pts.slice().reverse().map(v=>[v.u,v.t])]){while(flatProfile.length>1){const a=flatProfile[flatProfile.length-2],b=flatProfile[flatProfile.length-1];if(Math.abs((b[0]-a[0])*(v[1]-b[1])-(b[1]-a[1])*(v[0]-b[0]))>1e-8)break;flatProfile.pop();}flatProfile.push(v);}
  let flat=prism(flatProfile,0,W,'x');
  const end=[C[0]-u3[0]*9.95,C[1]-u3[1]*9.95],endTop=[end[0]+u3[1]*T,end[1]-u3[0]*T];
  let display=prism([...pts.slice(0,-1).map(v=>v.p),end,endTop,...top.slice(0,-1).reverse()],-W/2+lateral,W,'x');
  const n=[u3[1],-u3[0]],matrix=[1,0,0,-W/2+lateral, 0,u3[0],n[0],C[0]-L*u3[0], 0,u3[1],n[1],C[1]-L*u3[1], 0,0,0,1];
  const half=(a,w)=>[[W/2-w,a],[W/2+w,a]];
  // Replace the final 10 mm of full-width tie with one split, barbed locking tip.
  const remove=box(-.1,L-10,-.1,W+.2,13,3);
  const outline=[[0,L-10],[W,L-10],[W/2+2.4,L-8],[W/2+2.4,L+.85],[W/2+3.05,L+.85],[W/2+3.05,L+1.4],[W/2+2.05,L+2.3],[W/2-2.05,L+2.3],[W/2-3.05,L+1.4],[W/2-3.05,L+.85],[W/2-2.4,L+.85],[W/2-2.4,L-8]];
  let tongue=cut(prism(outline,0,T),box(W/2-1.1,L-6.5,-.03,2.2,9.0,T+.06));
  flat=union(cut(flat,remove),tongue);
  // Rectangular receiver through the stand's own mounting spine, not the frame.
  const slot=box(W/2-2.7,1.9,-.1,5.4,4.2,T+.2);
  flat=cut(flat,slot);
  display=union(cut(display,standTransform(slot,[1,0,0,-W/2+lateral,0,1,0,3.5,0,0,-1,Z,0,0,0,1])),standTransform(tongue,matrix));
  for(const at of o.standPorts){
   const hook=standHook(o,at);
   flat=union(flat,prism(hook.map(([y,z])=>[y-3.5,Z-z]),W/2-lateral-2,4,'x'));
   display=union(display,prism(hook,-2,4,'x'));
  }
  const latch=standLatchGeometry(o),a=latch.a,cx=W/2-lateral;
  // Isolate the same rear-release tongue in the flat spine. All its layers
  // start on the bed; the raised tooth uses a sloped transition, not a bridge.
  const flatCuts=prism(bevelSection([[cx-2.8,a-3.5-.8],[cx+2.8,a-3.5-.8],
   [cx+2.8,latch.root-3.5],[cx-2.8,latch.root-3.5]],[.4,.4,0,0]),-.05,T+.10);
  const displayCuts=standTransform(flatCuts,[1,0,0,-W/2+lateral,0,1,0,3.5,0,0,-1,Z,0,0,0,1]);
  flat=cut(flat,flatCuts);display=cut(display,displayCuts);
  flat=union(flat,[latch.beam,latch.tooth].map(profile=>prism(profile.map(([y,z])=>[y-3.5,Z-z]),cx-2,4,'x')));
  const installed=standLatchGeometry(o,true);
  display=union(display,[installed.beam,installed.tooth].map(profile=>prism(profile,-2,4,'x')));
  return {spec:flat,displaySpec:display};
 }
 function rearStandParts(o){
  if(!o.includeStand)return [];
  const label=o.standType==='fold'?'Fold_Flat_Rear_Support':'Rigid_Rear_Support',offset=Math.max(0,(9-o.q)/2+.15);
  const pose=standMountPose(o,o.mountQuarterTurn);
  return pose.centers.map((x,i)=>{
   const shapes=o.standType==='fold'?foldStand(o,i?-offset:offset):rigidStand(o);
   if(pose.quarter)shapes.displaySpec=standTransform(shapes.displaySpec,[0,1,0,pose.dy,-1,0,0,o.oh-x,0,0,1,pose.dz,0,0,0,1]);
   return {name:label+'_'+(i?'Right':'Left'),type:'foot',...shapes,displayOffset:pose.quarter?[0,0,0]:[x,0,0],standType:o.standType};
  });
 }
 function standFitTest(oInput){
  if(oInput?.frameStyle==='borderless')return borderlessTests(derive(oInput),'stand');
  const o=derive(oInput);
  if(!o.includeStand)return {params:o,parts:[]};
  const left=o.q/2,body=cut(frameBody(o),standReceiverCuts(o));
  const coupon=intersect(body,o.mountQuarterTurn?box(0,o.oh-o.b,0,Math.max(...o.standPorts)+8,o.b,o.d):box(0,0,0,o.b,Math.max(...o.standPorts)+8,o.d));
  const chosen=rearStandParts({...o,includeStand:true})[0];
  return {params:o,parts:[{name:'Stand_Mount_Test_Rail',type:'test',testGroup:'stand_mount',testRole:'socket',spec:coupon},{...chosen,name:'Stand_Support_Test_'+o.standType,type:'test',testGroup:'stand_mount',testRole:'support'}]};
 }

 function make(oInput){
  const o=derive(oInput);if(o.isBorderless)return borderlessMake(o);
  const base=cut(frameBody(o),standReceiverCuts(o)),parts=[];
  for(let [i,c] of o.layout.cells.entries()){
   let spec=intersect(base,box(c.x,c.y,-.02,c.w,c.h,o.d+.04));const joints=getJoints(o,c);
   if(o.closedFront){
    spec=cut(spec,joints.filter(j=>j.kind==='female').map(j=>frameIntegral(o,j,'socket')));
    spec=union(spec,joints.map(j=>frameIntegral(o,j,j.kind==='male'?'male':'tooth')));
    spec=cut(spec,joints.filter(j=>j.kind==='male').map(j=>frameIntegral(o,j,'well')));
   }else{
    spec=union(spec,joints.filter(j=>j.kind==='male').map(j=>male(o,j.at,j.axis,j.height)));
    spec=cut(spec,joints.filter(j=>j.kind==='female').map(j=>female(o,j.at,j.axis,j.height)));
   }
   parts.push({name:partName(o,c,i),type:'frame',spec,cell:c,joints,pressFitSpec:o.closedFront?union(joints.filter(j=>j.kind==='male').map(j=>frameIntegral(o,j,'ribs'))):null});
  }
  if(o.faceplateCount)for(const [i,j] of o.frameConnectors.entries())parts.push({name:'Joint_Faceplate_'+o.faceplateStyle+'_'+String(i+1).padStart(2,'0'),type:'faceplate',spec:jointFaceplate(o,j),connector:j,fit:'elastic_interference',nominalGrip_mm:o.faceplateFit});
  parts.push(...rearStandParts(o));
  parts.push(...panelParts(o));
  return {params:o,parts,panel:box(o.b-o.ov,o.b-o.ov,o.front,o.w,o.h,o.t)};
 }
 function fitTest(oInput){
  const o=derive(oInput);if(o.isBorderless)return borderlessTests(o,'frame');
  return {params:o,parts:[...frameJointTests(o),...frameRetainerTests(o)]};
 }
 function frameRepairFitTest(oInput){
  if(oInput?.frameStyle==='borderless')return borderlessTests(derive(oInput),'frame');
  const test=fitTest(oInput);return {...test,testSelection:{mode:'frame_and_retainer',frameJointTypes:frameFitKinds(test.params).length,panelJointTypes:0,standType:'none',reusePanelAsThicknessGauge:false,partCount:test.parts.length}};
 }
 function frameJointFitTest(oInput){
  const o=derive(oInput);if(o.isBorderless)return borderlessTests(o,'joints');
  const parts=frameJointTests(o);
  return {params:o,parts,testSelection:{mode:'frame_joints_only',frameJointTypes:frameFitKinds(o).length,panelJointTypes:0,standType:'none',reusePanelAsThicknessGauge:false,partCount:parts.length}};
 }
 function selectedFitTests(oInput){
  const o=derive(oInput);if(o.isBorderless){const test=borderlessTests(o,'all'),uv=panelFitTest(o).parts;test.parts.push(...uv);test.testSelection.panelJointTypes=uv.length?1:0;test.testSelection.partCount=test.parts.length;return test;}
  const frame=fitTest(o).parts,panel=panelFitTest(o).parts;
  // The flat edge of the exported panel coupon is already an exact-thickness
  // gauge. Reuse it rather than adding another blank piece to the same plate.
  const parts=frame.filter(p=>!(panel.length&&p.testRole==='gauge'));
  parts.push(...panel);
  if(o.includeStand)parts.push(...standFitTest(o).parts);
  const names=new Set();
  for(const p of parts){if(names.has(p.name))throw Error('Duplicate fit-test part: '+p.name);names.add(p.name);}
  return {params:o,parts,testSelection:{mode:'current_settings_only',frameJointTypes:frameFitKinds(o).length,panelJointTypes:panel.length?1:0,standType:o.includeStand?o.standType:'none',reusePanelAsThicknessGauge:!!panel.length&&o.isLight,partCount:parts.length}};
 }
 function earclip(points){
  let ids=points.map((_,i)=>i),area=0;for(let i=0;i<points.length;i++){let a=points[i],b=points[(i+1)%points.length];area+=a[0]*b[1]-b[0]*a[1]}if(area<0)ids.reverse();
  const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);let out=[],guard=0;
  while(ids.length>3){let found=false;for(let k=0;k<ids.length;k++){let a=ids[(k+ids.length-1)%ids.length],b=ids[k],c=ids[(k+1)%ids.length];if(cross(points[a],points[b],points[c])<=1e-9)continue;
   if(ids.some(i=>i!==a&&i!==b&&i!==c&&cross(points[a],points[b],points[i])>=-1e-9&&cross(points[b],points[c],points[i])>=-1e-9&&cross(points[c],points[a],points[i])>=-1e-9))continue;
   out.push([a,b,c]);ids.splice(k,1);found=true;break;}
   if(!found||guard++>2000)throw Error('Could not triangulate a part profile.');
  }out.push(ids);return out;
 }
 function prismMesh(s){
  const p=s.points,n=p.length;let area=0;for(let i=0;i<n;i++)area+=p[i][0]*p[(i+1)%n][1]-p[(i+1)%n][0]*p[i][1];const pts=area>0?p:[...p].reverse();
  const map=(u,v,z)=>s.axis==='y'?[u,z,v]:s.axis==='x'?[z,u,v]:[u,v,z];
  let v=[...pts.map(p=>map(...p,s.start)),...pts.map(p=>map(...p,s.start+s.length))],f=[];
  for(let t of earclip(pts)){f.push([...t].reverse());f.push(t.map(i=>i+n));}
  for(let i=0;i<n;i++){let j=(i+1)%n;f.push([i,j,j+n,i+n]);}
  if(s.axis==='y')f=f.map(f=>f.reverse());return {vertices:v,faces:f};
 }
 function loftMesh(s){
  let p0=s.points0,p1=s.points1,area=0;for(let i=0;i<p0.length;i++)area+=p0[i][0]*p0[(i+1)%p0.length][1]-p0[(i+1)%p0.length][0]*p0[i][1];if(area<0){p0=[...p0].reverse();p1=[...p1].reverse();}
  const n=p0.length,v=[...p0.map(p=>[...p,s.z0]),...p1.map(p=>[...p,s.z1])],f=[];
  for(let t of earclip(p0))f.push([...t].reverse());for(let t of earclip(p1))f.push(t.map(i=>i+n));
  for(let i=0;i<n;i++){let j=(i+1)%n;f.push([i,j,j+n],[i,j+n,i+n]);}return {vertices:v,faces:f};
 }
 function evaluate(s,cache=new WeakMap()){
  if(cache.has(s))return cache.get(s);let result;
  if(s.op==='box'){const [x,y,z]=s.min,[a,b,c]=s.size;result=evaluate(prism([[x,y],[x+a,y],[x+a,y+b],[x,y+b]],z,c),cache);}
  else if(s.op==='cylinder'||s.op==='curve_prism'){result=evaluate(curveAsPrism(s),cache);}
  else if(s.op==='prism'||s.op==='loft'){let m=s.op==='prism'?prismMesh(s):loftMesh(s);result=CSG.mesh(m.vertices,m.faces);}
  else if(s.op==='transform'){
   const a=s.matrix,det=a[0]*(a[5]*a[10]-a[6]*a[9])-a[1]*(a[4]*a[10]-a[6]*a[8])+a[2]*(a[4]*a[9]-a[5]*a[8]);
   const original=evaluate(s.base,cache),verts=[],faces=[];
   for(const polygon of original.polygons){let f=[];for(const v of polygon.vertices){const p=v.arr();f.push(verts.length);verts.push([a[0]*p[0]+a[1]*p[1]+a[2]*p[2]+a[3],a[4]*p[0]+a[5]*p[1]+a[6]*p[2]+a[7],a[8]*p[0]+a[9]*p[1]+a[10]*p[2]+a[11]]);}faces.push(det<0?f.reverse():f);}
   result=CSG.mesh(verts,faces);
  }
  else if(s.op==='union'){result=new CSG.Solid();for(let i of s.items)result=result.union(evaluate(i,cache));}
  else if(s.op==='cut'){result=evaluate(s.base,cache);for(let i of s.items)result=result.subtract(evaluate(i,cache));}
  else if(s.op==='intersect'){result=evaluate(s.items[0],cache);for(let i of s.items.slice(1))result=result.intersect(evaluate(i,cache));}
  else throw Error('Unknown solid operation '+s.op);cache.set(s,result);return result;
 }
 function solidMesh(solid){
  // Split T-junctions on polygon boundaries BEFORE triangulating. Every adjoining
  // face then shares exactly the same edge vertices in the exported closed mesh.
  const vertices=[],buckets=new Map(),weld=0.00002;
  function id(v){
   const cell=v.map(x=>Math.floor(x/weld));
   for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++){
    const ids=buckets.get([cell[0]+x,cell[1]+y,cell[2]+z].join(','));if(!ids)continue;
    for(let i of ids){const p=vertices[i];if(p.reduce((a,n,k)=>a+(n-v[k])**2,0)<weld*weld)return i;}
   }
   const k=cell.join(','),i=vertices.length;vertices.push(v.map(clean));if(!buckets.has(k))buckets.set(k,[]);buckets.get(k).push(i);return i;
  }
  const polygons=solid.polygons.map(p=>p.vertices.map(v=>id(v.arr()))),pool=vertices.slice(),faces=[];
  // Restrict T-junction candidates to the edge bounding box. This preserves
  // the exact test and original vertex order but avoids an all-pairs scan.
  const sorted=[0,1,2].map(a=>pool.map((_,i)=>i).sort((i,j)=>pool[i][a]-pool[j][a]||i-j));
  const range=(axis,lo,hi)=>{const ids=sorted[axis];let a=0,b=ids.length;
   while(a<b){const m=(a+b)>>>1;if(pool[ids[m]][axis]<lo)a=m+1;else b=m;}const start=a;b=ids.length;
   while(a<b){const m=(a+b)>>>1;if(pool[ids[m]][axis]<=hi)a=m+1;else b=m;}return [start,a];};
  function candidates(a,b){let best=null,axis=0;for(let k=0;k<3;k++){const r=range(k,Math.min(a[k],b[k])-.00004,Math.max(a[k],b[k])+.00004);if(!best||r[1]-r[0]<best[1]-best[0]){best=r;axis=k;}}
   return sorted[axis].slice(best[0],best[1]).sort((a,b)=>a-b);}
  for(const p of polygons){let boundary=[];
   for(let i=0;i<p.length;i++){let ai=p[i],bi=p[(i+1)%p.length],a=vertices[ai],b=vertices[bi],d=b.map((v,k)=>v-a[k]),len=d.reduce((v,k)=>v+k*k,0);if(len<1e-16)continue;
    let on=[[0,ai]];
    for(const j of candidates(a,b)){if(j===ai||j===bi)continue;let q=pool[j],t=q.reduce((v,x,k)=>v+(x-a[k])*d[k],0)/len;if(t<=1e-10||t>=1-1e-10)continue;let dist=q.reduce((v,x,k)=>v+(x-a[k]-t*d[k])**2,0);if(dist<1e-9)on.push([t,j]);}
    on.sort((a,b)=>a[0]-b[0]);boundary.push(...on.map(v=>v[1]));
   }
   boundary=boundary.filter((v,i)=>v!==boundary[(i+boundary.length-1)%boundary.length]);if(boundary.length<3)continue;
   let c=[0,0,0];for(let j of boundary)for(let a=0;a<3;a++)c[a]+=vertices[j][a]/boundary.length;let ci=id(c);
   for(let i=0;i<boundary.length;i++){const a=boundary[i],b=boundary[(i+1)%boundary.length];if(ci!==a&&ci!==b&&a!==b)faces.push([ci,a,b]);}
  }
  // Coplanar BSP cuts can leave a zero-thickness sliver represented by a
  // triangle and its exact reverse. Cancel these internal sheets before STL
  // output so their edges do not become non-manifold after vertex welding.
  const unique=new Map();
  for(const face of faces){
   const ids=[...face].sort((a,b)=>a-b),key=ids.join(',');
   const positive=(face[0]===ids[0]&&face[1]===ids[1])||(face[1]===ids[0]&&face[2]===ids[1])||(face[2]===ids[0]&&face[0]===ids[1]);
   const entry=unique.get(key)||{balance:0,positive:null,negative:null};entry.balance+=positive?1:-1;entry[positive?'positive':'negative']=face;unique.set(key,entry);
  }
  return {vertices,faces:[...unique.values()].filter(e=>e.balance!==0).map(e=>e.balance>0?e.positive:e.negative)};
 }
 function mesh(s,cache){return solidMesh(evaluate(s,cache));}
 // Fail closed if a future joint change opens the UV print face. This
 // checks the meshed output used by the viewer, STEP, STL and 3MF writers.
 function validatePanelFront(part,m,o){
  if(part.frontAssemblyComplex)return true;
  const r=part.frontRectangle||(part.type==='panel'&&part.cell?{x:part.cell.x,y:part.cell.y,z:o.front,w:part.cell.w,h:part.cell.h}:null);
  if(!r)return true;
  const eps=2e-5;let area=0,faceCount=0;
  for(const f of m.faces){
   const t=f.map(i=>m.vertices[i]);
   if(!t.every(v=>Math.abs(v[2]-r.z)<eps))continue;
   if(t.some(v=>v[0]<r.x-eps||v[0]>r.x+r.w+eps||v[1]<r.y-eps||v[1]>r.y+r.h+eps))
    throw Error(part.name+': the UV print face extends into a connector opening. Export stopped.');
   area+=Math.abs((t[1][0]-t[0][0])*(t[2][1]-t[0][1])-(t[1][1]-t[0][1])*(t[2][0]-t[0][0]))/2;faceCount++;
  }
  const expected=r.w*r.h;
  if(!faceCount||Math.abs(area-expected)>Math.max(.005,expected*2e-7))
   throw Error(part.name+': the UV print face is not a complete closed rectangle. Export stopped.');
  return true;
 }
 function bounds(m){let lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];for(let p of m.vertices)for(let i=0;i<3;i++){lo[i]=Math.min(lo[i],p[i]);hi[i]=Math.max(hi[i],p[i]);}return {min:lo,max:hi,size:hi.map((v,i)=>clean(v-lo[i]))};}
 function printMesh(m,o,part={}){
  const originalBounds=bounds(m);
  if(part.printFlip){if(part.type==='panel'||part.testGroup==='uv_joint')throw Error('UV panels must print face-down.');m={vertices:m.vertices.map(v=>[v[0],-v[1],-v[2]]),faces:m.faces};}
  const b=bounds(m);let rotation=0;
  if(part.type==='panel'||part.testGroup==='uv_joint'){
   if(part.printFlip)throw Error('Every UV face must print directly against the PEI bed. Face-up export is prohibited.');
   if(Number.isFinite(part.uvPlaneZ)&&Math.abs(b.min[2]-part.uvPlaneZ)>1e-5)
    throw Error('The UV face is not on the bed plane. Export stopped.');
  }
  if(o){rotation=bedRotation(b.size[0],b.size[1],o);if(rotation===null)throw Error('A generated part exceeds the usable bed, including margins.');}
  const vertices=m.vertices.map(p=>p.map((v,i)=>clean(v-b.min[i]))).map(p=>rotation===90?[clean(b.size[1]-p[1]),p[0],p[2]]:p);
  return {vertices,faces:m.faces,rotation};
 }
 function binarySTL(m){let bytes=new Uint8Array(84+m.faces.length*50),view=new DataView(bytes.buffer);let label=new TextEncoder().encode('Canvas Frame v3.51.6 | millimetres | 100 percent scale | supports off');bytes.set(label.slice(0,80));view.setUint32(80,m.faces.length,true);let k=84;
  for(let f of m.faces){let [a,b,c]=f.map(i=>m.vertices[i]),u=b.map((v,i)=>v-a[i]),v=c.map((v,i)=>v-a[i]),n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],l=Math.hypot(...n)||1;n=n.map(x=>x/l);for(let x of [...n,...a,...b,...c]){view.setFloat32(k,x,true);k+=4;}k+=2;}return bytes;
 }
 function scad(s){const a=x=>JSON.stringify(x);
  if(s.op==='box')return 'translate('+a(s.min)+') cube('+a(s.size)+');';
  if(s.op==='cylinder'||s.op==='curve_prism')return scad(curveAsPrism(s));
  if(s.op==='prism'||s.op==='loft'){let m=s.op==='prism'?prismMesh(s):loftMesh(s);return 'polyhedron(points='+a(m.vertices)+',faces='+a(m.faces.map(f=>[...f].reverse()))+',convexity=12);';}
  if(s.op==='transform')return 'multmatrix('+a([s.matrix.slice(0,4),s.matrix.slice(4,8),s.matrix.slice(8,12),[0,0,0,1]])+'){'+scad(s.base)+'}';
  if(s.op==='union')return 'union(){'+s.items.map(scad).join('\n')+'}';
  if(s.op==='cut')return 'difference(){'+scad(s.base)+'\n'+s.items.map(scad).join('\n')+'}';
  if(s.op==='intersect')return 'intersection(){'+s.items.map(scad).join('\n')+'}';
 }
 return {curvePoints,curveAsPrism,splitBezier,previewOffset,borderlessGrid,borderlessLayout,borderlessValidateLayout,borderlessJointBounds,borderlessReceiverBounds,borderlessParking,borderlessFlexureWindows,borderlessRearFlexures,borderlessTests,borderlessLatchDetails,borderlessDerive,borderlessBody,borderlessRim,borderlessRimDetails,borderlessStandLocal,borderlessReverseFrame,borderlessStandDisplay,borderlessHanger,borderlessJoints,standMountPose,mountTransform,hangerCuts,compactHanger,lightRetainers,lightRetainerDetails,lightRetainer,validatePanelFront,panelSeamSection,panelContinuousSeam,panelSeamCrossCorner,panelRailDetails,panelRailMale,panelRailSocket,blindFrameDetails,blindFrameJoint,jointDetails,derive,make,fitTest,panelFitTest,standFitTest,frameJointFitTest,frameRepairFitTest,selectedFitTests,frameFitKinds,frameShelfPoint,rearStandParts,standReceiverCuts,integralJoint,frameIntegral,panelCellJoints,standLatchGeometry,jointFaceplate,frameBody,bedRotation,shift,mesh,evaluate,solidMesh,bounds,printMesh,binarySTL,scad,prismMesh,loftMesh,box,F,J};
})();
if(typeof module!=='undefined')module.exports=FrameV3;
