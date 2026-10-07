/* Local workerd: real DO alarm -> private service RPC -> D1 update. No cloud access. */
const path=require('node:path'),assert=require('node:assert/strict');
const packages=path.resolve(process.argv[2],'node_modules');
const {Miniflare,convertV4MiniflareOptions}=require(path.join(packages,'miniflare'));
const esbuild=require(path.join(packages,'esbuild'));
(async()=>{
 const bundle=await esbuild.build({entryPoints:['site_sync/worker/native_service.mjs'],bundle:true,write:false,format:'esm',platform:'browser',external:['cloudflare:workers']});
 const mf=new Miniflare(convertV4MiniflareOptions({cf:false,host:'127.0.0.1',port:0,inspectorPort:0,workers:[
  {name:'driver',modules:true,compatibilityDate:'2026-09-14',serviceBindings:{NATIVE:'native'},script:`export default {async fetch(r,e){return new Response(await e.NATIVE.wake())}}`},
  {name:'native',modules:true,compatibilityDate:'2026-09-14',script:bundle.outputFiles[0].text,d1Databases:{DB:'alarm-test'},durableObjects:{SYNC_COORDINATOR:{className:'SyncCoordinator',useSQLite:true}},serviceBindings:{SYNC_RUNNER:'runner'}},
  {name:'runner',modules:true,compatibilityDate:'2026-09-14',d1Databases:{DB:'alarm-test'},script:`import {WorkerEntrypoint} from 'cloudflare:workers';export default class extends WorkerEntrypoint {async sync_tick(){await this.env.DB.prepare("UPDATE sync_tasks SET status='done'").run();return JSON.stringify({action:'stepped'});}}`}
 ]}));
 try{
  const db=await mf.getD1Database('DB','native');
  await db.exec("CREATE TABLE sync_tasks(status TEXT,phase TEXT,cancel_intent INTEGER,next_run_at INTEGER,lease_until INTEGER);CREATE TABLE sync_schedules(enabled INTEGER,next_run_at INTEGER);INSERT INTO sync_tasks VALUES('ready','discover',0,0,0);");
  const response=await mf.dispatchFetch('http://local/wake');assert.equal(await response.text(),'armed');
  let status;for(let n=0;n<25;n++){await new Promise(r=>setTimeout(r,1000));status=(await db.prepare('SELECT status FROM sync_tasks').first()).status;if(status==='done')break;}
  assert.equal(status,'done');console.log('PASS: native Durable Object alarm invoked private service RPC and updated D1');
 }finally{await mf.dispose();}
})().catch(e=>{console.error(e);process.exitCode=1;});
