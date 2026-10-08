import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
const sdk=await import(process.env.MINIFLARE_MODULE||'miniflare');
test('actual workerd RPC streams uploads into R2, hashes, bounds and rejects malformed input',async()=>{
 const options={workers:[{
  name:'caller',modules:true,compatibilityDate:'2025-08-01',serviceBindings:{NATIVE:'native'},d1Databases:{DB:'upload-test'},
  script:`export default {async fetch(request,env){const url=new URL(request.url);const q={key:'a'.repeat(32)+'.png',extension:'png',size:Number(url.searchParams.get('size')||request.headers.get('content-length')),limit:20*1024*1024,allowed_mimes:['image/png'],crop:url.searchParams.has('crop'),request_id:'b'.repeat(32)};if(url.searchParams.has('badkey'))q.key='../bad.png';q.session='media:upload-session:999999999999:'+'a'.repeat(32);await env.DB.prepare('INSERT OR REPLACE INTO service_meta(key,value) VALUES (?,?)').bind(q.session,JSON.stringify({version:1,uid:'a'.repeat(32),object_key:q.key,status:'receiving',expires_at:url.searchParams.has('expired')?0:Math.floor(Date.now()/1000)+240})).run();return new Response(await env.NATIVE.upload_media(request.body,JSON.stringify(q)));}}`
 },{
  name:'native',modules:['native_service.mjs',...readdirSync(new URL('../worker/',import.meta.url)).filter(n=>n.endsWith('.mjs')&&!n.endsWith('.test.mjs')&&n!=='native_service.mjs')].map(n=>({type:'ESModule',path:fileURLToPath(new URL('../worker/'+n,import.meta.url))})),compatibilityDate:'2025-08-01',r2Buckets:{MEDIA:'test-media'},d1Databases:{DB:'upload-test'},bindings:{TEACHER_MEDIA_PREFIX:'custom/media/'}
 }]};
 const mf=new sdk.Miniflare(sdk.convertV4MiniflareOptions?sdk.convertV4MiniflareOptions(options):options);
 const key='custom/media/'+'a'.repeat(32)+'.png';
 try{
  const bucket=await mf.getR2Bucket('MEDIA','native');
  const db=await mf.getD1Database('DB','native');await db.exec('CREATE TABLE service_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL)');
  for(const size of [8,900*1024,2*1024*1024,20*1024*1024]){
   const bytes=new Uint8Array(size);bytes.set([137,80,78,71,13,10,26,10]);
   const response=await mf.dispatchFetch('http://local.test?size='+size+(size===900*1024?'&crop=1':''),{method:'POST',body:bytes});
   const result=await response.json();assert.equal(result.ok,true,JSON.stringify(result));assert.equal(result.size,size);assert.equal(result.checksum,createHash('sha256').update(bytes).digest('hex'));
   assert.equal(JSON.parse((await db.prepare('SELECT value FROM service_meta').first()).value).status,'stored');
   assert.equal(result.prefix.length,size===900*1024?131072:0);assert.equal((await bucket.head(key)).size,size);await bucket.delete(key);
  }
  const png=new Uint8Array(100);png.set([137,80,78,71,13,10,26,10]);
  for(const [query,body,code] of [['',new Uint8Array(100),'MEDIA_TYPE'],['?size=90',png,'MEDIA_SIZE'],['?size=110',png,'MEDIA_LENGTH'],['?badkey=1&size=100',png,'MEDIA_REQUEST'],['?size=20971521',png,'MEDIA_REQUEST'],['?expired=1&size=100',png,'MEDIA_EXPIRED']]){
   const result=await (await mf.dispatchFetch('http://local.test'+(query||'?size=100'),{method:'POST',body})).json();assert.equal(result.ok,false);assert.equal(result.code,code);assert.equal(await bucket.head(key),null);
   // Each rejected upload must leave the same instance able to accept a new one.
   const next=await (await mf.dispatchFetch('http://local.test?size=100',{method:'POST',body:png})).json();
   assert.equal(next.ok,true,JSON.stringify(next));assert.equal((await bucket.head(key)).size,100);
   await bucket.delete(key);
  }
 }finally{await mf.dispose();}
});

