import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto,createHmac,createHash} from 'node:crypto';
import {SignedPeer,hmac,sha} from './transport.mjs';
import {R2Media,PART_BYTES} from './r2_media.mjs';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const key=new TextEncoder().encode('test-only-pair-secret-never-deploy!'),enc=new TextEncoder();
const mac=s=>createHmac('sha256',key).update(s).digest('hex');
function peerReply({tamper=false,status=200,extra=false,wrongRange=false,stream=false}={}){
  return async(url,options)=>{
    assert.equal(options.redirect,'manual');assert.equal(url,'https://peer.invalid/sync/v1/read');
    const q=JSON.parse(options.body),h=options.headers;
    const hash=createHash('sha256').update(options.body).digest('hex');
    assert.equal(h['x-sync-signature'],mac(['sync-v1-request',h['x-sync-time'],h['x-sync-nonce'],'POST','/sync/v1/read',hash].join('\n')));
    if(status!==200)return new Response('platform 1102',{status});
    const data=enc.encode('abc');const meta=JSON.stringify({version:q.version,offset:wrongRange?2:q.offset,...(stream?{length:q.length,total:q.total}:{})});
    const sig=mac(['sync-v1-response',h['x-sync-nonce'],'200',meta,stream?'stream':await sha(data)].join('\n'));
    return new Response(extra?'abc!':data,{headers:{'x-sync-meta':meta,'x-sync-signature':tamper?'0'.repeat(64):sig,'content-length':'3'}});
  };
}
const request={kind:'slice',version:'v1',offset:0,length:3,module:'news',record:'i',field:'body'};
test('WebCrypto signatures interoperate with standard HMAC',async()=>{assert.equal(await hmac(key,'中文\nabc'),mac('中文\nabc'));});
test('signed bounded body verifies',async()=>{const p=new SignedPeer('https://peer.invalid',key,{fetcher:peerReply()});assert.equal(new TextDecoder().decode(await p.read(request)),'abc');});
for(const [name,options,kind] of [['tamper',{tamper:true},'authorization'],['oversize',{extra:true},'conflict'],['wrong range',{wrongRange:true},'conflict'],['1102 platform page',{status:500},'resource'],['redirect',{status:302},'conflict']])
 test(name,async()=>{const p=new SignedPeer('https://peer.invalid',key,{fetcher:peerReply(options)});await assert.rejects(p.read(request),e=>e.kind===kind);});
test('authenticated media retains native readable stream',async()=>{const p=new SignedPeer('https://peer.invalid',key,{fetcher:peerReply({stream:true})});const r=await p.read({...request,kind:'media',total:3},{stream:true});assert.equal(r.bodyUsed,false);assert.equal(await r.text(),'abc');});
function setup(size=PART_BYTES+123){
  const f={operation_id:'a'.repeat(64),staging_key:'sync/'+'a'.repeat(64),source_version:'v1',total_bytes:size,committed_bytes:0,part_bytes:PART_BYTES,upload_id:null,source_file_id:'f'};
  let object=null,receivedStream=null,sourceStream=null,completed=0,failComplete=false,deleted=false,abort=false;
  const receipts=[];
  const upload={uploadId:'upload-1',async uploadPart(partNumber,body){assert.equal(body,sourceStream);receivedStream=body;let n=0;for await(const chunk of body)n+=chunk.byteLength;receipts.push({partNumber,bytes:n});return {partNumber,etag:'e'+partNumber};},async complete(parts){completed++;assert.equal(parts.length,receipts.length);object={size,customMetadata:{sync_operation:f.operation_id,sync_source:f.source_version}};if(failComplete)throw new Error('lost complete reply');},async abort(){abort=true;}};
  const bucket={async head(){return object;},async createMultipartUpload(key,options){assert.equal(options.customMetadata.sync_operation,f.operation_id);return upload;},resumeMultipartUpload(key,id){assert.equal(id,'upload-1');return upload;},async delete(){deleted=true;object=null;}};
  const peer={async read(q,options){assert.equal(options.stream,true);let left=q.length;sourceStream=new ReadableStream({pull(c){if(!left){c.close();return;}const n=Math.min(16384,left);left-=n;c.enqueue(new Uint8Array(n));}});return new Response(sourceStream);}};
  return {f,media:new R2Media(bucket,peer),receipts,upload,bucket,get completed(){return completed;},lose(){failComplete=true;},foreign(){object={size,customMetadata:{sync_operation:'other'}};},get deleted(){return deleted;},get aborted(){return abort;}};
}
async function uploadAll(s){let r=await s.media.step(s.f,{},[]);assert.equal(r.kind,'upload');s.f.upload_id=r.upload_id;const parts=[];
 while(s.f.committed_bytes<s.f.total_bytes){r=await s.media.step(s.f,{},parts);assert.equal(r.kind,'part');s.f.committed_bytes+=r.length;parts.push({partNumber:parts.length+1,etag:r.etag});}return parts;}
