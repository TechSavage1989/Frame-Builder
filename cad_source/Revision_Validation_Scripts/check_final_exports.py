from pathlib import Path
import trimesh, json, cadquery as cq, traceback, sys
W=Path(sys.argv[1]).resolve() if len(sys.argv)>1 else Path(__file__).resolve().parents[3];A=W/'Canvas_Frame_v3_50_8'
r={'version':'3.50.8','scope':'Final shipped STL watertightness, STEP reimport and preset input persistence','files':[],'errors':[]}
try:
 for root in [A/'Presets',A/'Fit_Tests']:
  for p in sorted(root.rglob('*.stl')):
   m=trimesh.load(str(p),force='mesh');assert m.is_watertight and m.is_winding_consistent and m.volume>0,str(p)
   assert len(m.split(only_watertight=False))==1,str(p)
   r['files'].append({'file':str(p.relative_to(A)),'watertight':True,'consistentWinding':True,'connectedSolids':1,'triangles':len(m.faces)})
  for p in sorted(root.rglob('*.step')):
   shape=cq.importers.importStep(str(p)).val();assert shape.isValid() and len(shape.Solids())>=1,str(p)
   types=sorted(set(e.geomType() for e in shape.Edges()))
   if 'Native_CAD' in p.parts:assert 'CIRCLE' in types,str(p)
   r['files'].append({'file':str(p.relative_to(A)),'valid':True,'solids':len(shape.Solids()),'edgeTypes':types})
  for p in sorted(root.rglob('Parameters.json')):
   d=json.loads(p.read_text());assert d['hangerThickness']==1.6 and d['sacrificialTabThickness']==.4 and d['sacrificialTabWidth']==.8
   r['files'].append({'file':str(p.relative_to(A)),'newInputsPersisted':True})
except Exception as e:r['errors'].append(str(e));traceback.print_exc()
(A/'Validation/FINAL_EXPORT_CHECKS.json').write_text(json.dumps(r,indent=2));print('Final export checks',len(r['files']),'errors',r['errors'])
if r['errors']:raise SystemExit(1)
