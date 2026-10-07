import {test} from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {SignedPeer} from './transport.mjs';
globalThis.crypto ||= webcrypto;
test('request deadline aborts fetch and classifies resource recovery',async()=>{
 let aborted=false;
 const keepAlive=setTimeout(()=>{},1000);
 try{const p=new SignedPeer('https://example.com',new Uint8Array(32),{timeoutMs:10,fetcher:async(url,{signal})=>new Promise((resolve,reject)=>{signal.addEventListener('abort',()=>{aborted=true;reject(signal.reason);});})});
 await assert.rejects(p.read({kind:'candidates',version:'catalog-v1'}),e=>e.kind==='resource');assert.equal(aborted,true);
 }finally{clearTimeout(keepAlive);}
});
import {hmac,releasePeerResponse} from './transport.mjs';
test('stream release aborts underlying fetch without replacing native body',async()=>{
 const key=new Uint8Array(32);let signal,original;
 const peer=new SignedPeer('https://example.com',key,{fetcher:async(url,options)=>{
  signal=options.signal;const meta=JSON.stringify({version:'v',offset:0,length:1,total:1});
  const signature=await hmac(key,['sync-v1-response',options.headers['x-sync-nonce'],'200',meta,'stream'].join('\n'));
  original=new Response(new Uint8Array([1]),{headers:{'content-length':'1','x-sync-meta':meta,'x-sync-signature':signature}});return original;
 }});
 const response=await peer.read({kind:'media',version:'v',offset:0,length:1,total:1},{stream:true});
 assert.equal(response,original);assert.equal(signal.aborted,false);releasePeerResponse(response);assert.equal(signal.aborted,true);releasePeerResponse(response);await response.body.cancel();
});
