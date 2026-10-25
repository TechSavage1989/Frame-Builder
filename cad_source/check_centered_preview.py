"""Actual Chromium UI regression for the smaller-bed/tabletop explode bug."""
from pathlib import Path
import json, zipfile, os, traceback
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parent.parent
out=root/'Validation'
report={'version':'3.51.0','physicalPrintTested':False,'windowsLaunchTested':False,'tests':[],'downloads':[],'pageErrors':[],'errors':[]}
def record(name,**data):
    report['tests'].append({'test':name,**data});print('PASS',name,flush=True)
try:
 with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path=os.environ.get('CANVAS_BROWSER_EXECUTABLE','/usr/bin/chromium'),headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':1400,'height':1140},accept_downloads=True)
    page.on('pageerror',lambda e:report['pageErrors'].append(str(e)))
    page.set_content((root/'Canvas_Frame_v3_51_0_Builder_and_3D_Viewer.html').read_text(),wait_until='load')
    def ready(condition='true'):
        page.wait_for_function("() => CanvasFrameViewer?.getState().status==='ready' && ("+condition+")",timeout=180000)
        assert not page.locator('#err').inner_text()
    ready();assert page.evaluate('CanvasFrameViewer.version')=='3.51.0'
    page.select_option('#frameStyle','borderless');ready("CanvasFrameViewer.getModel().params.frameStyle==='borderless'")
    page.locator('#tabFrame').click()
    new_controls={'borderlessWall':(1.2,.8),'borderlessBase':(1.6,1.4),'borderlessCorner':(12,14),'borderlessBack':(3.2,3.6),'latchArm':(1.8,1.9),'latchEngagement':(1.6,1.7),'latchSpringBias':(.50,.20)}
    for key,(default,changed) in new_controls.items():
        assert float(page.locator('#'+key).input_value())==default
        page.fill('#'+key,str(changed))
        page.locator('#'+key).dispatch_event('change')
        ready(f"Math.abs(MODEL.params.{key}-{changed})<1e-8")
        record('numeric control updates generated model: '+key,changedValue=changed)
    page.evaluate("(controls)=>{for(const [key,values] of Object.entries(controls))document.getElementById(key).value=values[0];document.getElementById('borderlessWall').dispatchEvent(new Event('input',{bubbles:true}));}",new_controls)
    ready("MODEL.params.borderlessWall===1.2 && MODEL.params.borderlessBase===1.6 && MODEL.params.latchSpringBias===.50 && MODEL.params.borderlessBack===3.2")
    settings=page.evaluate('inputSnapshot(MODEL.params)')
    for key,(default,changed) in new_controls.items():assert abs(settings[key]-default)<1e-8
    record('all new settings retained in export snapshot',settings={key:settings[key] for key in new_controls})
    page.locator('#borderlessWall').scroll_into_view_if_needed()
    page.screenshot(path=str(out/'Thin_Backing_Controls_3_50_8.png'))
    assert page.locator('#latchPreload').count()==0
    shapes=[]
    for bias in [0,.50,.60]:
        page.fill('#latchSpringBias',str(bias));page.locator('#latchSpringBias').dispatch_event('change')
        ready(f'MODEL.params.latchSpringBias==={bias}')
        values=page.evaluate("({latch:MODEL.params.standLatch,shape:JSON.stringify(RAW.find(p=>p.type==='foot').spec)})")
        assert values['latch']['springBias_mm']==bias and values['latch']['preloadBlock'] is False
        shapes.append(values['shape'])
        index=page.evaluate("RAW.findIndex(p=>p.type==='foot')")
        page.select_option('#partSelect',str(index));page.locator('#cameraOrtho').click();page.locator('#vFront').click();page.locator('#vFit').click()
        page.locator('#canvasWrap').screenshot(path=str(out/('Curved_Spring_'+str(bias).replace('.','_')+'.png')))
    assert len(set(shapes))==3
    record('Bias visibly changes the complete free spring profile, with no preload block',testedBiases_mm=[0,.50,.60])
    page.fill('#latchSpringBias','0.50');page.locator('#latchSpringBias').dispatch_event('change');ready('MODEL.params.latchSpringBias===.50')
    page.select_option('#partSelect',str(page.evaluate("RAW.findIndex(p=>p.type==='foot')")))
    page.locator('#latchSpringBias').scroll_into_view_if_needed();page.locator('#vFit').click()
    page.screenshot(path=str(out/'Curved_Spring_Controls_3_50_8.png'))
    page.select_option('#partSelect','all')
    page.locator('#tabPrinter').click();page.locator('#panelToggle').uncheck();page.locator('#cameraOrtho').click();page.locator('#vBack').click()
    for bed,sections in [(180,4),(220,2),(256,2),(300,1)]:
        page.select_option('#bedPreset',str(bed)+','+str(bed));ready(f'CanvasFrameViewer.getModel().params.bedX==={bed}')
        assert page.evaluate('CanvasFrameViewer.getState().explode')==0
        assert page.evaluate('CanvasFrameViewer.getModel().params.count')==sections
        result=page.evaluate('''() => {
          const o=MODEL.params;let maxError=0;
          for(const p of RAW.filter(p=>p.type==='frame')){
           const s=SCENE.find(s=>s.name===p.name),mesh=p.displayMesh||p.mesh;
           for(let i=0;i<mesh.vertices.length;i++){
            const q=FrameV3.frameShelfPoint(mesh.vertices[i],o);
            for(let k=0;k<3;k++)maxError=Math.max(maxError,Math.abs(q[k]-s.vertices[i][k]));
           }
          }
          return {maxError,center:o.frameCenter,hangers:o.hangerLocations,split:o.splitValidation};
        }''')
        assert result['maxError']<1e-7 and result['split']['allTonguesMatched']
        page.locator('#vFit').click()
        page.screenshot(path=str(out/f'Centered_Assembly_{bed}_3_50_8.png'))
        record(f'{bed} mm bed: actual scene matches centered assembled geometry',sections=sections,**result)
        page.evaluate("()=>{document.getElementById('explode').value='28';document.getElementById('explode').dispatchEvent(new Event('input',{bubbles:true}));}")
        assert page.locator('#assemblyViewNotice').is_visible()
        displaced=page.evaluate('''() => {
          const o=MODEL.params;let maxError=0;const offsets=[];
          for(const p of RAW.filter(p=>p.type==='frame')){
           const c=p.displayCell||p.cell,dx=Math.abs(c.x+c.w/2-o.ow/2)<.1?0:Math.sign(c.x+c.w/2-o.ow/2)*28,dy=Math.abs(c.y+c.h/2-o.oh/2)<.1?0:Math.sign(c.y+c.h/2-o.oh/2)*28;
           const s=SCENE.find(s=>s.name===p.name),mesh=p.displayMesh||p.mesh;
           for(let i=0;i<mesh.vertices.length;i++){
            const v=mesh.vertices[i],q=FrameV3.frameShelfPoint([v[0]+dx,v[1]+dy,v[2]],o);
            for(let k=0;k<3;k++)maxError=Math.max(maxError,Math.abs(q[k]-s.vertices[i][k]));
           }
           offsets.push({name:p.name,dx,dy});
          }
          return {maxError,offsets};
        }''')
        assert displaced['maxError']<1e-7
        record(f'{bed} mm bed: 28 mm exploded view separates displayed sections outward',**displaced)
        if bed==180:
            page.locator('#vFit').click();page.screenshot(path=str(out/'Exploded_Assembly_180_3_50_8.png'))
        # Leave the slider at 28. Changing the next bed must reset it without
        # pressing a reset button, reproducing the user's original sequence.
    page.locator('#resetAssemblyView').click()
    assert page.evaluate('CanvasFrameViewer.getState().explode')==0
    assert not page.locator('#assemblyViewNotice').is_visible()
    record('Show assembled returns to true assembly without changing the geometry')
    page.select_option('#bedPreset','180,180');ready('CanvasFrameViewer.getModel().params.bedX===180')
    page.locator('#tabFrame').click();page.select_option('#displayOrientation','landscape');ready("CanvasFrameViewer.getModel().params.displayOrientation==='landscape'")
    assert page.evaluate('CanvasFrameViewer.getModel().params.hangerLocations.length')==2
    page.evaluate("()=>{document.getElementById('explode').value='28';document.getElementById('explode').dispatchEvent(new Event('input'));}")
    page.select_option('#standType','none');ready('!CanvasFrameViewer.getModel().params.includeStand')
    assert page.evaluate('CanvasFrameViewer.getState().explode')==0
    record('Landscape and wall/tabletop changes return to assembled view and retain two centered mounts')
    # More demanding split that relocates, rather than resizes, the parked stand.
    page.evaluate("()=>{document.getElementById('w').value='406.4';document.getElementById('h').value='508';document.getElementById('standType').value='breakaway';update();}")
    ready('CanvasFrameViewer.getModel().params.w===406.4 && CanvasFrameViewer.getModel().params.includeStand')
    assert page.evaluate('CanvasFrameViewer.getModel().params.standParking.rotationDegrees')==90
    record('16 x 20 frame on a 180 mm bed retains unchanged mount geometry with rotated parked easel')
    page.evaluate("()=>{document.getElementById('w').value='203.2';document.getElementById('h').value='254';document.getElementById('displayOrientation').value='portrait';document.getElementById('bedX').value='256';document.getElementById('bedY').value='256';update();}")
    ready('CanvasFrameViewer.getModel().params.w===203.2 && CanvasFrameViewer.getModel().params.bedX===256')
    page.locator('#panelToggle').check()
    plan=page.evaluate('async()=>await CanvasFramePrintPlates.prepare()')
    assert plan['bed']['safety']['frontReserved_mm']>=20
    assert plan['bed']['safety']['toolpathPadding_mm']>=7
    record('Reserved cutter/calibration areas and saved brim allowance retained',plateCount=plan['plateCount'])
    folder=out/'Browser_Downloads';folder.mkdir(exist_ok=True)
    for fmt in ['3mf','stl','step']:
        page.select_option('#exportFormat',fmt)
        with page.expect_download(timeout=240000) as dl: page.locator('#download').click()
        download=dl.value;target=folder/download.suggested_filename;download.save_as(target)
        with zipfile.ZipFile(target) as z:
            assert z.testzip() is None
            for name in z.namelist():
                if name.endswith('Print_List.json') or name.endswith('Part_List.json'):
                    data=json.loads(z.read(name));assert data['version']=='3.51.0'
                    assert data['borderless']['splitValidation']['allTonguesMatched']
        report['downloads'].append({'format':fmt,'file':target.name,'bytes':target.stat().st_size,'zipIntegrity':True})
        record(fmt.upper()+' export generated from corrected application')
    assert not report['pageErrors'],report['pageErrors']
    browser.close()
except Exception as e:
 report['errors'].append(traceback.format_exc());print(report['errors'][-1],flush=True)
finally:
 (out/'Centered_Preview_Checks.json').write_text(json.dumps(report,indent=2))
 if report['errors'] or report['pageErrors']:raise SystemExit(1)
 print('ALL PREVIEW AND DOWNLOAD CHECKS PASSED',flush=True)
