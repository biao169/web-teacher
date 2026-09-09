import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const script=fileURLToPath(new URL('../Tweb.sh',import.meta.url));
const content=readFileSync(script,'utf8');
const hasBash=process.platform!=='win32';
test('production shell syntax and help are non-mutating',{skip:!hasBash},()=>{
  assert.equal(spawnSync('bash',['-n',script]).status,0);
  const result=spawnSync('bash',[script,'--help'],{encoding:'utf8'});
  assert.equal(result.status,0);assert.match(result.stdout,/restore/);
});
test('branch checkout and state exclusions are explicit',()=>{
  assert.match(content,/--single-branch --branch "\$BRANCH"/);
  for(const name of ['data/','media/','storage/','config.local.json'])assert.ok(content.includes('--exclude=/'+name));
  assert.match(content,/git check-ref-format --branch/);
  assert.doesNotMatch(content,/git reset --hard|rm -rf|curl[^\n]*\|\s*(?:sudo )?bash/);
});
test('source-only transfer updates stop before downtime',{skip:!hasBash},()=>{
  const result=spawnSync('bash',['-c',`source "$1"; load_config(){ TRANSFER=true; }; prerequisites(){ :; }; stop_services(){ echo STOP_CALLED; }; update_site source`,'test',script],{encoding:'utf8'});
  assert.notEqual(result.status,0);assert.doesNotMatch(result.stdout,/STOP_CALLED/);
});
test('database mode backs up before migrations and never fetches/builds',{skip:!hasBash},()=>{
  const result=spawnSync('bash',['-c',`source "$1"; load_config(){ TRANSFER=false; }; prerequisites(){ :; }; confirm(){ :; }; stop_services(){ echo STOP; }; backup_stopped(){ echo BACKUP; }; migrate(){ echo MIGRATE; }; units(){ echo UNITS; }; start_services(){ echo START; }; checkout_source(){ exit 88; }; build(){ exit 89; }; update_site database`,'test',script],{encoding:'utf8'});
  assert.equal(result.status,0);assert.equal(result.stdout.trim(),'STOP\nBACKUP\nMIGRATE\nUNITS\nSTART');
});
test('source sync preserves live state but updates nested media source',{skip:!hasBash||spawnSync('rsync',['--version']).status!==0},()=>{
  const temp=mkdtempSync(join(tmpdir(),'suite-sync-'));
  try{
    for(const side of ['stage/repo','app'])for(const component of ['academic-cms','file-transfer']){
      const base=join(temp,side,component);mkdirSync(base,{recursive:true});
      for(const name of ['data','media','storage','app/pages/admin/media'])mkdirSync(join(base,name),{recursive:true});
      for(const name of ['data/db.txt','media/photo.txt','storage/key.txt','app/pages/admin/media/index.vue','config.local.json'])writeFileSync(join(base,name),side==='app'?'LIVE':'GIT');
    }
    const result=spawnSync('bash',['-c',`source "$1"; APP="$2/app"; STAGE="$2/stage"; USER_NAME=ignored; git(){ echo test-commit; }; chown(){ :; }; copy_source`,'test',script,temp],{encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
    assert.equal(readFileSync(join(temp,'app/academic-cms/app/pages/admin/media/index.vue'),'utf8'),'GIT');
    for(const name of ['data/db.txt','media/photo.txt','storage/key.txt','config.local.json'])assert.equal(readFileSync(join(temp,'app/academic-cms',name),'utf8'),'LIVE');
  }finally{rmSync(temp,{recursive:true,force:true});}
});
test('Git accepts non-main branch and rejects missing branch before downtime',{skip:!hasBash||spawnSync('git',['--version']).status!==0},()=>{
  const temp=mkdtempSync(join(tmpdir(),'suite-branch-'));
  const repo=join(temp,'origin');mkdirSync(repo);
  const git=(args,cwd=repo)=>{const r=spawnSync('git',args,{cwd,encoding:'utf8'});assert.equal(r.status,0,r.stderr);};
  try{
    git(['init','-b','main']);git(['config','user.email','test@example.invalid']);git(['config','user.name','Test']);
    writeFileSync(join(repo,'README.md'),'main');git(['add','.']);git(['commit','-m','main']);
    git(['switch','-c','release/test']);writeFileSync(join(repo,'README.md'),'release');git(['commit','-am','release']);
    git(['clone','--single-branch','--branch','release/test','--',repo,join(temp,'selected')]);
    assert.equal(readFileSync(join(temp,'selected/README.md'),'utf8'),'release');
    const result=spawnSync('git',['clone','--single-branch','--branch','missing','--',repo,join(temp,'missing')],{encoding:'utf8'});
    assert.notEqual(result.status,0);assert.equal(existsSync(join(temp,'missing/README.md')),false);
  }finally{rmSync(temp,{recursive:true,force:true});}
});
test('services run unprivileged, loopback binding, no direct transfer proxy',()=>{
  assert.match(content,/User=\$USER_NAME/);assert.match(content,/NoNewPrivileges=true/);
  assert.match(content,/NITRO_HOST=127\.0\.0\.1/);
  assert.doesNotMatch(content,/proxy_pass http:\/\/127\.0\.0\.1:8787/);
});
test('cold recovery preserves old state and does not auto start',()=>{
  const restore=content.split('restore() {')[1].split('\ntoggle()')[0];
  assert.match(restore,/mv "\$APP" "\$retired\/app"/);
  assert.doesNotMatch(restore,/start_services/);
});
test('no production demo seeding, private environment permissions',()=>{
  assert.doesNotMatch(content,/seed-sample|initialize-local-demo|CMS_DEMO_PASSWORD/);
  assert.match(content,/chmod 640 "\$CONF\/site.env"/);
  assert.match(content,/--frozen-lockfile/);
});
test('bootstrap asks twice and grants transfer role without exposing password',{skip:!hasBash},()=>{
  const temp=mkdtempSync(join(tmpdir(),'suite-admin-'));
  try{
    writeFileSync(join(temp,'site.env'),'NUXT_AUTH_BOOTSTRAP_TOKEN=temporary-token\nNUXT_AUTH_SECRET=keep\n');
    const r=spawnSync('bash',['-c',`source "$1"; CONF="$2"; TEST_NODE="$3"; node(){ "$TEST_NODE" "$@"; }; TRANSFER=true; ORIGIN=https://example.invalid; cms(){ printf '%s' '{"status":"created","user":{"uid":"user_test"}}'; }; ft(){ printf 'GRANT %s\\n' "$*"; }; bootstrap`,'test',script,temp,process.execPath],{input:'owner\nTest-Pass-123\nTest-Pass-123\ntrue\n',encoding:'utf8'});
    assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/GRANT scripts\/manage-admin.mjs grant user_test/);
    assert.doesNotMatch(r.stdout+r.stderr,/Test-Pass-123/);
    assert.equal(readFileSync(join(temp,'site.env'),'utf8'),'NUXT_AUTH_SECRET=keep\n');
  }finally{rmSync(temp,{recursive:true,force:true});}
});
test('bootstrap mismatch leaves initialization token available',{skip:!hasBash},()=>{
  const temp=mkdtempSync(join(tmpdir(),'suite-admin-mismatch-'));
  try{
    writeFileSync(join(temp,'site.env'),'NUXT_AUTH_BOOTSTRAP_TOKEN=keep\n');
    const r=spawnSync('bash',['-c',`source "$1"; CONF="$2"; cms(){ echo SHOULD_NOT_RUN; }; bootstrap`,'test',script,temp],{input:'owner\nTest-Pass-123\nDifferent-123\n',encoding:'utf8'});
    assert.notEqual(r.status,0);assert.doesNotMatch(r.stdout,/SHOULD_NOT_RUN/);
    assert.match(readFileSync(join(temp,'site.env'),'utf8'),/TOKEN=keep/);
  }finally{rmSync(temp,{recursive:true,force:true});}
});
test('one-line remote command parses and fetch failure never invokes installer',{skip:!hasBash},()=>{
  const readme=readFileSync(fileURLToPath(new URL('../README.md',import.meta.url)),'utf8');
  const command=readme.split('\n').find(s=>s.startsWith("bash -c 'set -e;"));
  assert.ok(command);assert.equal(spawnSync('bash',['-n','-c',command]).status,0);
  const mock=`curl(){ return 22; }; sudo(){ echo SHOULD_NOT_INSTALL; }; export -f curl sudo; ${command}`;
  const r=spawnSync('bash',['-c',mock],{encoding:'utf8'});
  assert.notEqual(r.status,0);assert.doesNotMatch(r.stdout,/SHOULD_NOT_INSTALL/);
});
test('production entry has no executable dependency on the removable example directory',()=>{
  assert.doesNotMatch(content,/test-examples|windows-oneclick|package-suite\.py/);
});
