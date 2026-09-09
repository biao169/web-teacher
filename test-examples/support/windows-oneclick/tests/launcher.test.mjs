import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:net';
import { createRequire } from 'node:module';
import { acquireLock, assertPortFree, locateTeacher, readOptions, Processes, initializeDemo, resolvePnpmOperation, repairTransferModuleSpecifier, repairTransferInternalPaths, clearStaleTransferLock } from '../launcher.mjs';

test('paths with Chinese, spaces and metacharacters resolve without a shell', () => {
  const base=mkdtempSync(join(tmpdir(),'oneclick-中文 & '));
  try {
    const root=join(base,'教师 web-test');mkdirSync(root);writeFileSync(join(root,'package.json'),JSON.stringify({name:'academic-cms'}));
    assert.equal(locateTeacher(base),root);
    assert.equal(locateTeacher(base,'教师 web-test'),root);
    const other=join(base,'second');mkdirSync(other);writeFileSync(join(other,'package.json'),JSON.stringify({name:'academic-cms'}));
    assert.throws(()=>locateTeacher(base),/多个/);
    writeFileSync(join(base,'windows-oneclick.config.json'),JSON.stringify({port:65536}));
    assert.throws(()=>readOptions(base),/端口/);
  } finally {rmSync(base,{recursive:true,force:true});}
});
test('duplicate launches are blocked and completed locks are released', () => {
  const base=mkdtempSync(join(tmpdir(),'oneclick-lock-'));
  try {
    const release=acquireLock(base);
    assert.throws(()=>acquireLock(base),/已有/);release();
    const again=acquireLock(base);again();
    assert.equal(existsSync(join(base,'data/windows-oneclick.lock')),false);
  } finally {rmSync(base,{recursive:true,force:true});}
});
test('occupied port is rejected without touching its server',async()=>{
  const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
  try{await assert.rejects(assertPortFree(server.address().port),/占用/);assert.equal(server.listening,true);}finally{await new Promise(r=>server.close(r));}
});
test('the supervisor stops only its own child and stop is repeatable',async()=>{
  const run=new Processes();
  const child=run.start(process.execPath,['-e','setInterval(()=>{},1000)'],{capture:true,env:process.env});
  await run.stop();await run.stop();await child.done;
  assert.equal(child.finished,true);
});
test('the Windows wrapper maps only the two dependency operations used by the original teacher initializer',()=>{
  assert.equal(resolvePnpmOperation(['--version']),'version');
  assert.equal(resolvePnpmOperation(['install','--frozen-lockfile','--ignore-scripts']),'install');
  assert.throws(()=>resolvePnpmOperation(['install']),/不受支持/);
});
test('the combined launcher converts the legacy Windows module path to a repeatable file URL',()=>{
  const root=mkdtempSync(join(tmpdir(),'oneclick-esm-url-'));
  try{
    const path=join(root,'nuxt.config.ts');
    writeFileSync(path,"const module = fileURLToPath(new URL('../file-transfer/integration/teacher-site/module.mjs', import.meta.url))\n");
    assert.equal(repairTransferModuleSpecifier(root),true);
    const source=readFileSync(path,'utf8');
    assert.match(source,/new URL\([^\n]+\)\.href/u);
    assert.doesNotMatch(source,/fileURLToPath\(new URL/u);
    assert.equal(repairTransferModuleSpecifier(root),false);
    assert.ok(existsSync(join(root,'data/windows-oneclick-backups')));
  }finally{rmSync(root,{recursive:true,force:true});}
});
test('the combined launcher safely asks maintenance to clear only a stale transfer lock',async()=>{
  let call;
  const run={run(executable,args,options){call={executable,args,options};return Promise.resolve('{"unlocked":true}\n');}};
  assert.equal(await clearStaleTransferLock(run,'C:\\tools\\file-transfer',{SAFE:'1'}),true);
  assert.equal(call.args.at(-1),'unlock-stale');
  assert.equal(call.options.capture,true);
  await assert.rejects(clearStaleTransferLock({run(){return Promise.resolve('not-json');}},'tool',{}),/无效结果/);
});
test('the combined launcher repairs legacy backslash paths inside the transfer Nuxt module',()=>{
  const root=mkdtempSync(join(tmpdir(),'oneclick-ft-path-'));
  try{
    const path=join(root,'integration/teacher-site/module.mjs');
    mkdirSync(join(path,'..'),{recursive:true});
    writeFileSync(path,[
      "const local = relative => fileURLToPath(new URL(relative, import.meta.url));",
      "const aliases = {",
      "  '#ft-teacher-auth': resolve(nuxt.options.rootDir, 'server/utils/auth-runtime.ts'),",
      "  '#ft-teacher-auth-http': resolve(nuxt.options.rootDir, 'server/utils/auth-http.ts'),",
      "  '#ft-teacher-bounded-json': resolve(nuxt.options.rootDir, 'server/utils/bounded-json.ts'),",
      "};",
    ].join('\n'));
    assert.equal(repairTransferInternalPaths(root),true);
    const source=readFileSync(path,'utf8');
    assert.equal((source.match(/replaceAll\('\\\\', '\/'\)/gu)??[]).length,4);
    for(const line of source.split('\n').filter(line=>line.includes(': resolve('))){
      assert.match(line,/\.replaceAll\('\\\\', '\/'\),$/u);
    }
    assert.equal(repairTransferInternalPaths(root),false);
  }finally{rmSync(root,{recursive:true,force:true});}
});
test('failed seed preparation never publishes a database or overwrites existing data',async()=>{
  const base=mkdtempSync(join(tmpdir(),'oneclick-failure-'));
  try{
    mkdirSync(join(base,'data'));writeFileSync(join(base,'data/site.sqlite3'),'KEEP_LIVE_DATA');
    writeFileSync(join(base,'.env'),'KEEP_CONFIGURATION');
    await assert.rejects(initializeDemo({run:async()=>{throw new Error('simulated seed failure');}},base,process.env,8005),/simulated seed failure/);
    assert.equal(readFileSync(join(base,'data/site.sqlite3'),'utf8'),'KEEP_LIVE_DATA');
    assert.equal(readFileSync(join(base,'.env'),'utf8'),'KEEP_CONFIGURATION');
    assert.equal(existsSync(join(base,'data/oneclick-demo.sqlite3')),false);
    assert.equal(existsSync(join(base,'data/windows-oneclick-state.json')),false);
  }finally{rmSync(base,{recursive:true,force:true});}
});
const teacher=process.env.ONECLICK_FIXTURE_TEACHER;
test('reinitialization preserves custom data, passwords and the existing environment',{skip:!teacher},async()=>{
  const r=createRequire(join(resolve(teacher),'package.json'));const Database=r('better-sqlite3');
  const dbPath=join(teacher,'data/oneclick-demo.sqlite3');
  const db=new Database(dbPath);db.prepare("UPDATE projects SET name=? WHERE uid=(SELECT uid FROM projects LIMIT 1)").run('KEEP_CUSTOM_PROJECT');
  const count=db.prepare('SELECT count(*) AS n FROM projects').get().n;
  const hash=db.prepare("SELECT password_hash FROM auth_users WHERE username='demo_admin'").get().password_hash;db.close();
  const env=readFileSync(join(teacher,'.env'));
  const original=readFileSync(join(teacher,'data/site.sqlite3'));
  const login=readFileSync(join(teacher,'data/oneclick-demo-login.txt'));
  const runner={run(){throw new Error('A second initializer must never execute');}};
  await initializeDemo(runner,teacher,process.env,18105);
  const after=new Database(dbPath,{readonly:true});
  try {
    assert.equal(after.prepare("SELECT count(*) AS n FROM projects WHERE name='KEEP_CUSTOM_PROJECT'").get().n,1);
    assert.equal(after.prepare('SELECT count(*) AS n FROM projects').get().n,count);
    assert.equal(after.prepare("SELECT password_hash FROM auth_users WHERE username='demo_admin'").get().password_hash,hash);
  }finally{after.close();}
  assert.deepEqual(readFileSync(join(teacher,'.env')),env);
  assert.deepEqual(readFileSync(join(teacher,'data/site.sqlite3')),original);
  assert.deepEqual(readFileSync(join(teacher,'data/oneclick-demo-login.txt')),login);
});
