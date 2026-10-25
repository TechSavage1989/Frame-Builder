from pathlib import Path
from playwright.sync_api import sync_playwright
import json,traceback,sys
W=Path(sys.argv[1]).resolve() if len(sys.argv)>1 else Path(__file__).resolve().parents[3];A=W/'Canvas_Frame_v3_50_8';out=A/'Validation'
r={'version':'3.50.8','browser':'Chromium headless','liveFusionExecuted':False,'checks':[],'errors':[]}
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
  page=browser.new_page(viewport={'width':1500,'height':1100});page.on('pageerror',lambda e:r['errors'].append(str(e)))
  page.set_content((A/'Canvas_Frame_v3_50_8_Builder_and_3D_Viewer.html').read_text())
  def ready(condition='true'):page.wait_for_function("CanvasFrameViewer?.getState().status==='ready' && ("+condition+")",timeout=180000)
  ready();page.select_option('#frameStyle','borderless');ready("MODEL.params.isBorderless");page.click('#tabFrame')
  def change(k,v):page.fill('#'+k,str(v));page.locator('#'+k).dispatch_event('change');ready(f'MODEL.params.{k}==={v}')
  for k,v,default in [('hangerThickness',3.2,1.6),('sacrificialTabThickness',.8,.4),('sacrificialTabWidth',1.6,.8)]:
   assert float(page.locator('#'+k).input_value())==default
   before=page.evaluate('MODEL.params.backThickness');change(k,v)
   assert page.evaluate('inputSnapshot(MODEL.params).'+k)==v
   assert page.evaluate('MODEL.params.backThickness')==before
   r['checks'].append({'name':'control and export snapshot: '+k,'value':v,'jointThicknessUnchanged':True})
  change('borderlessBase',2.4);page.click('#matchHangerBase');ready('MODEL.params.hangerThickness===2.4')
  assert float(page.locator('#hangerThickness').input_value())==2.4
  r['checks'].append({'name':'match rear base button', 'base_mm':2.4,'hanger_mm':2.4})
  # Do not silently accept a hidden thicker base beneath a thinner requested mount.
  page.fill('#hangerThickness','1.2');page.locator('#hangerThickness').dispatch_event('change')
  page.wait_for_function("document.getElementById('err').textContent.includes('at least the rear base')")
  assert page.locator('#download').is_disabled()
  r['checks'].append({'name':'hanger below base rejected, export disabled'})
  page.click('#matchHangerBase');ready('MODEL.params.hangerThickness===2.4')
  for k,v in [('borderlessBase',1.6),('sacrificialTabThickness',.4),('sacrificialTabWidth',.8)]:change(k,v)
  page.click('#matchHangerBase');ready('MODEL.params.hangerThickness===1.6')
  # Pure section joint model is not affected by a mounting thickness edit.
  data=page.evaluate('''() => {
   const a=FrameV3.derive({...getInput(),hangerThickness:1.6});
   const b=FrameV3.derive({...getInput(),hangerThickness:3.2});
   return {headA:FrameV3.borderlessStandLocal(a).items.slice(1,7),headB:FrameV3.borderlessStandLocal(b).items.slice(1,7),depthA:a.d,depthB:b.d,params:inputSnapshot(MODEL.params)};
  }''');assert data['headA']!=data['headB'];assert data['depthA']==data['depthB']==11
  r['checks'].append({'name':'stand rigid capture changes with hanger, not overall scale','defaultDepth_mm':11})
  page.locator('#hangerThickness').scroll_into_view_if_needed();page.screenshot(path=str(out/'Independent_Hanger_And_Tab_Controls_3_50_8.png'))
  page.select_option('#partSelect',str(page.evaluate("RAW.findIndex(x=>x.type==='foot')")))
  page.click('#cameraOrtho');page.click('#vFront');page.click('#vFit');page.screenshot(path=str(out/'Smooth_Easel_Profile_3_50_8.png'))
  r['checks'].append({'name':'native descriptors retained in app source', 'curves':page.evaluate("FrameV3.borderlessStandLocal(MODEL.params).items[0].base.segments.map(x=>x.kind)")})
  browser.close()
except Exception as e:r['errors'].append(str(e));traceback.print_exc()
(out/'NEW_CONTROLS_CHECKS.json').write_text(json.dumps(r,indent=2));print(json.dumps(r,indent=2))
if r['errors']:raise SystemExit(1)
