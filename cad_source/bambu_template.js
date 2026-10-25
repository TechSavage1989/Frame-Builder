/* Read only project-wide settings from a user-selected, locally saved 3MF.
   Meshes, G-code files, thumbnails and per-object overrides are not copied. */
const BambuTemplate=(()=>{
 'use strict';
 const MAX_FILE=256*1024*1024,MAX_SETTING=2*1024*1024,MAX_TOTAL=8*1024*1024,MAX_MODEL=16*1024*1024;
 const projectName='Metadata/project_settings.config';
 const plateKeys=new Set(['filament_map_mode','filament_maps','filament_volume_maps']);
 const allowed=name=>name===projectName||/^Metadata\/(?:print_setting_|process_settings_|filament_settings_|machine_settings_)[^/]+\.config$/.test(name);
 const decode=bytes=>new TextDecoder('utf-8',{fatal:true}).decode(bytes);
 function crc(bytes){let c=0xffffffff;for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
 function archive(bytes){
  if(!(bytes instanceof Uint8Array))bytes=new Uint8Array(bytes);
  if(bytes.length<22||bytes.length>MAX_FILE)throw Error('Choose a saved 3MF project smaller than 256 MB.');
  const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),list=new Map();let end=-1;
  for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--){
   if(v.getUint32(i,true)===0x06054b50&&i+22+v.getUint16(i+20,true)===bytes.length){end=i;break;}
  }
  if(end<0)throw Error('This file is not a complete 3MF archive.');
  if(v.getUint16(end+4,true)||v.getUint16(end+6,true))throw Error('Use a single saved 3MF project.');
  const u64=at=>{if(at<0||at+8>bytes.length)throw Error('The ZIP64 directory is incomplete.');const n=v.getBigUint64(at,true);if(n>BigInt(Number.MAX_SAFE_INTEGER))throw Error('The ZIP64 archive is too large.');return Number(n);};
  let count=v.getUint16(end+10,true),size=v.getUint32(end+12,true),offset=v.getUint32(end+16,true);
  if(count===65535||size===0xffffffff||offset===0xffffffff){
   const locator=end-20;
   if(locator<0||v.getUint32(locator,true)!==0x07064b50||v.getUint32(locator+4,true)!==0||v.getUint32(locator+16,true)!==1)throw Error('The ZIP64 directory is invalid.');
   const z=u64(locator+8);
   if(z+56>locator||v.getUint32(z,true)!==0x06064b50||u64(z+4)<44||z+12+u64(z+4)>locator||v.getUint32(z+16,true)||v.getUint32(z+20,true))throw Error('The ZIP64 directory is incomplete.');
   count=u64(z+32);size=u64(z+40);offset=u64(z+48);
   if(u64(z+24)!==count)throw Error('Use a single saved 3MF project.');
  }else if(v.getUint16(end+8,true)!==count)throw Error('Use a single saved 3MF project.');
  if(count>100000||count*46>size)throw Error('Save a smaller template project.');
  if(offset+size>end)throw Error('The 3MF directory is incomplete.');
  let at=offset;
  for(let i=0;i<count;i++){
   if(at+46>offset+size||v.getUint32(at,true)!==0x02014b50)throw Error('The 3MF directory is invalid.');
   const flags=v.getUint16(at+8,true),method=v.getUint16(at+10,true),checksum=v.getUint32(at+16,true);
   let packed=v.getUint32(at+20,true),length=v.getUint32(at+24,true),local=v.getUint32(at+42,true),disk=v.getUint16(at+34,true);
   const nl=v.getUint16(at+28,true),extra=v.getUint16(at+30,true),comment=v.getUint16(at+32,true),next=at+46+nl+extra+comment;
   if(next>offset+size)throw Error('The 3MF directory is truncated.');
   if([packed,length,local].includes(0xffffffff)||disk===65535){
    let found=false;
    for(let p=at+46+nl;p+4<=at+46+nl+extra;){
     const id=v.getUint16(p,true),n=v.getUint16(p+2,true),stop=p+4+n;p+=4;
     if(stop>at+46+nl+extra)throw Error('The ZIP64 entry is truncated.');
     if(id===1){
      const take=()=>{if(p+8>stop)throw Error('The ZIP64 entry is incomplete.');const x=u64(p);p+=8;return x;};
      if(length===0xffffffff)length=take();if(packed===0xffffffff)packed=take();if(local===0xffffffff)local=take();
      if(disk===65535){if(p+4>stop)throw Error('The ZIP64 entry is incomplete.');disk=v.getUint32(p,true);}
      found=true;break;
     }p=stop;
    }
    if(!found)throw Error('The ZIP64 entry is missing.');
   }
   if(disk)throw Error('Use a single saved 3MF project.');
   const name=decode(bytes.subarray(at+46,at+46+nl));
   if(allowed(name)||name==='3D/3dmodel.model'||name==='Metadata/model_settings.config'){
    if(list.has(name))throw Error('The 3MF contains duplicate settings files.');
    if(flags&1||![0,8].includes(method))throw Error('Use an unencrypted 3MF saved by Bambu Studio.');
    const limit=name==='3D/3dmodel.model'?MAX_MODEL:MAX_SETTING;
    if(length>limit)throw Error('Save a template project with one simple object and your chosen profiles.');
    if(local+30>offset||v.getUint32(local,true)!==0x04034b50)throw Error('The 3MF settings entry is invalid.');
    const start=local+30+v.getUint16(local+26,true)+v.getUint16(local+28,true);
    if(start+packed>offset)throw Error('The 3MF settings data is truncated.');
    list.set(name,{method,checksum,length,limit,data:bytes.slice(start,start+packed)});
   }
   at=next;
  }
  return list;
 }
 async function unpack(entry){
  let bytes=entry.data;
  if(entry.method===8){
   let stream;try{stream=new DecompressionStream('deflate-raw');}catch(_){throw Error('Use the desktop application or a current Chrome, Edge or Firefox browser to import this project.');}
   const reader=new Blob([bytes]).stream().pipeThrough(stream).getReader(),chunks=[];let total=0;
   while(true){const {value,done}=await reader.read();if(done)break;total+=value.length;
    if(total>entry.length||total>entry.limit){await reader.cancel();throw Error('The settings data exceeds its declared size.');}chunks.push(value);
   }
   bytes=new Uint8Array(total);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}
  }
  if(bytes.length!==entry.length||crc(bytes)!==entry.checksum)throw Error('The 3MF settings failed their integrity check. Save the project again.');
  return decode(bytes);
 }
 function validate(template){
  if(!template||!Array.isArray(template.files)||template.files.length>128)throw Error('Import a Bambu Studio project in Printer settings before exporting one multi-plate project.');
  const names=new Set();let total=0;
  for(const entry of template.files){
   if(!Array.isArray(entry)||entry.length!==2||!allowed(entry[0])||typeof entry[1]!=='string'||names.has(entry[0]))throw Error('The saved project settings are invalid. Import the project again.');
   names.add(entry[0]);total+=new TextEncoder().encode(entry[1]).length;
   if(entry[1].length>MAX_SETTING||total>MAX_TOTAL)throw Error('The project has too many embedded settings. Save a small template project.');
  }
  const text=template.files.find(([name])=>name===projectName)?.[1];let config;
  try{config=JSON.parse(text);}catch(_){throw Error('This 3MF has no complete project settings. Save a project from Bambu Studio with your printer and profiles selected.');}
  const printer=config.printer_settings_id,process=config.print_settings_id,filaments=config.filament_settings_id;
  if(typeof printer!=='string'||!printer.trim()||typeof process!=='string'||!process.trim()||!Array.isArray(filaments)||!filaments.length||filaments.some(s=>typeof s!=='string'||!s.trim()))
   throw Error('Select your printer, process and filament profiles in Bambu Studio, save the project, then import it here.');
  const points=(Array.isArray(config.printable_area)?config.printable_area:[]).map(s=>String(s).split('x').map(Number));
  if(points.length<3||points.some(p=>p.length!==2||p.some(n=>!Number.isFinite(n))))throw Error('The project does not contain a usable printer bed.');
  const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),width=Math.max(...xs),depth=Math.max(...ys);
  if(Math.abs(Math.min(...xs))>.01||Math.abs(Math.min(...ys))>.01||width<100||depth<100||width>1200||depth>1200||points.some(([x,y])=>![0,width].some(a=>Math.abs(x-a)<.01)||![0,depth].some(a=>Math.abs(y-a)<.01)))
   throw Error('This builder needs a rectangular bed with its origin at 0, 0.');
  if(!/^BambuStudio-\d{1,2}\.\d{1,2}\.\d{1,2}\.\d{1,3}$/.test(template.application||''))throw Error('Import a project saved by Bambu Studio.');
  if(template.plateDefaults!==undefined&&(template.plateDefaults===null||Array.isArray(template.plateDefaults)||typeof template.plateDefaults!=='object'||Object.entries(template.plateDefaults).some(([key,value])=>!plateKeys.has(key)||typeof value!=='string'||value.length>8192)))throw Error('The saved filament mapping is invalid. Import the project again.');
  return {printer,process,filaments:[...filaments],bed:{width,depth},config};
 }
 function readPlateDefaults(xml){
  const first=xml.match(/<plate\b[^>]*>([\s\S]*?)<\/plate>/)?.[1]||'',result={};
  const decodeAttribute=s=>s.replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);/g,e=>{
   const named={'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'"};
   if(e in named)return named[e];return String.fromCodePoint(e.startsWith('&#x')?parseInt(e.slice(3,-1),16):Number(e.slice(2,-1)));
  });
  for(const tag of first.matchAll(/<metadata\b([^>]*?)\/?\s*>/g)){
   const attrs={};for(const a of tag[1].matchAll(/\b(key|value)\s*=\s*(?:"([^"]*)"|'([^']*)')/g))attrs[a[1]]=decodeAttribute(a[2]??a[3]);
   if(plateKeys.has(attrs.key)&&attrs.value!==undefined)result[attrs.key]=attrs.value;
  }
  return result;
 }
 async function read(input,name='Bambu_Project.3mf'){
  const entries=archive(input),files=[];let total=0;
  const model=entries.get('3D/3dmodel.model');if(!model)throw Error('Choose a complete Bambu Studio project.');
  const xml=await unpack(model),match=xml.match(/<metadata\b[^>]*name=["']Application["'][^>]*>\s*(BambuStudio-\d{1,2}\.\d{1,2}\.\d{1,2}\.\d{1,3})\s*<\/metadata>/);
  if(!match)throw Error('Save the template as a project from Bambu Studio, then import that 3MF.');
  for(const [name,entry] of entries){if(!allowed(name))continue;total+=entry.length;if(total>MAX_TOTAL)throw Error('Save a smaller template project.');files.push([name,await unpack(entry)]);}
  const plateEntry=entries.get('Metadata/model_settings.config');
  const template={version:1,name:String(name).split(/[\\/]/).pop(),application:match[1],files,plateDefaults:plateEntry?readPlateDefaults(await unpack(plateEntry)):{}};
  validate(template);
  return template;
 }
 function assertBed(template,bed){const info=validate(template);
  if(Math.abs(info.bed.width-bed.width)>.01||Math.abs(info.bed.depth-bed.depth)>.01)throw Error('The saved Bambu project uses a '+info.bed.width+' x '+info.bed.depth+' mm bed. Match the bed size or import a matching project.');return info;
 }
 function resolvePackaging(requested,template,bed){
  if(!['project','portable'].includes(requested))throw Error('Select a valid 3MF export option.');
  if(requested==='portable')return {requested,packaging:'portable',reason:null};
  const info=validate(template),width=Number(bed.width),depth=Number(bed.depth);
  const known=Number.isFinite(width)&&Number.isFinite(depth)&&width>0&&depth>0;
  const matches=!known||(Math.abs(info.bed.width-width)<=.01&&Math.abs(info.bed.depth-depth)<=.01);
  return {requested,packaging:matches?'project':'portable',reason:matches?null:'template_bed_mismatch',templateBed:{...info.bed}};
 }
 return {read,validate,assertBed,resolvePackaging,allowed};
})();
if(typeof module!=='undefined')module.exports=BambuTemplate;
