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

test('D1 status summary reads only a 21-row page despite large task/event history',async()=>{
 const {spawnSync}=await import('node:child_process');
 const built=spawnSync('python',['-c',"import json; from site_sync.admin.monitor import query,FIELDS; print(json.dumps({'query':query('g','all',None,20),'fields':FIELDS}))"],{encoding:'utf8'});assert.equal(built.status,0,built.stderr);
 const projection=JSON.parse(built.stdout),text=new Set(['task_id','peer_id','status','phase','mode']);
 const fields=projection.fields.split(',').map(n=>n+' '+(text.has(n)?'TEXT':'INTEGER')).join(',');
 const options={modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2025-08-01',d1Databases:{DB:'status-summary-test'}};
 const mf=new sdk.Miniflare(sdk.convertV4MiniflareOptions?sdk.convertV4MiniflareOptions(options):options);
 try{
  const db=await mf.getD1Database('DB');
  await db.exec(`CREATE TABLE sync_tasks(grant_id TEXT,${fields}); CREATE INDEX sync_tasks_monitor ON sync_tasks(grant_id,created_at DESC,task_id DESC); CREATE TABLE sync_events(detail TEXT)`);
  await db.prepare("WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<20000) INSERT INTO sync_tasks(task_id,grant_id,status,phase,created_at,progress_seq,total_errors,no_progress_count) SELECT printf('%032d',x),'g','done','done',x,37,46,0 FROM n").run();
  await db.prepare("WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<100000) INSERT INTO sync_events SELECT '{}' FROM n").run();
  const [sql,args]=projection.query;const rows=await db.prepare(sql).bind(...args).all();
  const plan=(await db.prepare('EXPLAIN QUERY PLAN '+sql).bind(...args).all()).results;
  assert.equal(rows.results.length,21);assert.equal(rows.results[0].progress_seq,37);assert.ok(rows.meta.rows_read<=50,JSON.stringify(rows.meta));
  assert.ok(plan.some(x=>x.detail.includes('SEARCH sync_tasks USING INDEX sync_tasks_monitor')));
  console.log(JSON.stringify({status_summary_plan:plan,meta:rows.meta,task_rows:20000,event_rows:100000}));
 }finally{await mf.dispose();}
});
