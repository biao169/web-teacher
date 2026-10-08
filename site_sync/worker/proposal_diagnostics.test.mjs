import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,webcrypto} from 'node:crypto';
import {dispatch} from './native_dispatch.mjs';
import {SignedPeer} from './transport.mjs';
import {RELEASE} from './diagnostics.mjs';
globalThis.crypto ||= webcrypto;
test('native status uses saved credential, does not fetch peer or expose secret',async()=>{
 const key='ab'.repeat(32),value=JSON.stringify({version:1,key,revision:'r',updated_at:'now',updated_by:'admin'});
 const env={DB:{prepare:()=>({bind:()=>({first:async()=>({value})})})}};
 const result=JSON.parse(await dispatch(env,'status','{}'));assert.equal(result.ok,true);assert.equal(result.value.release,RELEASE);assert.equal(result.value.credential_fingerprint,createHash('sha256').update(Buffer.from(key,'hex')).digest('hex').slice(0,16));assert.ok(!JSON.stringify(result).includes(key));
});
for(const [status,headers,code] of [[302,{location:'https://login.invalid/?secret=hidden'},'PEER_REDIRECT'],[403,{'cf-mitigated':'challenge'},'PEER_ACCESS_CHALLENGE']])test('distinguish '+code,async()=>{
 let calls=0;const p=new SignedPeer('https://peer.invalid',new Uint8Array(32),{fetcher:async(url,options)=>{calls++;assert.equal(options.redirect,'manual');return new Response('PRIVATE HTML',{status,headers});}});
 await assert.rejects(p.read({kind:'probe',version:'probe-v1'}),e=>e.code===code&&e.http_status===status&&!JSON.stringify(e).includes('PRIVATE'));assert.equal(calls,1);
});
test('probe-v2 capability response verifies signature without fetching candidates',async()=>{
 const {hmac,sha}=await import('./transport.mjs');const key=new Uint8Array(32).fill(7);let calls=0;
 const p=new SignedPeer('https://peer.invalid',key,{fetcher:async(url,options)=>{
  calls++;assert.deepEqual(JSON.parse(options.body),{kind:'probe',version:'probe-v2'});
  const body=new TextEncoder().encode(JSON.stringify({ok:true,protocol:'probe-v2',release:RELEASE,export_enabled:true,allowed_scopes:['restore_media_assets']}));
  const meta=JSON.stringify({version:'probe-v2'}),sig=await hmac(key,['sync-v1-response',options.headers['x-sync-nonce'],'200',meta,await sha(body)].join('\n'));
  return new Response(body,{headers:{'content-length':String(body.length),'x-sync-meta':meta,'x-sync-signature':sig}});
 }});
 const value=JSON.parse(new TextDecoder().decode(await p.read({kind:'probe',version:'probe-v2'})));
 assert.equal(calls,1);assert.deepEqual(value.allowed_scopes,['restore_media_assets']);
});
