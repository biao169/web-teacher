// After a successful enabled production build: node test-examples/production-http.mjs [teacher-root]
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, symlinkSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { randomBytes } from 'node:crypto';
import { Processes } from './support/windows-oneclick/launcher.mjs';
const here=dirname(fileURLToPath(import.meta.url));
const teacher=resolve(process.argv[2]??join(here,'runtime/academic-cms'));
const tool=join(dirname(teacher),'file-transfer');
const temp=mkdtempSync(join(tmpdir(),'academic-production-http-'));
const run=new Processes();
async function port(){const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const p=server.address().port;await new Promise(r=>server.close(r));return p;}
async function ready(url,child){
  for(let i=0;i<100;i++){
    if(child.finished)throw new Error('Service exited before ready');
    try{const r=await fetch(url,{signal:AbortSignal.timeout(2000)});if(r.ok)return;}catch{}
    await new Promise(r=>setTimeout(r,200));
  }
  throw new Error('Readiness timeout: '+url);
}
try{
  const websitePort=await port(),transferPort=await port();
  const copy=join(temp,'file-transfer');
  cpSync(tool,copy,{recursive:true,filter:p=>!p.slice(tool.length).split(/[\\/]/).some(x=>['node_modules','storage','config.local.json','.git'].includes(x))});
  symlinkSync(join(tool,'node_modules'),join(copy,'node_modules'),process.platform==='win32'?'junction':'dir');
  writeFileSync(join(copy,'config.local.json'),JSON.stringify({configVersion:1,host:'127.0.0.1',port:transferPort,dataDirectory:'storage/data'}));
  const origin=`http://127.0.0.1:${websitePort}`;
  const env={...process.env};
  for(const key of Object.keys(env))if(/^(CMS_|NUXT_|FT_|NITRO_)/.test(key))delete env[key];
  Object.assign(env,{NODE_ENV:'production',CMS_DATABASE_PATH:join(temp,'site.sqlite3'),NUXT_AUTH_SECRET:randomBytes(48).toString('base64url'),NUXT_MEDIA_GRANT_SECRET:randomBytes(48).toString('base64url'),NUXT_AUTH_TRUSTED_ORIGINS:'https://smoke.example.invalid',NUXT_AUTH_SECURE_COOKIES:'true',NUXT_LOCALE_GEO_IP_ENABLED:'false',NITRO_HOST:'127.0.0.1',NITRO_PORT:String(websitePort),FT_TEACHER_MODULE_ENABLED:'true'});
  await run.run(process.execPath,['scripts/db/migrate.mjs'],{cwd:teacher,env,capture:true});
  await run.run(process.execPath,['scripts/initialize-bridge.mjs'],{cwd:copy,env,capture:true});
  const transfer=run.start(process.execPath,['scripts/start.mjs'],{cwd:copy,env,capture:true});
  await ready(`http://127.0.0.1:${transferPort}/transfer-api/ready`,transfer);
  const site=run.start(process.execPath,[join(copy,'scripts/teacher.mjs'),'start',teacher],{cwd:teacher,env,capture:true});
  await ready(origin+'/health',site);
  for(const path of ['/health','/zh','/en','/zh/transfer','/en/transfer','/api/v1/public/home?locale=zh']){
    const response=await fetch(origin+path,{signal:AbortSignal.timeout(10000)});
    assert.equal(response.status,200,path);console.log('PASS HTTP 200 '+path);
  }
  const bridge=await fetch(origin+'/transfer-api/v1/capabilities',{signal:AbortSignal.timeout(10000)});
  const body=await bridge.json();
  assert.equal(bridge.status,200,'teacher bridge: '+JSON.stringify(body));
  assert.equal(body.protocolVersion,1);assert.equal(body.identityBridgeAvailable,true);
  console.log('PASS teacher → transfer bridge ready (no browser transfer or TLS claim)');
}finally{
  await run.stop();
  rmSync(temp,{recursive:true,force:true});
}
