/* V3.1: expand or detach the existing live viewer without copying geometry.
   A same-origin about:blank window owns the same canvas and event handlers.
   Return/close restores those same nodes, preserving the full view state. */
(() => {
 const pane=$('viewerPane'),home=$('viewerHome'),placeholder=$('detachedPlaceholder');
 const expandButton=$('expandViewer'),detachButton=$('detachViewer');
 let popup=null,closedWatch=0,expanded=false,returning=false,mainClosing=false;
 let modalOutside=[],previousFocus=null;
 const focusOptions={preventScroll:true};
 function message(text=''){$('viewerMessage').textContent=text;$('viewerMessage').hidden=!text;}
 function clearGesture(){
  for(const id of pointers.keys()){try{if(canvas.hasPointerCapture(id))canvas.releasePointerCapture(id);}catch(_){}}
  pointers.clear();startGesture();
 }
 function refreshHost(){cancelViewerFrame();clearGesture();observeViewport();calculateFit();redraw();}
 function setExpanded(value,focus=true){
  if(popup)return;
  value=!!value;if(value===expanded)return;
  expanded=value;
  if(expanded){
   previousFocus=document.activeElement;
   modalOutside=[document.querySelector('header'),$('settingsSidebar'),$('detailsCard'),$('sidebarResize'),$('detailsResize')].filter(Boolean).map(el=>({el,inert:el.inert}));
   for(const item of modalOutside)item.el.inert=true;
   pane.setAttribute('role','dialog');pane.setAttribute('aria-modal','true');
  }else{
   for(const item of modalOutside)item.el.inert=item.inert;modalOutside=[];
   pane.setAttribute('role','region');pane.removeAttribute('aria-modal');
  }
  document.body.classList.toggle('viewer-expanded',expanded);pane.classList.toggle('is-expanded',expanded);
  expandButton.textContent=expanded?'Restore':'Expand';expandButton.setAttribute('aria-expanded',String(expanded));
  expandButton.title=expanded?'Restore the embedded viewer (Escape)':'Expand the viewer to fill this browser window';
  refreshHost();
  if(focus){if(expanded)expandButton.focus(focusOptions);else (previousFocus&&previousFocus.isConnected?previousFocus:expandButton).focus(focusOptions);}
 }
 function restoreViewer({fromClose=false,focus=true}={}){
  if(returning||!popup)return;
  returning=true;
  const old=popup;popup=null;
  if(closedWatch){clearInterval(closedWatch);closedWatch=0;}
  cancelViewerFrame();
  // appendChild adopts the live nodes back into the builder document.
  home.insertBefore(pane,placeholder);placeholder.hidden=true;
  detachButton.textContent='Detach';detachButton.title='Move the live viewer to a separate window';
  pane.removeAttribute('data-detached');
  message();refreshHost();returning=false;
  if(!fromClose&&!old.closed){try{old.close();}catch(_){}}
  if(focus){try{window.focus();}catch(_){}detachButton.focus(focusOptions);}
 }
 function detachViewer(){
  if(popup&&!popup.closed){restoreViewer();return;}
  message();
  let next;
  try{
   const width=Math.max(640,Math.min(1200,(window.screen.availWidth||1280)-70));
   const height=Math.max(480,Math.min(900,(window.screen.availHeight||900)-70));
   // Keep this call in the user's click handler so it can pass popup policies.
   next=window.open('about:blank','_blank','popup=yes,width='+width+',height='+height+',resizable=yes,scrollbars=yes');
   if(!next||next.closed){message('The browser blocked the viewer window. Allow pop-ups for this file, then select Detach again.');return;}
   const d=next.document;
   d.title='Frame and panel | 3D viewer';d.documentElement.lang='en';
   const meta=d.createElement('meta');meta.name='viewport';meta.content='width=device-width,initial-scale=1';d.head.appendChild(meta);
   for(const original of document.querySelectorAll('style')){const style=d.createElement('style');style.textContent=original.textContent;d.head.appendChild(style);}
   d.body.className='detached-viewer';
   if(expanded)setExpanded(false,false);
   cancelViewerFrame();clearGesture();popup=next;
   d.body.appendChild(pane);placeholder.hidden=false;
   pane.dataset.detached='true';detachButton.textContent='Return to builder';detachButton.title='Return this live viewer to the main builder';
   // Expose the same read-only diagnostics, not a second application instance.
   next.CanvasFrameViewer=window.CanvasFrameViewer;
   const onClose=()=>{if(popup===next&&!mainClosing)restoreViewer({fromClose:true,focus:false});};
   next.addEventListener('beforeunload',onClose);next.addEventListener('pagehide',onClose);
   next.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();restoreViewer();}});
   next.addEventListener('focus',()=>{if(popup===next)redraw();});
   closedWatch=setInterval(()=>{if(popup&&popup.closed&&!mainClosing)restoreViewer({fromClose:true,focus:false});},500);
   refreshHost();next.focus();canvas.focus(focusOptions);
  }catch(error){
   if(popup)restoreViewer({focus:false});
   else if(next&&!next.closed){try{next.close();}catch(_){}}
   message('The separate viewer could not open. The embedded viewer is still available. '+error.message);
   console.warn('Viewer detach:',error);
  }
 }
 expandButton.addEventListener('click',()=>setExpanded(!expanded));
 detachButton.addEventListener('click',detachViewer);
 $('returnViewer').addEventListener('click',()=>restoreViewer());
 $('focusViewer').addEventListener('click',()=>{if(popup&&!popup.closed){popup.focus();redraw();}else if(popup)restoreViewer();});
 document.addEventListener('keydown',e=>{
  if(!expanded)return;
  if(e.key==='Escape'){e.preventDefault();setExpanded(false);return;}
  if(e.key!=='Tab')return;
  const controls=[...pane.querySelectorAll('button:not(:disabled),select:not(:disabled),input:not(:disabled),[tabindex="0"]')].filter(el=>el.getClientRects().length);
  if(!controls.length)return;
  const first=controls[0],last=controls[controls.length-1];
  if(e.shiftKey&&(document.activeElement===first||!pane.contains(document.activeElement))){e.preventDefault();last.focus(focusOptions);}
  else if(!e.shiftKey&&(document.activeElement===last||!pane.contains(document.activeElement))){e.preventDefault();first.focus(focusOptions);}
 });
 window.addEventListener('pagehide',()=>{
  mainClosing=true;if(closedWatch)clearInterval(closedWatch);
  if(popup&&!popup.closed){try{popup.close();}catch(_){}}
 });
 window.addEventListener('pageshow',()=>{mainClosing=false;});
 window.CanvasFrameWorkspace=Object.freeze({getState:()=>({mode:popup?'detached':expanded?'expanded':'embedded',popupOpen:!!popup&&!popup.closed,ownerIsBuilder:canvas.ownerDocument===document})});
})();
