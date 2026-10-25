from pathlib import Path
import json,sys,math,itertools,traceback,time
W=Path(sys.argv[1]).resolve() if len(sys.argv)>1 else Path(__file__).resolve().parents[3];A=W/'Canvas_Frame_v3_50_8';F=W/'Print_Frame_Fusion_Builder_1.2.0'
sys.path[:0]=[str(A/'Source'),str(F)]
from export_step import Builder
from PrintFrameFusion import model as M
import cadquery as cq
report={'application':'3.50.8','fusionBuilder':'1.2.0','liveFusionExecuted':False,'physicalPrintTested':False,'checks':[],'errors':[]}
def rec(name,**kw):
 report['checks'].append({'name':name,**kw}); print(name,kw,flush=True)
def one(s):assert s.isValid() and len(s.Solids())==1
def volume(s):return abs(s.Volume()) if s.Solids() else 0
def diff(a,b):return volume(a.cut(b))+volume(b.cut(a))
def receiver(v):
 B=v['HangerThickness'];k=v['HangerInset']
 hole=M.transform(M.local_hanger(),[0,0,1,-B,0,-1,0,k,-1,0,0,1.6,0,0,0,1])
 return M.numeric(M.cut(M.box(-B,k-14,-7.4,B,36,18),hole),v)
try:
 for c in json.loads((W/'parameter_cases.json').read_text()):
  v=M.parameter_values({'HangerThickness':c['H'],'RearBaseThickness':c['base'],'LatchSpringBias':c['bias']})
  b=Builder();a=b.build(c['stand']);f=b.build(M.numeric(M.stand_local(),v));one(a);one(f)
  delta=diff(a,f);assert delta<1e-6,(c['H'],c['bias'],delta)
  assert abs(v['FrameDepth']-c['params']['d'])<1e-6
  solid=b.build(receiver(v));one(solid);seat=b.build(c['seated']);one(seat)
  overlap=volume(seat.intersect(solid));assert overlap<1e-5,(c['H'],c['bias'],overlap)
  assert 'CIRCLE' in {e.geomType() for e in solid.Edges()}
  if c['bias']>0:assert {'BSPLINE','BEZIER'} & {e.geomType() for e in f.Edges()}
  # All physical rigid capture faces follow receiver thickness exactly.
  ss=M.numeric(M.stand_local(),v)['items'];near=ss[3]['min'][0];far=ss[2]['min'][0]+ss[2]['size'][0]
  assert abs((near-far)-(c['H']+2*v['MountClearance']))<1e-8
  rec('analytic app/Fusion parity and receiver seating',hanger_mm=c['H'],bias_mm=c['bias'],difference_mm3=delta,seated_interference_mm3=overlap,native_circular_edges=True)
 for H,E in itertools.product([1.2,1.6,3.2,5],[1,1.6,2]):
  v=M.parameter_values({'HangerThickness':H,'RearBaseThickness':min(H,1.6),'LatchEngagementDepth':E});b=Builder();rf=b.build(receiver(v));seat=b.build(M.numeric(M.stand_local('seated'),v));k=v['HangerInset']
  pull=volume(seat.translate((.35,0,0)).intersect(rf));up=volume(seat.translate((0,.45,0)).intersect(rf));assert pull>.01 and up>.01
  rb=-(E-.10)/M.latch_shape_factor(18.4);released=b.build(M.numeric(M.stand_local(rb),v));one(released)
  maxvol=0;count=0
  for y in [i*.5 for i in range(17)]:maxvol=max(maxvol,volume(released.translate((0,y,0)).intersect(rf)));count+=1
  for x in [i*.5 for i in range(19)]:maxvol=max(maxvol,volume(released.translate((x,8,0)).intersect(rf)));count+=1
  assert maxvol<1e-5,(H,E,maxvol)
  rock=[]
  for pivot in [k-8,k+10]:
   for ang in [-2.5,2.5]:
    vol=volume(seat.translate((.1,0,0)).rotate((0,pivot,0),(0,pivot,1),ang).intersect(rf));assert vol>.002,(H,E,pivot,ang,vol);rock.append(vol)
  rec('captured stand and deliberate release envelope',hanger_mm=H,tooth_mm=E,pull_interference_mm3=pull,reverse_slide_interference_mm3=up,max_released_interference_mm3=maxvol,release_samples=count,rocking_samples=len(rock),scope='Prescribed deflection and sampled rigid motion, not a force or fatigue test')
 # Three tabs stay on rigid areas, at the rear bed face; settings remain independent.
 for th,tw in itertools.product([.2,.4,1.0],[.4,.8,2.]):
  v=M.parameter_values({'SacrificialTabThickness':th,'SacrificialTabWidth':tw});tabs=M.numeric(M.parking_tabs(),v)
  assert len(tabs)==3
  for tab in tabs:
   assert abs(tab['size'][2]-th)<1e-8 and abs(tab['size'][1]-tw)<1e-8
   assert abs(tab['min'][2]+th-v['FrameDepth'])<1e-8
  rec('tab parameter dimensions and rear-plane attachment',thickness_mm=th,width_mm=tw,bridges=3)
 for name in ['full_180','full_220','full_256','full_300','full_thick_hanger']:
  b=Builder();data=json.loads((W/(name+'.json')).read_text());entries=[]
  for p in data['parts']:
   sh=b.build(p['spec']);one(sh);entries.append({'part':p['name'],'volume_mm3':sh.Volume()})
  rec('all generated components are valid connected solids',case=name,parts=entries,frame_sections=data['params']['count'])
 count=0
 for base,H,J,th,tw,bias in itertools.product([1.2,1.6,3.2],[1.2,1.6,3.2,5],[3.2,5],[.2,.4,1],[.4,.8,2],[0,.5,.6]):
  r=M.make_recipe({'RearBaseThickness':base,'HangerThickness':H,'ConnectorPadThickness':J,'SacrificialTabThickness':th,'SacrificialTabWidth':tw,'LatchSpringBias':bias},layout=1,mode='mount_test')
  ok=not M.validate_recipe(r)['errors'];assert ok==(H>=base and J>=base and th<=base);count+=1
 rec('parameter rule combinations',count=count,invalid_combinations_rejected=True)
 # Exact native STEP import round trip for curved mount examples.
 dest=A/'Fit_Tests/Adjustable_Shared_Mount/Native_CAD';dest.mkdir(parents=True,exist_ok=True)
 r=M.make_recipe(layout=1,mode='mount_test');b=Builder()
 for p in r['test_bodies']:
  sh=b.build(M.numeric(p['shape'],r['values']));bb=sh.BoundingBox();sh=sh.translate((-bb.xmin,-bb.ymin,-bb.zmin));fn=dest/(p['name']+'.step');cq.exporters.export(sh,str(fn));imp=cq.importers.importStep(str(fn)).val();one(imp)
  assert diff(sh,imp)<1e-4;types={e.geomType() for e in imp.Edges()}
  assert 'CIRCLE' in types
  rec('analytic STEP reimport',part=p['name'],edge_types=sorted(types),difference_mm3=diff(sh,imp))
except Exception as exc:
 report['errors'].append(str(exc));traceback.print_exc()
finally:
 for r in [A,F]:(r/'Validation/ANALYTIC_GEOMETRY_CHECKS.json').write_text(json.dumps(report,indent=2))
 print('ERRORS',report['errors'],flush=True)
 if report['errors']:sys.exit(1)
