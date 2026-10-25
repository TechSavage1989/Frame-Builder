'use strict';
// Regenerate the embedded settings after replacing Templates/Default.3mf.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const reader=require('./bambu_template.js');
(async()=>{
 const source=path.join(__dirname,'../Templates/Default.3mf'),bytes=fs.readFileSync(source);
 const template=await reader.read(bytes,'Default.3mf');
 template.sourceSha256=crypto.createHash('sha256').update(bytes).digest('hex');
 const literal=JSON.stringify(template).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
 fs.writeFileSync(path.join(__dirname,'bambu_base_project.js'),'/* Project-wide settings extracted from Templates/Default.3mf. */\nconst BambuBaseProject=Object.freeze('+literal+');\nif(typeof module!=="undefined")module.exports=BambuBaseProject;\n');
 const info=reader.validate(template);console.log(JSON.stringify({name:template.name,printer:info.printer,process:info.process,filaments:info.filaments,bed:info.bed}));
})().catch(e=>{console.error(e);process.exitCode=1;});
