// Real local workerd D1 binding. Not a deployed Cloudflare quota/PoP test.
import test from 'node:test';
import assert from 'node:assert/strict';
const sdk=await import(process.env.MINIFLARE_MODULE||'miniflare');
test('D1 clone prefix count uses PK range and atomically advances the checkpoint',async()=>{
 const options={modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2025-08-01',d1Databases:{DB:'clone-verify-test'}};
 const mf=new sdk.Miniflare(sdk.convertV4MiniflareOptions?sdk.convertV4MiniflareOptions(options):options);
 try{
  const db=await mf.getD1Database('DB');
  await db.exec('CREATE TABLE service_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL) STRICT; CREATE TABLE progress(seq INTEGER); INSERT INTO progress VALUES(21)');
  await db.prepare("WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<100000) INSERT INTO service_meta SELECT 'unrelated:'||x,'{}' FROM n").run();
  const lo='sync:clone:task:media_assets:',hi='sync:clone:task:media_assets;';
  await db.batch([0,1,2].map(x=>db.prepare('INSERT INTO service_meta VALUES(?,?)').bind(lo+x,'{}')));
  await db.prepare('INSERT INTO service_meta VALUES(?,?)').bind('sync:clone-state:task',JSON.stringify({phase:'verify_tables',table:0,after:''})).run();
  const old=(await db.prepare('EXPLAIN QUERY PLAN SELECT count(*) n FROM service_meta WHERE key LIKE ?').bind(lo+'%').all()).results;
  const next=(await db.prepare('EXPLAIN QUERY PLAN SELECT count(*) n FROM service_meta WHERE key >= ? AND key < ?').bind(lo,hi).all()).results;
  assert.ok(old.some(x=>x.detail.includes('SCAN')));assert.ok(next.every(x=>!x.detail.includes('SCAN')));assert.ok(next.some(x=>x.detail.includes('SEARCH')&&x.detail.includes('key>?')));
  const counted=await db.prepare('SELECT count(*) n FROM service_meta WHERE key >= ? AND key < ?').bind(lo,hi).all();assert.equal(counted.results[0].n,3);
  assert.ok(counted.meta.rows_read<=4,JSON.stringify(counted.meta));
  await db.batch([db.prepare('UPDATE service_meta SET value=? WHERE key=?').bind(JSON.stringify({phase:'verify_tables',table:1,after:''}),'sync:clone-state:task'),db.prepare('UPDATE progress SET seq=seq+1')]);
  assert.equal(JSON.parse((await db.prepare('SELECT value FROM service_meta WHERE key=?').bind('sync:clone-state:task').first()).value).table,1);
  assert.equal((await db.prepare('SELECT seq FROM progress').first()).seq,22);
  console.log(JSON.stringify({old_plan:old,new_plan:next,count_meta:counted.meta,unrelated_rows:100000,matched:3}));
 }finally{await mf.dispose();}
});
