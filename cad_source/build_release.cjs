/* Regenerate the default print examples using the shipped geometry and writers. */
'use strict';
const fs=require('fs'),path=require('path'),{exportModels}=require('./export_models.cjs');
const root=path.resolve(__dirname,'..');
const input=JSON.parse(fs.readFileSync(path.join(root,'Presets/Front_Snap_Borderless_8x10_3mm/Parameters.json')));
input.platePackaging='project';input.bambuTemplatePath=path.join(root,'Templates/Default.3mf');input.latchSpringBias=.50;
(async()=>{
 for(const [rel,mode] of [['Presets/Front_Snap_Borderless_8x10_3mm','model'],['Fit_Tests/Border_And_Stand','border-stand-test'],['Fit_Tests/Adjustable_Shared_Mount','stand-test']]){
  const out=path.join(root,rel);fs.rmSync(out,{recursive:true,force:true});console.log(JSON.stringify(await exportModels(input,out,mode)));
 }
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
