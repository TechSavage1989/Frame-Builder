"""Independent whole-mesh XY clearance checks on serialized 3MF vertices.
Uses XML build transforms and the saved per-plate origin, then Shapely/GEOS.
Does not simulate slicing, a purge tower or toolhead travel.
"""
from pathlib import Path
import json,zipfile,xml.etree.ElementTree as E,numpy as np
from shapely.geometry import Polygon,box
from shapely.ops import unary_union
root=Path(__file__).resolve().parent.parent
report={'version':'3.51.0','physicalPrintTested':False,'slicerRun':False,'method':'Independent GEOS checks of complete projected serialized meshes after 3MF build transforms and native plate origins','files':[]}
files=sorted(set(list((root/'Presets').rglob('*.3mf'))+list((root/'Fit_Tests').rglob('*.3mf'))+list((root/'Validation/Browser_Downloads').rglob('*.3mf'))))
for f in files:
 with zipfile.ZipFile(f) as z:
  assert z.testzip() is None
  d=json.loads(z.read('Metadata/Canvas_Frame_Layout.json'));b=d['bed'];s=b['safety'];pad=s['toolpathPadding_mm'];W=b['width'];H=b['depth'];assert d['version']=='3.51.0'
  regions=[(r['label'],box(r['rect']['x'],r['rect']['y'],r['rect']['maxX'],r['rect']['maxY'])) for r in s['regions']]
  origins={p['number']:np.array(p['origin']) for p in d.get('project',{}).get('plates',[])}
  rootxml=E.fromstring(z.read('3D/3dmodel.model'));ns={'m':rootxml.tag[1:].split('}')[0]}
  objects={o.attrib['id']:o for o in rootxml.findall('m:resources/m:object',ns)}
  plateinfo={p['name']:(plate['plate'],p) for plate in d['plates'] for p in plate['parts']}
  recorded=[];onplates={}
  for item in rootxml.findall('m:build/m:item',ns):
   obj=objects[item.attrib['objectid']];name=obj.attrib['name'];pn,details=plateinfo[name];origin=origins.get(pn,np.zeros(3));mesh=obj.find('m:mesh',ns)
   v=np.array([[float(t.attrib[c]) for c in ('x','y','z')] for t in mesh.findall('m:vertices/m:vertex',ns)])
   tf=np.array(list(map(float,item.attrib.get('transform','1 0 0 0 1 0 0 0 1 0 0 0').split()))).reshape(4,3)
   v=v@tf[:3]+tf[3]-origin
   faces=np.array([[int(t.attrib[c]) for c in ('v1','v2','v3')] for t in mesh.findall('m:triangles/m:triangle',ns)])
   pts=v[faces,:2];cross=np.abs((pts[:,1,0]-pts[:,0,0])*(pts[:,2,1]-pts[:,0,1])-(pts[:,1,1]-pts[:,0,1])*(pts[:,2,0]-pts[:,0,0]));p=unary_union([Polygon(t) for t in pts[cross>1e-9]])
   assert p.is_valid and p.area>0,(f,name,'projection')
   minx,miny,maxx,maxy=p.bounds;m=b['margins'];assert minx>=m['left']-1e-5 and miny>=m['front']-1e-5 and maxx<=W-m['right']+1e-5 and maxy<=H-m['back']+1e-5,(f,name,'outer margin')
   assert v[:,2].min()>-1e-5 and abs(v[:,2].min())<1e-4,(f,name,'print face')
   distances={}
   for label,r in regions:
    distances[label]=float(p.distance(r));q=r.buffer(pad,join_style=2);assert not p.intersects(q),(f,name,label,p.intersection(q).area,distances)
   onplates.setdefault(pn,[]).append((name,p))
   recorded.append({'name':name,'plate':pn,'allReservedRegionsClear':True,'closestRawReservedRegion_mm':min(distances.values()) if distances else None,'requiredClearanceWithBrim_mm':pad,'printFaceOnBed':True})
  for pn,parts in onplates.items():
   for i,(na,a) in enumerate(parts):
    for nb,bp in parts[i+1:]:assert a.distance(bp)>=d['minimumPartSpacing_mm']-.003,(f,na,nb,a.distance(bp),d['minimumPartSpacing_mm'])
  if 'Metadata/project_settings.config' in z.namelist():
   settings=json.loads(z.read('Metadata/project_settings.config'));assert settings['printer_settings_id']==d['profileSource']['printer']
  report['files'].append({'file':str(f.relative_to(root)),'parts':recorded,'interpartBrimSpacingClear':True});print(f.relative_to(root),'PASS',flush=True)
(root/'Validation/Serialized_Placement_Checks.json').write_text(json.dumps(report,indent=2))
print('ALL SERIALIZED 3MF PLACEMENTS PASS',len(files),flush=True)
