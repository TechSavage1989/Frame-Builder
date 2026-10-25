"""Export editable B-rep STEP from a Frame / UV Panel v3.51.0 Geometry_Specification.json.
Usage: python export_step.py Geometry_Specification.json output_folder
Requires CadQuery only for this optional command-line path. The browser directly
exports both STL and STEP without this script or a CAD installation.
"""
from __future__ import annotations
import argparse, json, hashlib, pathlib, time, math
import cadquery as cq
from OCP.gp import gp_Trsf

class Builder:
    def __init__(self):
        self.cache: dict[str,cq.Shape] = {}

    @staticmethod
    def wire(points: list[list[float]]) -> cq.Wire:
        return cq.Wire.makePolygon([cq.Vector(*p) for p in points],close=True)

    def build(self,s: dict) -> cq.Shape | None:
        key=hashlib.sha256(json.dumps(s,separators=(',',':')).encode()).hexdigest()
        if key in self.cache: return self.cache[key]
        op=s['op']; result=None
        if op=='box':
            result=cq.Solid.makeBox(*s['size'],pnt=cq.Vector(*s['min']))
        elif op=='cylinder':
            result=cq.Solid.makeCylinder(s['radius'],s['length'],cq.Vector(*s['center'],s['start']))
        elif op=='curve_prism':
            edges=[]
            for seg in s['segments']:
                points=[cq.Vector(p[0],p[1],s['start']) for p in seg['points']]
                if seg['kind']=='line':edges.append(cq.Edge.makeLine(*points))
                elif seg['kind']=='bezier':edges.append(cq.Edge.makeBezier(points))
                elif seg['kind']=='arc':edges.append(cq.Edge.makeThreePointArc(*points))
                else:raise ValueError('Unknown profile edge '+seg['kind'])
            wire=cq.Wire.assembleEdges(edges)
            result=cq.Solid.extrudeLinear(wire,[],cq.Vector(0,0,s['length']))
        elif op=='prism':
            start=s['start']; axis=s.get('axis','z'); length=s['length']
            if axis=='z':
                points=[[u,v,start] for u,v in s['points']]; direction=cq.Vector(0,0,length)
            elif axis=='x':
                points=[[start,u,v] for u,v in s['points']]; direction=cq.Vector(length,0,0)
            else:
                points=[[u,start,v] for u,v in s['points']]; direction=cq.Vector(0,length,0)
            result=cq.Solid.extrudeLinear(self.wire(points),[],direction)
        elif op=='loft':
            # Match the browser's explicit triangular ruled sides exactly.
            # A generic CAD loft can create slightly warped surfaces where
            # the compression ribs change section; those are not the model.
            p0=s['points0'];p1=s['points1']
            area=sum(p0[i][0]*p0[(i+1)%len(p0)][1]-p0[(i+1)%len(p0)][0]*p0[i][1] for i in range(len(p0)))
            if area<0:p0=list(reversed(p0));p1=list(reversed(p1))
            lower=[[*p,s['z0']] for p in p0];upper=[[*p,s['z1']] for p in p1];n=len(p0)
            faces=[cq.Face.makeFromWires(self.wire(list(reversed(lower)))),cq.Face.makeFromWires(self.wire(upper))]
            for i in range(n):
                j=(i+1)%n
                faces.append(cq.Face.makeFromWires(self.wire([lower[i],lower[j],upper[j]])))
                faces.append(cq.Face.makeFromWires(self.wire([lower[i],upper[j],upper[i]])))
            result=cq.Solid.makeSolid(cq.Shell.makeShell(faces)).clean()
        elif op=='transform':
            m=s['matrix']; trsf=gp_Trsf();trsf.SetValues(*m[:12]);matrix=cq.Matrix(trsf)
            result=self.build(s['base']).transformShape(matrix)
        elif op=='union':
            items=[self.build(i) for i in s['items']]; items=[i for i in items if i is not None]
            if items: result=items[0].fuse(*items[1:]).clean() if len(items)>1 else items[0]
        elif op=='cut':
            result=self.build(s['base']); items=[self.build(i) for i in s['items']]; items=[i for i in items if i is not None]
            if items and result is not None: result=result.cut(*items).clean()
        elif op=='intersect':
            items=[self.build(i) for i in s['items']]
            result=items[0]
            for other in items[1:]: result=result.intersect(other).clean()
        else: raise ValueError(f'Unknown geometry operation: {op}')
        self.cache[key]=result
        return result

