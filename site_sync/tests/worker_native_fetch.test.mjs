// Runs the production transport in workerd, not Node's permissive fetch implementation.
// MINIFLARE_MODULE may point to an installed Miniflare module entrypoint.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash,createHmac} from 'node:crypto';
const sdk=await import(process.env.MINIFLARE_MODULE||'miniflare');
test('workerd native fetch: signed candidates, body, media and platform diagnostics',async()=>{
 const source=readFileSync(new URL('../worker/transport.mjs',import.meta.url),'utf8');
 const diagnostics=readFileSync(new URL('../worker/diagnostics.mjs',import.meta.url),'utf8');
 const script=diagnostics.replace(/export /g,'')+'\n'+source.replace(/import .*? from ['"]\.\/diagnostics\.mjs['"];?/, '')+`\nexport default {async fetch(){const peer=new SignedPeer('https://peer.invalid',new Uint8Array(32).fill(1));const out=[];
 for(const kind of ['candidates','slice','media','platform']){try{const result=await peer.read({kind,version:'v1',length:3,offset:0,total:3},{stream:kind==='media'});out.push({kind,body:kind==='media'?await result.text():new TextDecoder().decode(result)});if(kind==='media')releasePeerResponse(result);}catch(e){out.push({kind,stage:e.stage,code:e.platform_code,status:e.http_status});}}return Response.json(out);}}`;
 const options={modules:true,compatibilityDate:'2025-08-01',compatibilityFlags:['global_fetch_strictly_public'],script,outboundService:async r=>{
  const q=await r.json();if(q.kind==='platform')return new Response('Error 1102',{status:503});
  const body=q.kind==='candidates'?'{}':'abc',meta=JSON.stringify(q.kind==='candidates'?{version:q.version}:{version:q.version,offset:0,length:3,total:3});
  const value=q.kind==='media'?'stream':createHash('sha256').update(body).digest('hex');
  const signature=createHmac('sha256',Buffer.alloc(32,1)).update(['sync-v1-response',r.headers.get('x-sync-nonce'),'200',meta,value].join('\n')).digest('hex');
  return new Response(body,{headers:{'x-sync-meta':meta,'x-sync-signature':signature,'content-length':String(Buffer.byteLength(body))}});
 }};
 const mf=new sdk.Miniflare(sdk.convertV4MiniflareOptions?sdk.convertV4MiniflareOptions(options):options);
 try{const rows=await(await mf.dispatchFetch('http://local.test')).json();assert.deepEqual(rows,[{kind:'candidates',body:'{}'},{kind:'slice',body:'abc'},{kind:'media',body:'abc'},{kind:'platform',stage:'response_headers',code:1102,status:503}]);}finally{await mf.dispose();}
});