test('native R2 5MiB plus tail and completion',async()=>{const s=setup(),parts=await uploadAll(s);assert.deepEqual(s.receipts.map(x=>x.bytes),[PART_BYTES,123]);assert.equal((await s.media.step(s.f,{},parts)).kind,'uploaded');});
test('lost complete reply recovered by owned HEAD',async()=>{const s=setup(),parts=await uploadAll(s);s.lose();await assert.rejects(s.media.step(s.f,{},parts));assert.equal((await s.media.step(s.f,{},parts)).kind,'uploaded');assert.equal(s.completed,1);});
test('foreign object never published or deleted',async()=>{const s=setup();s.foreign();await assert.rejects(s.media.step(s.f,{},[]));await assert.rejects(s.media.discard(s.f));assert.equal(s.deleted,false);});
test('owned incomplete upload aborts',async()=>{const s=setup();s.f.upload_id='upload-1';await s.media.discard(s.f);assert.equal(s.aborted,true);});
test('storage part cannot shrink below R2 floor',async()=>{const s=setup();s.f.part_bytes=1024;await assert.rejects(s.media.step(s.f,{},[]));});
test('stream failure produces no completed part',async()=>{const s=setup();s.media.peer={async read(){return new Response(new ReadableStream({start(c){c.error(new Error('source aborted'));}}));}};s.f.upload_id='upload-1';s.upload.uploadPart=async(n,body)=>{for await(const chunk of body){};throw new Error('unreachable');};await assert.rejects(s.media.step(s.f,{},[]));assert.equal(s.receipts.length,0);});
test('expired multipart session resets only after checking completion',async()=>{
 const f={part_bytes:5*1024*1024,total_bytes:3,staging_key:'sync/'+'a'.repeat(64),operation_id:'a'.repeat(64),upload_id:'expired',committed_bytes:3,source_version:'v1'};
 const {R2Media}=await import('./r2_media.mjs');let heads=0;
 const bucket={head:async()=>{heads++;return null;},resumeMultipartUpload:()=>({complete:async()=>{throw Error('complete: upload does not exist (10024)');},abort:async()=>{throw Error('abort: upload does not exist (10024)');}})};
 const media=new R2Media(bucket,null);
 assert.deepEqual(await media.step(f,{},[{partNumber:1,etag:'e'}]),{kind:'reset-upload'});assert.equal(heads,2);
 await media.discard(f);
 bucket.resumeMultipartUpload=()=>({complete:async()=>{throw Error('temporary (10001)');}});
 await assert.rejects(media.step(f,{},[{partNumber:1,etag:'e'}]),/10001/);
});
test('resource diagnostics retain HTTP status platform code and Ray ID only',async()=>{
 const peer=new SignedPeer('https://peer.invalid',new Uint8Array(32).fill(1),{fetcher:async()=>new Response('Error 1102: resource limit; private-details',{status:503,headers:{'cf-ray':'a45366641dc5fdce-SIN'}})});
 await assert.rejects(peer.read({kind:'manifest',version:'v1'}),e=>e.kind==='resource'&&e.http_status===503&&e.platform_code===1102&&e.ray_id==='a45366641dc5fdce-SIN'&&!e.message.includes('private-details'));
});
