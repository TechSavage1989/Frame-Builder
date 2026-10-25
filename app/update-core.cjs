'use strict';
const crypto = require('node:crypto');
const REPO='TechSavage1989/Frame-Builder';
const VERSION=/^v?(\d+)\.(\d+)\.(\d+)(?:-([\w.-]+))?$/;
const SHA=/^[a-f0-9]{64}$/i;
const ALLOWED_ASSET=/^Frame_Builder_\d+\.\d+\.\d+_Windows_x64\.exe$/;
function version(v){const m=VERSION.exec(String(v||''));if(!m)throw Error('Invalid version');return m.slice(1,4).map(Number);}
function compare(a,b){const x=version(a),y=version(b);for(let i=0;i<3;i++)if(x[i]!==y[i])return Math.sign(x[i]-y[i]);return 0;}
function allowedUrl(value,kind){let u;try{u=new URL(value)}catch{throw Error('Invalid download URL')};if(u.protocol!=='https:'||u.username||u.password||u.port||u.search||u.hash)throw Error('Unsafe asset URL'); if(kind==='asset'){
  if(u.hostname!=='github.com'||!new RegExp('^/'+REPO.replace('/','/')+'/releases/download/[^/]+/[^/]+$').test(u.pathname))throw Error('Untrusted release asset URL');
}else if(kind==='api'){
  if(u.hostname!=='api.github.com'||u.pathname!==`/repos/${REPO}/releases/latest`)throw Error('Untrusted API endpoint');
}else throw Error('Unknown URL policy');return u.toString();}
function validateManifest(data,installed,tag){if(!data||typeof data!=='object'||Array.isArray(data))throw Error('Invalid manifest');if(data.appId!=='com.techsavage3d.canvasframe'||data.product!=='Frame Builder')throw Error('Wrong application');if(typeof data.version!=='string'||!VERSION.test(data.version)||!/^v\d+\.\d+\.\d+$/.test(tag)||compare(data.version,tag)!==0)throw Error('Release version mismatch');if(!ALLOWED_ASSET.test(data.asset?.name)||typeof data.asset.sha256!=='string'||!SHA.test(data.asset.sha256))throw Error('Invalid asset metadata');const expectedAssetUrl=`https://github.com/${REPO}/releases/download/v${data.version}/${data.asset.name}`;
if(data.asset.url!==expectedAssetUrl)throw Error('Asset release or name mismatch');
allowedUrl(data.asset.url,'asset');if(data.asset.size<1_000_000||data.asset.size>800_000_000||!Number.isSafeInteger(data.asset.size))throw Error('Invalid download size');if(data.asset.kind!=='windows-portable-exe')throw Error('Unexpected package type');return {installedVersion:installed,latestVersion:data.version,available:compare(data.version,installed)>0,asset:Object.freeze({...data.asset}),notes:Array.isArray(data.notes)?data.notes.filter(x=>typeof x==='string').slice(0,6).map(x=>x.slice(0,180)):[],readMore:typeof data.readMore==='string'&&data.readMore.startsWith('https://github.com/'+REPO+'/releases/tag/')?data.readMore:null};}
function sha256(buf){return crypto.createHash('sha256').update(buf).digest('hex');}
function verifyPayload(contents,asset){if(contents.length!==asset.size||sha256(contents).toLowerCase()!==asset.sha256.toLowerCase())throw Error('Update package failed size or SHA-256 verification');}
function validatePE(header){if(!Buffer.isBuffer(header)||header.length<512||header.toString('ascii',0,2)!=='MZ')throw Error('Not a Windows executable');const pos=header.readUInt32LE(60);if(pos<64||pos+24>header.length||header.toString('ascii',pos,pos+4)!=='PE\0\0')throw Error('Invalid Windows PE header');if(header.readUInt16LE(pos+4)!==0x8664)throw Error('Expected Windows x64 executable');return true;}
module.exports={REPO,compare,allowedUrl,validateManifest,verifyPayload,sha256,validatePE};
