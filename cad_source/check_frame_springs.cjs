'use strict';
// Standalone regression test for the Front Snap Borderless rear perimeter toggle.
// Usage: node check_frame_springs.cjs
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=__dirname,c={module:{exports:{}},TextEncoder,TextDecoder,console};vm.createContext(c);
for(const f of ['csg_core.js','bed_safety.js','frame_geometry.js'])vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),c,{filename:f});
const F=c.module.exports;
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const samples=[{w:101.6,h:152.4,t:3},{w:127,h:177.8,t:3},{w:203.2,h:254,t:3,printedPanel:true},{w:203.2,h:254,t:3,sectionMode:'4',printedPanel:true}];
let total=0;
for(const q of samples){
 const p={...q,frameStyle:'borderless'},a=F.make(p),on=F.make({...p,frameSpringsEnabled:true}),off=F.make({...p,frameSpringsEnabled:false});
 assert.equal(a.params.frameSpringsEnabled,true);assert.equal(on.params.frameSpringsEnabled,true);assert.equal(off.params.frameSpringsEnabled,false);
 assert.ok(on.params.frontRetention.rearFlexureCount>0);assert.equal(off.params.frontRetention.rearFlexureCount,0);
 assert.equal(hash(a.parts),hash(on.parts));
 assert.equal(hash(on.params.layout),hash(off.params.layout));assert.equal(hash(on.params.hangerLocations),hash(off.params.hangerLocations));
 assert.equal(hash(on.parts.filter(x=>x.type!=='frame')),hash(off.parts.filter(x=>x.type!=='frame')));
 assert.equal(hash(F.borderlessRim(on.params)),hash(F.borderlessRim(off.params)));
 assert.notEqual(hash(F.borderlessBody(on.params)),hash(F.borderlessBody(off.params)));
 assert.equal(on.params.d,off.params.d);assert.equal(on.params.t,off.params.t);
 total++;
}
for(const frameStyle of ['original','solid','light'])for(const standType of ['none','rigid','fold']){
 const p={frameStyle,standType,w:203.2,h:254,t:3};
 assert.equal(hash(F.make({...p,frameSpringsEnabled:true}).parts),hash(F.make({...p,frameSpringsEnabled:false}).parts));
 total++;
}
console.log('PASS: '+total+' rear-frame spring toggle and legacy frame cases.');
