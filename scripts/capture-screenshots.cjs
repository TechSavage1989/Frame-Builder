'use strict';
// Development-only. Supply Playwright and optionally PLAYWRIGHT_CHROMIUM_EXECUTABLE.
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
const root=path.resolve(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||undefined,args:['--no-sandbox','--enable-unsafe-swiftshader']});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(pathToFileURL(path.join(root,'app/index.html')).href);
  const ready=()=>page.waitForFunction(()=>CanvasFrameViewer.getState().status==='ready',null,{timeout:120000});
  const settle=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  async function shot(name,target=page){await settle();await target.screenshot({path:path.join(root,'docs/images',name+'.png')});console.log(name);}
  async function style(value){await page.selectOption('#frameStyle',value);await ready();}
  await ready();await shot('hero');
  await style('original');await page.click('#loadView');await shot('style-original-snap');
  await page.click('#loadView');await style('solid');await page.click('#loadView');await shot('style-top-loading');
  await page.click('#loadView');await style('borderless');await page.click('#detailAssemblyTab');
  for(let i=0;i<6;i++)await page.locator('#detailsResize').press('Shift+ArrowUp');
  await page.click('#detailAssemblyTab');await shot('front-snap-borderless');
  await page.click('#detailsToggle');await style('light');await page.click('#tabFrame');await shot('frame-settings');
  await page.click('#tabPanel');await page.selectOption('#preset','457.2,609.6');await ready();
  await page.evaluate(()=>{$('explode').value='20';$('explode').dispatchEvent(new Event('input'));});await shot('large-panel-sections');
  await page.selectOption('#preset','203.2,254');await ready();await page.click('#detailPartsTab');
  await page.evaluate(()=>{$('explode').value='25';$('explode').dispatchEvent(new Event('input'));});await shot('exploded-assembly');
  await page.selectOption('#partSelect','0');await shot('inspect-part');
  await page.selectOption('#partSelect','all');await page.click('#resetAssemblyView');await page.click('#detailsToggle');
  const popupPromise=page.waitForEvent('popup');await page.click('#detachViewer');const popup=await popupPromise;
  await popup.waitForLoadState();await popup.setViewportSize({width:1100,height:800});await shot('detached-viewer',popup);await popup.close();
  await page.waitForFunction(()=>CanvasFrameWorkspace.getState().mode==='embedded');
  await page.click('#tabPrinter');await shot('printer-settings');
  await page.click('#openPrintPlates');await page.waitForFunction(()=>CanvasFramePrintPlates.getState().layout&&!CanvasFramePrintPlates.getState().working,null,{timeout:120000});await shot('print-plates');
  await page.click('#moreExports');await shot('export-options');
  if(errors.length)throw Error(errors.join('\n'));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
