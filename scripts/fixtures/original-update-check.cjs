'use strict';
const https=require('node:https');
const {validateManifest,allowedUrl,REPO}=require('./update-core.cjs');
const API=`https://api.github.com/repos/${REPO}/releases/latest`;
function fetchJson(url,etag,depth=0){if(depth>3)return Promise.reject(Error('Too many redirects'));return new Promise((resolve,reject)=>{const req=https.get(url,{headers:{'User-Agent':'Frame-Builder-Updater','Accept':'application/vnd.github+json',...(etag?{'If-None-Match':etag}:{})}},r=>{
  if([301,302,303,307,308].includes(r.statusCode)){const redirect=new URL(r.headers.location||'',url);if(redirect.protocol!=='https:'||!['github.com','release-assets.githubusercontent.com','objects.githubusercontent.com'].includes(redirect.hostname)){r.resume();reject(Error('Untrusted redirect'));return;}r.resume();fetchJson(redirect.toString(),null,depth+1).then(resolve,reject);return;}
  const chunks=[];let size=0;r.on('data',c=>{size+=c.length;if(size>1024*1024){req.destroy(Error('Response too large'));return;}chunks.push(c)});r.on('end',()=>{if(r.statusCode===304)return resolve({notModified:true,etag:r.headers.etag});if(r.statusCode!==200)return reject(Object.assign(Error('HTTP '+r.statusCode),{status:r.statusCode,retryAfter:r.headers['retry-after']}));try{resolve({data:JSON.parse(Buffer.concat(chunks).toString('utf8')),etag:r.headers.etag})}catch(e){reject(e)}});
});req.setTimeout(12000,()=>{timedOut=true;req.destroy(Error('Request timed out'))});req.on('error',reject);});}
class UpdateCheck{
 constructor({installed,onState,fetcher=fetchJson,clock=()=>Date.now()}){this.installed=installed;this.onState=onState;this.fetcher=fetcher;this.clock=clock;this.inflight=null;this.lastAt=0;this.nextAllowed=0;this.etag=null;this.last=null;this.failCount=0;}
 async check(manual=false){const now=this.clock();if(this.inflight)return this.inflight;if(now<this.nextAllowed)return this.last||{state:'cooldown'};if(manual&&now-this.lastAt<60000)return this.last||{state:'cooldown'};this.lastAt=now;this.onState({state:'checking'});this.inflight=(async()=>{try{
  const r=await this.fetcher(allowedUrl(API,'api'),this.etag);this.etag=r.etag||this.etag;
  if(r.notModified){if(!this.last||!['available','current'].includes(this.last.state))throw Error('No cached update result');this.onState(this.last);return this.last;}
  const release=r.data;if(!release||release.draft||release.prerelease||!/^v\d+\.\d+\.\d+$/.test(release.tag_name))throw Error('Invalid release');const asset=release.assets?.find(x=>x.name==='update-manifest.json');if(!asset)throw Error('Release has no update manifest');
  // Only release asset metadata is trusted as a location hint; integrity data is read separately.
  const manifest=await this.fetcher(asset.browser_download_url,null);const data=manifest.data;const info=validateManifest(data,this.installed,release.tag_name);
  if(!release.assets.some(x=>x.name===info.asset.name&&x.size===info.asset.size&&x.browser_download_url===info.asset.url))throw Error('Release asset metadata mismatch');
  this.failCount=0;this.nextAllowed=0;this.last={state:info.available?'available':'current',info,checkedAt:now};this.onState(this.last);return this.last;
 }catch(e){this.failCount++;let delay=Math.min(3600000,60000*2**Math.min(5,this.failCount-1));if(e.status===403||e.status===429){const secs=parseInt(e.retryAfter,10);if(Number.isFinite(secs))delay=Math.max(delay,secs*1000)}this.nextAllowed=now+delay;this.last={state:'error',message:'Update check unavailable: '+e.message,retryAfter:this.nextAllowed};this.onState(this.last);return this.last;}finally{this.inflight=null}})();return this.inflight;}
}
module.exports={UpdateCheck,fetchJson};
