/* Resizable workspace panels. This module never regenerates geometry or resets
 * the camera. The renderer's ResizeObserver follows the canvas container.
 * Save preferred dimensions, not temporary small-window clamps, so a larger
 * window restores the user's chosen layout. Storage is optional on file URLs.
 */
(() => {
 const root=document.documentElement,workspace=$('workspace'),stage=$('previewStage');
 const sidebar=$('settingsSidebar'),details=$('detailsCard');
 const sideHandle=$('sidebarResize'),detailHandle=$('detailsResize');
 const mobile=window.matchMedia('(max-width:800px)');
 const storageKey='canvas-frame.workspace-panels.v1';
 const collapsedHeight=43;
 let preferredWidth=null,preferredHeight=null,frame=0,dragState=null,storageAvailable=true;
 let limits={widthMin:272,widthMax:640,heightMin:120,heightMax:600};
 const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
 const finiteSize=n=>typeof n==='number'&&Number.isFinite(n)&&n>=80&&n<=4000?n:null;
 const open=()=>!details.classList.contains('is-collapsed');
 const pixels=(name,fallback)=>parseFloat(getComputedStyle(root).getPropertyValue(name))||fallback;
 const defaults=()=>({width:pixels('--sidebar-default-width',326),height:pixels('--details-default-height',210)});
 function style(name,value){const text=Math.round(value)+'px';if(root.style.getPropertyValue(name)!==text)root.style.setProperty(name,text);}
 function selectedTab(){return document.querySelector('[data-detail][aria-selected="true"]')?.dataset.detail||'Overview';}
 function save(){
  try{localStorage.setItem(storageKey,JSON.stringify({version:1,sidebarWidth:preferredWidth,detailsHeight:preferredHeight,detailsOpen:open(),detailTab:selectedTab()}));storageAvailable=true;}
  catch(_){storageAvailable=false;}
 }
 function restore(){
  try{
   const data=JSON.parse(localStorage.getItem(storageKey)||'null');
   if(!data||data.version!==1)return;
   preferredWidth=finiteSize(data.sidebarWidth);preferredHeight=finiteSize(data.detailsHeight);
   if(['Overview','Parts','Plates','Assembly','Export'].includes(data.detailTab)){
    for(const b of document.querySelectorAll('[data-detail]')){
     const active=b.dataset.detail===data.detailTab;b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1;$('detail'+b.dataset.detail).hidden=!active;
    }
   }
   setDetailsOpen(data.detailsOpen===true,false);
  }catch(_){storageAvailable=false;}
 }
 function aria(handle,min,max,value,description){
  handle.setAttribute('aria-valuemin',String(Math.round(min)));handle.setAttribute('aria-valuemax',String(Math.round(max)));
  handle.setAttribute('aria-valuenow',String(Math.round(value)));handle.setAttribute('aria-valuetext',description);
 }
 function apply(){
  if(frame){cancelAnimationFrame(frame);frame=0;}
  const d=defaults(),small=mobile.matches,ws=getComputedStyle(workspace);
  const available=workspace.clientWidth-parseFloat(ws.paddingLeft)-parseFloat(ws.paddingRight);
  limits.widthMax=Math.max(limits.widthMin,Math.min(640,available-pixels('--column-handle-width',12)-440));
  const width=clamp(preferredWidth??d.width,limits.widthMin,limits.widthMax);
  style('--sidebar-width',width);
  sideHandle.tabIndex=small?-1:0;
  sideHandle.setAttribute('aria-disabled',String(small));
  aria(sideHandle,limits.widthMin,limits.widthMax,width,Math.round(width)+' screen pixels wide');
  // Reflow the toolbar before calculating the minimum useful model area.
  stage.classList.toggle('is-narrow',stage.clientWidth<680);
  if(small){
   limits.heightMax=Math.max(320,Math.min(900,Math.round(window.innerHeight*.9)));
  }else{
   let chrome=0;
   if($('viewerPane').ownerDocument===document){
    for(const child of $('viewerPane').children){if(child!==$('canvasWrap')&&!child.hidden)chrome+=child.getBoundingClientRect().height;}
   }else chrome=110; // detached placeholder, with room for its return controls
   const minViewer=Math.max(280,chrome+152);
   limits.heightMax=Math.max(80,Math.floor(stage.clientHeight-pixels('--row-handle-height',10)-minViewer));
  }
  limits.heightMin=Math.min(120,limits.heightMax);
  const height=clamp(preferredHeight??d.height,limits.heightMin,limits.heightMax);
  style('--details-height',height);
  aria(detailHandle,collapsedHeight,limits.heightMax,open()?height:collapsedHeight,open()?Math.round(height)+' screen pixels high':'Collapsed');
  detailHandle.title=small?'Drag the bottom edge up or down to resize details. Double-click to reset.':'Drag up or down to resize details. Drag up to open when collapsed. Double-click to reset.';
 }
 function requestApply(){if(!frame)frame=requestAnimationFrame(apply);}
 function changed(){apply();save();}
 function setHeight(height){
  if(height<=(collapsedHeight+limits.heightMin)/2){setDetailsOpen(false,false);}
  else{preferredHeight=clamp(height,limits.heightMin,limits.heightMax);setDetailsOpen(true,false);}
 }
 function reset(kind){
  if(dragState)finish(true);
  if(!kind||kind==='side')preferredWidth=null;
  if(!kind||kind==='details'){preferredHeight=null;if(kind)setDetailsOpen(true,false);}
  changed();
 }
 function finish(cancel=false){
  if(!dragState)return;
  const d=dragState;dragState=null;
  if(cancel){preferredWidth=d.previousWidth;preferredHeight=d.previousHeight;setDetailsOpen(d.previousOpen,false);}
  d.handle.classList.remove('is-dragging');
  document.body.classList.remove('resizing-panels','resizing-sidebar','resizing-details');
  try{if(d.handle.hasPointerCapture(d.id))d.handle.releasePointerCapture(d.id);}catch(_){}
  apply();save();
 }
 function bind(handle,kind){
  handle.addEventListener('pointerdown',e=>{
   if(e.button!==0||!e.isPrimary||(kind==='side'&&mobile.matches))return;
   if(dragState)finish(false);
   e.preventDefault();apply();handle.focus({preventScroll:true});
   dragState={handle,kind,id:e.pointerId,x:e.clientX,y:e.clientY,
    width:sidebar.getBoundingClientRect().width,height:details.getBoundingClientRect().height,
    previousWidth:preferredWidth,previousHeight:preferredHeight,previousOpen:open(),small:mobile.matches,moved:false};
   handle.classList.add('is-dragging');document.body.classList.add('resizing-panels',kind==='side'?'resizing-sidebar':'resizing-details');
   try{handle.setPointerCapture(e.pointerId);}catch(_){finish(true);}
  });
  document.addEventListener('pointermove',e=>{
   const d=dragState;if(!d||d.handle!==handle||d.id!==e.pointerId)return;
   e.preventDefault();e.stopPropagation();
   const delta=kind==='side'?e.clientX-d.x:(e.clientY-d.y)*(d.small?1:-1);
   if(!d.moved&&Math.abs(delta)<3)return;
   d.moved=true;
   if(kind==='side')preferredWidth=clamp(d.width+delta,limits.widthMin,limits.widthMax);
   else setHeight(d.height+delta);
   requestApply();
  },{capture:true,passive:false});
  // Document-level completion is also a fallback for browsers that drop
  // pointer capture when a panel opens or moves under the pointer.
  document.addEventListener('pointerup',e=>{if(dragState?.id===e.pointerId&&dragState.handle===handle){e.stopPropagation();finish(false);}},true);
  document.addEventListener('pointercancel',e=>{if(dragState?.id===e.pointerId&&dragState.handle===handle)finish(true);},true);
  handle.addEventListener('lostpointercapture',e=>{if(dragState?.id===e.pointerId&&dragState.handle===handle)finish(false);});
  handle.addEventListener('dblclick',e=>{e.preventDefault();reset(kind);});
  handle.addEventListener('keydown',e=>{
   if(e.key==='Escape'){if(dragState){e.preventDefault();finish(true);}return;}
   if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','Enter'].includes(e.key))return;
   if(kind==='side'&&mobile.matches)return;
   if(kind==='side'&&['ArrowUp','ArrowDown'].includes(e.key))return;
   if(kind==='details'&&['ArrowLeft','ArrowRight'].includes(e.key))return;
   e.preventDefault();e.stopPropagation();
   if(e.key==='Enter'){reset(kind);return;}
   apply();const step=e.shiftKey?32:8;
   if(kind==='side'){
    const value=e.key==='Home'?limits.widthMin:e.key==='End'?limits.widthMax:sidebar.getBoundingClientRect().width+(e.key==='ArrowRight'?step:-step);
    preferredWidth=clamp(value,limits.widthMin,limits.widthMax);
   }else{
    let value;
    if(e.key==='Home')value=collapsedHeight;
    else if(e.key==='End')value=limits.heightMax;
    else{
     const grow=mobile.matches?e.key==='ArrowDown':e.key==='ArrowUp';
     value=open()?details.getBoundingClientRect().height+(grow?step:-step):(grow?limits.heightMin:collapsedHeight);
     // Permit a keyboard user to collapse rather than stick at the minimum.
     if(!grow&&value<limits.heightMin)value=collapsedHeight;
    }
    setHeight(value);
   }
   changed();
  });
 }
 restore();bind(sideHandle,'side');bind(detailHandle,'details');
 $('resetLayout').addEventListener('click',()=>reset());
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&dragState){e.preventDefault();finish(true);}});
 window.addEventListener('blur',()=>finish(false));
 window.addEventListener('resize',()=>{if(dragState)finish(false);requestApply();});
 window.addEventListener('pagehide',()=>{if(dragState)finish(false);else save();});
 const sizeObserver=new ResizeObserver(requestApply);
 sizeObserver.observe(workspace);sizeObserver.observe(stage);
 for(const child of $('viewerPane').children)if(child!==$('canvasWrap'))sizeObserver.observe(child);
 new MutationObserver(requestApply).observe($('viewerHome'),{childList:true});
 panelLayout={changed};apply();
 // Read-only state for validation. Reset is the same action as the UI button.
 window.CanvasFramePanels=Object.freeze({
  reset:()=>reset(),
  getState:()=>({sidebarWidth:Math.round(sidebar.getBoundingClientRect().width),detailsHeight:Math.round(details.getBoundingClientRect().height),
   preferredSidebarWidth:preferredWidth,preferredDetailsHeight:preferredHeight,detailsOpen:open(),detailTab:selectedTab(),
   mobile:mobile.matches,storageAvailable,limits:{...limits},dragging:!!dragState})
 });
})();
