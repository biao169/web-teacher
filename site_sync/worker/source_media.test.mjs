import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceMedia,mediaBucket} from './source_media.mjs';
import {SignedPeer} from './transport.mjs';
const secret=Uint8Array.from({length:32},()=>0x6a);
function fixture(allowed=true){
 const calls=[];
 const env={TEACHER_SYNC_KEY:'6a'.repeat(32),TEACHER_MEDIA_PREFIX:'custom/media/'};
 env.DB={prepare:sql=>({bind:(...params)=>{
  calls.push({sql,params});
  return {first:async()=>sql.includes('sync_connections')?(allowed?{ok:1}:null):{object_key:'uploads/a.png',size:8},run:async()=>({success:true})};
 }})};
 env.MEDIA={async get(key,opts){
  calls.push({key,opts});
  return {size:8,body:new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('abcdefgh').slice(opts.range.offset,opts.range.offset+opts.range.length));c.close();}})};
 }};
 return {calls,env};
}
const request={kind:'media',task:'job',module:'profiles',record:'p',file:'a',version:'v1',offset:2,length:3,total:8};
test('signed native source streams bounded range under configured prefix',async()=>{const f=fixture();const peer=new SignedPeer('https://source.example',secret,{fetcher:(url,options)=>sourceMedia(f.env,new Request(url,options))});const r=await peer.read(request,{stream:true});assert.equal(await r.text(),'cde');assert.equal(f.calls.at(-1).key,'custom/media/uploads/a.png');assert.equal(f.calls[1].params[2],'job');});
test('revoked source grant rejects before touching storage',async()=>{const f=fixture(false);const peer=new SignedPeer('https://source.example',secret,{fetcher:(url,options)=>sourceMedia(f.env,new Request(url,options))});await assert.rejects(peer.read(request,{stream:true}),e=>e.kind==='authorization');assert.equal(f.calls.length,1);});
test('unsigned native request cannot query database',async()=>{const f=fixture();const r=await sourceMedia(f.env,new Request('https://source.example/sync/v1/read',{method:'POST',body:'{}'}));assert.equal(r.status,403);assert.equal(f.calls.length,0);});
test('native bucket wrapper prefixes multipart upload and resume',async()=>{const calls=[];const native={createMultipartUpload:(...v)=>calls.push(v),resumeMultipartUpload:(...v)=>calls.push(v)};const b=mediaBucket({MEDIA:native,TEACHER_MEDIA_PREFIX:'custom/'});b.createMultipartUpload('sync/op',{});b.resumeMultipartUpload('sync/op','id');assert.deepEqual(calls,[['custom/sync/op',{}],['custom/sync/op','id']]);});
test('D1/R2 temporary failures remain retriable and renew export TTL',async()=>{
 const f=fixture();f.env.MEDIA.get=async()=>{throw Error('temporary storage outage');};
 const peer=new SignedPeer('https://source.example',secret,{fetcher:(u,o)=>sourceMedia(f.env,new Request(u,o))});
 await assert.rejects(peer.read(request,{stream:true}),e=>e.kind==='resource');
 assert.ok(f.calls.some(c=>c.sql?.includes('UPDATE sync_exports SET expires_at')));
 assert.ok(f.calls[0].sql.includes('g.expires_at>'));
});
test('missing media snapshot is rebuilt once with fresh signed requests',async()=>{
 const hash='a'.repeat(64),seen=[];let restored=false;
 const {hmac,sha}=await import('./transport.mjs');
 const peer=new SignedPeer('https://source.example',secret,{fetcher:async(u,o)=>{
  const q=JSON.parse(o.body);seen.push({q,nonce:o.headers['x-sync-nonce']});
  if(q.kind==='media'&&!restored)return new Response('expired',{status:410});
  const data=q.kind==='manifest'?JSON.stringify({version:q.version,snapshot_hash:hash}):'cde';
  if(q.kind==='manifest')restored=true;
  const stream=q.kind==='media',meta=JSON.stringify(stream?{version:q.version,offset:2,length:3,total:8}:{version:q.version});
  const sig=await hmac(secret,['sync-v1-response',o.headers['x-sync-nonce'],'200',meta,stream?'stream':await sha(new TextEncoder().encode(data))].join('\n'));
  return new Response(data,{headers:{'x-sync-meta':meta,'x-sync-signature':sig,'content-length':String(data.length)}});
 }});
 assert.equal(await (await peer.read({...request,record_version:'record-v1',snapshot_hash:hash},{stream:true})).text(),'cde');
 assert.deepEqual(seen.map(x=>x.q.kind),['media','manifest','media']);
 assert.equal(new Set(seen.map(x=>x.nonce)).size,3);
 assert.equal(seen[1].q.snapshot_hash,hash);
});
test('missing snapshot requests recovery but removed media is a conflict',async()=>{
 for(const exists of [false,true]){
  const f=fixture();f.env.DB.prepare=sql=>({bind:()=>({first:async()=>sql.includes('sync_connections')?{ok:1}:sql.includes('SELECT 1 FROM sync_exports')?(exists?{ok:1}:null):null})});
  let status;
  const p=new SignedPeer('https://source.example',secret,{fetcher:async(u,o)=>{const r=await sourceMedia(f.env,new Request(u,o));status=r.status;return r;}});
  await assert.rejects(p.read(request,{stream:true}),e=>e.kind==='conflict');
  assert.equal(status,exists?409:410);
 }
});
