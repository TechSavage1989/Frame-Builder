// Shared worker/fallback pipeline. Geometry and export coordinates stay authoritative.
async function buildPreview(input,cancelled=()=>false,pause=()=>Promise.resolve()){
 const model=FrameV3.make(input),cache=new WeakMap(),raw=[];
 for(const part of model.parts){
  await pause();if(cancelled())return null;
  const mesh=FrameV3.mesh(part.spec,cache);
  FrameV3.validatePanelFront(part,mesh,model.params);
  const printMesh=FrameV3.printMesh(mesh,model.params,part);
  raw.push({...part,mesh,displayMesh:part.displaySpec?FrameV3.mesh(part.displaySpec,cache):null,bounds:FrameV3.bounds(mesh),printMesh,printBounds:FrameV3.bounds(printMesh),rotation:printMesh.rotation});
 }
 return {model,raw};
}