def without_press_ribs(spec: dict, region: dict) -> dict:
    """Remove known added rib subtrees, without cutting away embedded core."""
    def signature(x):return json.dumps(x,sort_keys=True,separators=(',',':'))
    def groups(x):
        if x.get('op')=='union':
            items=x.get('items',[])
            if not items:return []
            if any(i.get('op')=='union' for i in items):
                return [g for i in items for g in groups(i)]
        return [x]
    keys={signature(g) for g in groups(region)};removed=0
    def visit(x):
        nonlocal removed
        if not isinstance(x,dict) or 'op' not in x:return x
        if signature(x) in keys:
            removed+=1
            return {'op':'union','items':[]}
        out=dict(x)
        if 'base' in out:out['base']=visit(out['base'])
        if 'items' in out:out['items']=[visit(v) for v in out['items']]
        return out
    result=visit(spec)
    if keys and not removed:raise ValueError('Seating-rib metadata did not match its solid definition.')
    return result

def shelf_pose(shape,o):
    if o.get('mountQuarterTurn'):
        shape=shape.rotate((0,0,0),(0,0,1),90).translate((o['oh'],0,0))
    width=o['oh'] if o.get('mountQuarterTurn') else o['ow']
    angle=o.get('borderlessStandAngle',12) if o.get('isBorderless') else 8
    return shape.rotate((0,0,0),(1,0,0),90+angle).translate((-width/2,0,o['d']*math.sin(math.radians(angle))))

