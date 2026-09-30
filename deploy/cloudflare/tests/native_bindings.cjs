/* Local workerd bindings only; no credentials or remote resource operations. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {Miniflare,convertV4MiniflareOptions}=require(path.resolve(process.argv[2],'node_modules/miniflare'));
(async()=>{
 const statements=JSON.parse(fs.readFileSync(process.argv[3],'utf8'));
 const mf=new Miniflare(convertV4MiniflareOptions({cf:false,host:'127.0.0.1',port:8795,inspectorPort:9295,
  workers:[{name:'teacher-binding-acceptance',modules:true,compatibilityDate:'2026-09-14',
   d1Databases:{DB:'11111111-1111-4111-8111-111111111111'},r2Buckets:{MEDIA:'local-acceptance-only'},
   script:'export default { fetch(){return new Response("local acceptance")} }'}]}));
 try{
  const db=await mf.getD1Database('DB');
  await db.batch(statements.map(sql=>db.prepare(sql)));
  const tables=await db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  for(const name of ['auth_users','media_assets','temporary_shares','transfer_chunks','transfer_codes'])
   assert(tables.results.some(r=>r.name===name),name);
  await db.prepare('INSERT INTO service_meta(key,value) VALUES(?,?)').bind('probe-existing','keep').run();
  await assert.rejects(()=>db.batch([
   db.prepare('INSERT INTO service_meta(key,value) VALUES(?,?)').bind('probe-rollback','discard'),
   db.prepare('INSERT INTO service_meta(key,value) VALUES(?,?)').bind('probe-existing','conflict')]));
  assert.equal(await db.prepare('SELECT value FROM service_meta WHERE key=?').bind('probe-rollback').first(),null);
  const json=await db.prepare("SELECT json_extract(?, '$.word') word, ? missing").bind('{"word":"中文"}',null).first();
  assert.deepEqual(json,{word:'中文',missing:null});
  const bucket=await mf.getR2Bucket('MEDIA');
  await bucket.put('media/permanent.bin',new Uint8Array([1,2,3,4]));
  await bucket.put('transfer/media/probe/part.bin',new Uint8Array([0,255,128,64]));
  const range=await bucket.get('transfer/media/probe/part.bin',{range:{offset:1,length:2}});
  assert.deepEqual([...new Uint8Array(await range.arrayBuffer())],[255,128]);
  const listing=await bucket.list({prefix:'transfer/media/'});assert.equal(listing.objects.length,1);
  await bucket.delete(listing.objects[0].key);
  assert.equal(await bucket.get('transfer/media/probe/part.bin'),null);
  assert.equal((await bucket.head('media/permanent.bin')).size,4);
  console.log(JSON.stringify({scope:'local JS workerd bindings; not Python Worker or cloud',schema_statements:statements.length,d1_atomic_rollback:true,d1_json_null:true,r2_range:true,r2_prefix_isolation:true}));
 }finally{await mf.dispose()}
})().catch(error=>{console.error(error);process.exitCode=1});