test('workerd storage rejection and interrupted source settle without unhandled promises',async()=>{
 const dir=new URL('../worker/',import.meta.url);
 const script=`import {uploadMedia} from './media_upload.mjs';
 export default {async fetch(request){
  const badStorage=new URL(request.url).pathname==='/storage';
  const body=new ReadableStream({type:'bytes',pull(c){c.error(new Error('source disconnected'));}});
  const env={DB:{prepare:()=>({bind:()=>({first:async()=>({value:JSON.stringify({version:1,object_key:'a'.repeat(32)+'.png',status:'receiving',expires_at:Math.floor(Date.now()/1000)+240})})})})},MEDIA:{put:badStorage?()=>Promise.reject(new Error('R2 unavailable')):async(k,stream)=>{await stream.pipeTo(new WritableStream());return {};},delete:async()=>{}},TEACHER_MEDIA_PREFIX:'media/'};
  return new Response(await uploadMedia(env,badStorage?request.body:body,JSON.stringify({session:'media:upload-session:999999999999:'+'a'.repeat(32),key:'a'.repeat(32)+'.png',extension:'png',size:100,limit:100,allowed_mimes:[]})));
 }};`;
 const options={workers:[{name:'faults',compatibilityDate:'2025-08-01',modules:[{type:'ESModule',path:fileURLToPath(new URL('fault-harness.mjs',dir)),contents:script},...['media_upload.mjs','diagnostics.mjs'].map(n=>({type:'ESModule',path:fileURLToPath(new URL(n,dir))}))]}]};
 const mf=new sdk.Miniflare(sdk.convertV4MiniflareOptions?sdk.convertV4MiniflareOptions(options):options);
 try{
  for(const path of ['/storage','/source']){
   const b=new Uint8Array(100);b.set([137,80,78,71,13,10,26,10]);
   const r=await mf.dispatchFetch('http://test'+path,{method:'POST',body:b});
   const result=await r.json();assert.equal(result.ok,false);assert.equal(result.status,503);assert.equal(result.code,path==='/storage'?'MEDIA_STORAGE':'MEDIA_STREAM');
  }
 }finally{await mf.dispose();}
});

test('lease expiring after R2 put prevents receipt and cleans late object',async()=>{
 const dir=new URL('../worker/',import.meta.url);
 const script=`import {uploadMedia} from './media_upload.mjs';export default {async fetch(request,env){
 const key='a'.repeat(32)+'.png',session='media:upload-session:999999999999:'+'a'.repeat(32);
 await env.DB.exec('CREATE TABLE service_meta(key TEXT PRIMARY KEY,value TEXT)');
 await env.DB.prepare('INSERT INTO service_meta VALUES (?,?)').bind(session,JSON.stringify({version:1,object_key:key,status:'receiving',expires_at:Math.floor(Date.now()/1000)+240})).run();
 const bucket={put:async(k,b)=>{const r=await env.MEDIA.put(k,b);await env.DB.prepare("UPDATE service_meta SET value=json_set(value,'$.expires_at',0)").run();return r;},delete:k=>env.MEDIA.delete(k)};
 const result=JSON.parse(await uploadMedia({DB:env.DB,MEDIA:bucket,TEACHER_MEDIA_PREFIX:'media/'},request.body,JSON.stringify({session,key,extension:'png',size:100,limit:100,allowed_mimes:[]})));
 return Response.json({result,object:!!await env.MEDIA.head('media/'+key),status:JSON.parse((await env.DB.prepare('SELECT value FROM service_meta').first()).value).status});
 }};`;
 const options={workers:[{name:'expired',compatibilityDate:'2025-08-01',r2Buckets:{MEDIA:'late-media'},d1Databases:{DB:'late-db'},modules:[{type:'ESModule',path:fileURLToPath(new URL('expiry-harness.mjs',dir)),contents:script},...['media_upload.mjs','diagnostics.mjs'].map(n=>({type:'ESModule',path:fileURLToPath(new URL(n,dir))}))]}]};
 const mf=new sdk.Miniflare(sdk.convertV4MiniflareOptions?sdk.convertV4MiniflareOptions(options):options);
 try{const b=new Uint8Array(100);b.set([137,80,78,71,13,10,26,10]);const value=await(await mf.dispatchFetch('http://test/',{method:'POST',body:b})).json();assert.equal(value.result.code,'MEDIA_EXPIRED');assert.equal(value.result.status,409);assert.equal(value.object,false);assert.equal(value.status,'receiving');}finally{await mf.dispose();}
});
