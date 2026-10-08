import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {SignedPeer,hmac,sha} from './transport.mjs';
import {dispatch} from './native_dispatch.mjs';
globalThis.crypto ||= webcrypto;
const key=new Uint8Array(32).fill(1);
async function reply(body,options,declared=body.length){
 const request=JSON.parse(options.body),meta=JSON.stringify({version:request.version,offset:request.offset});
 const signature=await hmac(key,['sync-v1-response',options.headers['x-sync-nonce'],'200',meta,await sha(body)].join('\n'));
 return new Response(body,{headers:{'content-length':String(declared),'x-sync-meta':meta,'x-sync-signature':signature}});
}
test('small metadata owns a small exact backing buffer',async()=>{
 const peer=new SignedPeer('https://peer.invalid',key,{fetcher:(_,o)=>reply(new TextEncoder().encode('{}'),o)});
 const body=await peer.read({kind:'candidates',version:'1'});
 assert.equal(body.byteLength,2);assert.equal(body.buffer.byteLength,2);
});
test('declared body lengths are enforced in both directions',async()=>{
 for(const declared of [2,4]){
  const peer=new SignedPeer('https://peer.invalid',key,{fetcher:(_,o)=>reply(new Uint8Array(3),o,declared)});
  await assert.rejects(peer.read({kind:'slice',version:'1',offset:0,length:4}),/bound|shorter/);
 }
});
test('native dispatch returns configured 4 MiB slice as binary without Base64',async()=>{
 const oldFetch=globalThis.fetch,oldBtoa=globalThis.btoa;
 globalThis.fetch=(_,o)=>reply(new Uint8Array(4*1024*1024),o);
 globalThis.btoa=()=>{throw new Error('Base64 must not be used');};
 const env={TEACHER_SYNC_KEY:'01'.repeat(32),DB:{prepare(){return {bind(){return {first:async()=>null};}};}}};
 try{
  const body=await dispatch(env,'read',JSON.stringify({peer:{origin:'https://peer.invalid',secret_ref:'env:TEACHER_SYNC_KEY'},request:{kind:'slice',length:4*1024*1024,offset:0,version:'1'}}));
  assert.ok(body instanceof Uint8Array);assert.equal(body.byteLength,4*1024*1024);
 }finally{globalThis.fetch=oldFetch;globalThis.btoa=oldBtoa;}
});
test('media receipts are queried only for multipart completion',async()=>{
 const originalFetch=globalThis.fetch;globalThis.fetch=(_,o)=>reply(new Uint8Array(3),o);
 try{for(const committed of [0,3]){
  let receipts=0,completed=false;
  const operation='a'.repeat(64);
  const env={TEACHER_SYNC_KEY:'01'.repeat(32),DB:{prepare(sql){return {bind(){return {first:async()=>null,all:async()=>{assert.match(sql,/sync_file_parts/);receipts++;return {results:[{partNumber:1,etag:'e'}]};}};}}; }},MEDIA:{
   head:async()=>completed?{size:3,customMetadata:{sync_operation:operation,sync_source:'1'}}:null,
   resumeMultipartUpload(){return {uploadPart:async(number,stream)=>{await new Response(stream).text();return {partNumber:number,etag:'e'};},complete:async()=>{completed=true;}};}
  }};
  // Media signatures use the stream marker rather than a digest.
  globalThis.fetch=async(_,o)=>{const q=JSON.parse(o.body),meta=JSON.stringify({version:'1',offset:0,length:3,total:3});return new Response(new Uint8Array(3),{headers:{'content-length':'3','x-sync-meta':meta,'x-sync-signature':await hmac(key,['sync-v1-response',o.headers['x-sync-nonce'],'200',meta,'stream'].join('\n'))}});};
  const result=JSON.parse(await dispatch(env,'step',JSON.stringify({peer:{origin:'https://peer.invalid',secret_ref:'env:TEACHER_SYNC_KEY'},file:{upload_id:'u',committed_bytes:committed,total_bytes:3,part_bytes:5*1024*1024,operation_id:operation,staging_key:'sync/'+operation,source_version:'1'},item:{}})));
  assert.equal(result.ok,true);assert.equal(receipts,committed===3?1:0);
 }}finally{globalThis.fetch=originalFetch;}
});
