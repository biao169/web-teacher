// Actual workerd JS RPC + D1 ArrayBuffer binding; Python FFI is tested separately with doubles.
import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {readdirSync} from 'node:fs';
import {createHash,createHmac} from 'node:crypto';
const sdk=await import(process.env.MINIFLARE_MODULE||'miniflare');
test('workerd production auxiliary RPC returns typed bytes and D1 accepts its buffer',async()=>{
 const options={workers:[{
  name:'caller',modules:true,compatibilityDate:'2025-08-01',serviceBindings:{NATIVE:'native'},d1Databases:{DB:'local-test-db'},
  script:`export default {async fetch(request,env){const bytes=await env.NATIVE.read(JSON.stringify({peer:{origin:'https://peer.invalid',secret_ref:'env:TEACHER_SYNC_KEY'},request:{kind:'slice',length:4194304,offset:0,version:'1'}}));if(!(bytes instanceof Uint8Array))throw new Error(String(bytes));await env.DB.prepare('INSERT INTO sample(body) VALUES(?)').bind(bytes.buffer).run();const row=await env.DB.prepare('SELECT length(body) AS n FROM sample').first();return Response.json({typed:true,length:bytes.length,backing:bytes.buffer.byteLength,stored:row.n});}}`
 },{
  name:'native',modules:['native_service.mjs',...readdirSync(new URL('../worker/',import.meta.url)).filter(n=>n.endsWith('.mjs')&&!n.endsWith('.test.mjs')&&n!=='native_service.mjs')].map(n=>({type:'ESModule',path:fileURLToPath(new URL('../worker/'+n,import.meta.url))})),compatibilityDate:'2025-08-01',d1Databases:{DB:'local-test-db'},bindings:{TEACHER_SYNC_KEY:'01'.repeat(32)},
  outboundService:async r=>{
   const body=new Uint8Array(4*1024*1024),meta=JSON.stringify({version:'1',offset:0});
   const signature=createHmac('sha256',Buffer.alloc(32,1)).update(['sync-v1-response',r.headers.get('x-sync-nonce'),'200',meta,createHash('sha256').update(body).digest('hex')].join('\n')).digest('hex');
   return new Response(body,{headers:{'content-length':String(body.length),'x-sync-meta':meta,'x-sync-signature':signature}});
  }
 }]};
 const mf=new sdk.Miniflare(sdk.convertV4MiniflareOptions?sdk.convertV4MiniflareOptions(options):options);
 try{
  const db=await mf.getD1Database('DB','native');await db.exec('CREATE TABLE service_meta(key TEXT PRIMARY KEY,value TEXT); CREATE TABLE sample(body BLOB)');
  const response=await mf.dispatchFetch('http://local.test');assert.equal(response.status,200,await response.clone().text());
  assert.deepEqual(await response.json(),{typed:true,length:4194304,backing:4194304,stored:4194304});
 }finally{await mf.dispose();}
});
