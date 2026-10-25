from pathlib import Path
root=Path(__file__).parent
base=(root/'interface.html').read_text(encoding='utf-8')
for token,filename in [('CSG','csg_core.js'),('BED_SAFETY','bed_safety.js'),('GEOMETRY','frame_geometry.js'),('STEP','step_export.js'),('STEP_APP','step_app.js'),('BAMBU_TEMPLATE','bambu_template.js'),('BAMBU_BASE','bambu_base_project.js'),('PLATES','plate_layout.js'),('PLATE_APP','plate_app.js'),('APP','app.js'),('RENDERER','renderer.js'),('WORKSPACE','viewer_workspace.js'),('PANELS','panel_layout.js')]:
    base=base.replace('/*__'+token+'__*/',(root/filename).read_text(encoding='utf-8'))
out=root.parent/'Canvas_Frame_v3_51_6_Builder_and_3D_Viewer.html'
out.write_text(base,encoding='utf-8')
print('Built',out,len(base.encode()),'bytes')