def export(specfile: pathlib.Path,out: pathlib.Path,checks: bool=True) -> dict:
    data=json.loads(specfile.read_text()); o=data['params']; name=specfile.stem
    out.mkdir(parents=True,exist_ok=True); b=Builder()
    report={'version':'3.51.0','name':name,'parts':[],'intersections':[]}
    press_regions={};structural_cores={}
    frames=[]; panels=[]; stands=[]; types={p['name']:p['type'] for p in data['parts']}
    for p in data['parts']:
        started=time.time(); shape=b.build(p['spec'])
        if p.get('pressFitSpec'):
            press_regions[p['name']]=p['pressFitSpec']
            structural_cores[p['name']]=b.build(without_press_ribs(p['spec'],p['pressFitSpec']))
        else:structural_cores[p['name']]=shape
        if shape is None or not shape.isValid(): raise ValueError(f"Invalid B-rep: {p['name']}")
        solids=shape.Solids()
        if len(solids)!=1: raise ValueError(f"Expected one connected solid for {p['name']}, got {len(solids)}")
        print_source=shape.rotate((0,0,0),(1,0,0),180) if p.get('printFlip') else shape
        bb=print_source.BoundingBox(); print_shape=print_source.translate((-bb.xmin,-bb.ymin,-bb.zmin))
        usable_x=o.get('usableX',o.get('bed',240));usable_y=o.get('usableY',o.get('bed',240))
        rotation=0
        if bb.xlen>usable_x+1e-5 or bb.ylen>usable_y+1e-5:
            if bb.ylen>usable_x+1e-5 or bb.xlen>usable_y+1e-5:
                raise ValueError(f"Part does not fit usable bed: {p['name']}")
            print_shape=print_shape.rotate((0,0,0),(0,0,1),90).translate((bb.ylen,0,0));rotation=90
        pb=print_shape.BoundingBox()
        if not p.get('bundledIn'):
            cq.exporters.export(print_shape,str(out/(p['name']+'_Print_Orientation.step')))
        report['parts'].append({'name':p['name'],'type':p['type'],'valid':True,'solids':1,'volume_mm3':shape.Volume(),'print_dimensions_mm':[pb.xlen,pb.ylen,pb.zlen],'xy_rotation_degrees':rotation})
        if p['type']=='foot':
            display=b.build(p['displaySpec']).translate(tuple(p['displayOffset']))
            stands.append((p['name'],display));structural_cores[p['name']]=display
        elif p['type'] in ('frame','frameKey','faceplate'):
            displayed=b.build(p['displaySpec']) if p.get('displaySpec') else shape
            frames.append((p['name'],displayed));structural_cores[p['name']]=displayed
        elif p['type'] in ('panel','panelKey'): panels.append((p['name'],shape))
        print(name,p['name'],'STEP',round(time.time()-started,2),'s',flush=True)
    # Test-coupon specifications have no assembly / reference panel.
    if 'panel' not in data:
        (out/'STEP_VALIDATION.json').write_text(json.dumps(report,indent=2));return report
    reference=b.build(data['panel'])
    frameasm=cq.Assembly(name='Frame_Assembly_NO_PANEL')
    for part_name,shape in frames:frameasm.add(shape,name=part_name,color=cq.Color(.22,.26,.29))
    frameasm.save(str(out/'Frame_Assembly_NO_PANEL.step'))
    assembly=cq.Assembly(name='Frame_and_Panel_Assembly')
    for part_name,shape in frames:assembly.add(shape,name=part_name,color=cq.Color(.22,.26,.29))
    displayed_panels=panels or [('REFERENCE_PANEL_DO_NOT_PRINT',reference)]
    for part_name,shape in displayed_panels:assembly.add(shape,name=part_name,color=cq.Color(.84,.79,.71))
    assembly.save(str(out/('Frame_With_UV_Panel_Assembly.step' if panels else 'Assembly_With_Panel_REFERENCE.step')))
    def check_pair(an,a,bn,other):
        common=a.intersect(other); volume=common.Volume(); residual=volume
        if volume>1e-6:
            # Compare structural cores reconstructed without the explicitly
            # added seating ribs. No socket, catch or load-bearing face is
            # changed. This avoids compound-cut ambiguity at tiny rib faces.
            core_a=structural_cores.get(an,a);core_b=structural_cores.get(bn,other)
            intersection=core_a.intersect(core_b)
            residual=abs(intersection.Volume()) if intersection.Solids() else 0
        faceplate='faceplate' in (types.get(an),types.get(bn))
        expected=volume>1e-3 and (faceplate or residual<1e-3)
        report['intersections'].append({'a':an,'b':bn,'volume_mm3':volume,'unexplained_volume_mm3':residual,'intentional_elastic_fit':expected})
        if residual>1e-3 and not faceplate:raise ValueError(f'Unexpected assembly interference: {an}, {bn}, volume {residual}')
    if stands:
        shelf=cq.Assembly(name='Shelf_Display_Assembly')
        for stand_name,stand_shape in stands:
            shelf.add(shelf_pose(stand_shape,o),name=stand_name,color=cq.Color(.22,.26,.29))
        for part_name,shape in frames+displayed_panels:
            shelf.add(shelf_pose(shape,o),name=part_name,color=cq.Color(.22,.26,.29))
            if checks:
                for stand_name,stand_shape in stands:check_pair(part_name,shape,stand_name,stand_shape)
        shelf.save(str(out/'Shelf_Display_Assembly.step'))
    if checks:
        # Check the actual generated panel pieces against each other, not just
        # against an unsplit placeholder. Also check the full panel envelope.
        all_parts=frames+panels
        for i,(an,a) in enumerate(all_parts):
            for bn,other in all_parts[i+1:]:check_pair(an,a,bn,other)
        for an,a in frames:check_pair(an,a,'full panel envelope',reference)
    (out/'STEP_VALIDATION.json').write_text(json.dumps(report,indent=2));return report

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('specification',type=pathlib.Path)
    parser.add_argument('output_folder',type=pathlib.Path)
    parser.add_argument('--skip-intersection-checks',action='store_true')
    args=parser.parse_args();export(args.specification,args.output_folder,not args.skip_intersection_checks)
