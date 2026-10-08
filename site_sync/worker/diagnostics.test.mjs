import {test} from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {dispatch} from './native_dispatch.mjs';
import {SignedPeer} from './transport.mjs';
globalThis.crypto ||= webcrypto;
test('database failure retains safe stage without leaking SQL or credentials',async()=>{
 const env={DB:{prepare(){throw new TypeError('secret SQL key=PRIVATE');}}};
 const result=JSON.parse(await dispatch(env,'read',JSON.stringify({peer:{origin:'https://example.com',secret_ref:'env:TEACHER_SYNC_KEY'},request:{kind:'candidates'}})));
 assert.equal(result.stage,'admission');assert.equal(result.error_type,'TypeError');assert.ok(!JSON.stringify(result).includes('PRIVATE'));
});
test('large Cloudflare error page keeps 1102 and ray ID',async()=>{
 const peer=new SignedPeer('https://example.com',new Uint8Array(32),{fetcher:async()=>new Response('Error 1102 '+ 'x'.repeat(20000),{status:503,headers:{'cf-ray':'abcdef1234567890-SIN'}})});
 await assert.rejects(peer.read({kind:'candidates',version:'catalog-v1'}),e=>e.platform_code===1102&&e.http_status===503&&e.ray_id==='abcdef1234567890-SIN');
});
test('invocation diagnosis is classified without exposing raw message',async()=>{
 const old=globalThis.fetch;globalThis.fetch=()=>{throw new TypeError('Illegal invocation: incorrect this reference PRIVATE');};
 try{
 const env={TEACHER_SYNC_KEY:'ab'.repeat(32),DB:{prepare(){return {bind(){return this;},first:async()=>null};}}};
 const result=JSON.parse(await dispatch(env,'read',JSON.stringify({peer:{origin:'https://example.com',secret_ref:'env:TEACHER_SYNC_KEY'},request:{kind:'candidates',version:'v1'}})));
 assert.equal(result.stage,'fetch_request');assert.equal(result.code,'INVOCATION_CONTEXT');assert.ok(!JSON.stringify(result).includes('PRIVATE'));
 }finally{globalThis.fetch=old;}
});
test('cleanup error cannot replace authentication failure',async()=>{
 const p=new SignedPeer('https://example.com',new Uint8Array(32),{fetcher:async()=>({status:403,bodyUsed:false,body:{cancel:async()=>{throw new TypeError('cleanup');}}})});
 await assert.rejects(p.read({kind:'candidates',version:'v1'}),e=>e.kind==='credential'&&e.http_status===403&&e.stage==='response_headers');
});

test('403 carries bounded remote location and trace without response text',async()=>{
 const p=new SignedPeer('https://example.com',new Uint8Array(32),{fetcher:async()=>new Response('PRIVATE',{status:403,headers:{'x-sync-error':'SYNC_SCOPE_DENIED','x-sync-trace':'a'.repeat(32),'x-sync-component':'peer-site','x-sync-stage':'export_authorization','x-sync-release':'0.16.028'}})});
 await assert.rejects(p.read({kind:'candidates',version:'v1'}),e=>e.code==='SYNC_SCOPE_DENIED'&&e.peer_stage==='export_authorization'&&e.peer_request_id==='a'.repeat(32)&&!JSON.stringify(e).includes('PRIVATE'));
});
