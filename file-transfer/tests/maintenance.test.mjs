import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync, cpSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { fixture } from './helpers.mjs';
import { loadConfig, validateConfig, PROJECT_ROOT } from '../server/config.mjs';
import { openStorage } from '../server/storage.mjs';
import { createService } from '../server/service.mjs';
import { backup, verifyBackup, restoreBackup } from '../server/maintenance.mjs';
import { acquireRuntimeLock, readRuntimeLock, unlockStale } from '../server/runtime-lock.mjs';

function setup(t) {
  const { root } = fixture(t), keys = generateKeyPairSync('ed25519');
  const config = validateConfig({ dataDirectory: 'storage/custom-data', bridgePublicKey: keys.publicKey.export({ type:'spki', format:'der' }).toString('base64') }, root);
  const storage = openStorage(config); storage.setManager('operator', true); storage.close();
  writeFileSync(join(config.dataPath, 'teacher-signing-key.pkcs8'), keys.privateKey.export({ type:'pkcs8', format:'der' }), { mode:0o600 });
  mkdirSync(join(config.dataPath, 'temporary', 'existing-share'));
  writeFileSync(join(config.dataPath, 'temporary', 'existing-share', '1'), Buffer.alloc(1048609, 37));
  const external = mkdtempSync(join(tmpdir(), 'ft-backup-测试 ')); t.after(() => rmSync(external, { recursive:true, force:true }));
  return { root, config, external, destination:join(external, '备份 one') };
}
test('stopped backup preserves effective config, private key, database and bounded streamed file bytes; restore never overwrites', async t => {
  const f=setup(t); const before=readFileSync(join(f.config.dataPath,'metadata.sqlite'));
  const result=await backup(f.config,f.destination); assert.equal(result.status,'backed-up'); assert.equal(readRuntimeLock(f.config),null);
  const verified=await verifyBackup(f.destination); assert.equal(verified.schema,8); assert.ok(verified.manifest.files.every(x=>!x.path.endsWith('runtime.lock')));
  const restored=join(f.external,'恢复 staging'); await restoreBackup(f.destination,restored);
  const config=loadConfig({root:restored,env:{}}); assert.equal(config.dataDirectory,'storage/custom-data');
  assert.deepEqual(readFileSync(join(config.dataPath,'metadata.sqlite')),before);
  assert.deepEqual(readFileSync(join(config.dataPath,'teacher-signing-key.pkcs8')),readFileSync(join(f.config.dataPath,'teacher-signing-key.pkcs8')));
  assert.deepEqual(readFileSync(join(config.dataPath,'temporary/existing-share/1')),Buffer.alloc(1048609,37));
  const db=openStorage(config); assert.equal(db.isManager('operator'),true); db.close();
  await assert.rejects(restoreBackup(f.destination,restored),{code:'EEXIST'});
  await assert.rejects(backup(f.config,f.destination),{code:'EEXIST'});
  assert.deepEqual(readFileSync(join(f.config.dataPath,'metadata.sqlite')),before);
});
test('one active service excludes duplicate service and backup; closing releases lease and restored database starts', async t => {
  const f=setup(t), service=createService({...f.config,port:0}); t.after(()=>service.close()); await service.listen();
  assert.throws(()=>createService({...f.config,port:0}),/FT_RUNTIME_BUSY/);
  await assert.rejects(backup(f.config,f.destination),/FT_RUNTIME_BUSY/); assert.equal(existsSync(f.destination),false);
  await service.close(); await backup(f.config,f.destination);
  const destination=join(f.external,'restored'); await restoreBackup(f.destination,destination);
  const restarted=createService({...loadConfig({root:destination,env:{}}),port:0}); t.after(()=>restarted.close()); const at=await restarted.listen();
  assert.equal((await fetch(`http://127.0.0.1:${at.port}/transfer-api/ready`)).status,200);
});
test('tampered backup content and extra files are rejected before creating a restore directory', async t => {
  const f=setup(t); await backup(f.config,f.destination);
  const saved=join(f.destination,'payload/storage/custom-data/temporary/existing-share/1'); writeFileSync(saved,'changed');
  await assert.rejects(verifyBackup(f.destination),/FT_BACKUP_HASH/);
  const restored=join(f.external,'never-created'); await assert.rejects(restoreBackup(f.destination,restored),/FT_BACKUP_HASH/); assert.equal(existsSync(restored),false);
  writeFileSync(saved,Buffer.alloc(1048609,37)); writeFileSync(join(f.destination,'payload/unlisted.txt'),'extra');
  await assert.rejects(verifyBackup(f.destination),/FT_BACKUP_INVENTORY/);
});
test('backup refuses source overlap and does not follow symlinked private files', async t => {
  const f=setup(t); await assert.rejects(backup(f.config,join(f.root,'backup')),/FT_BACKUP_DESTINATION/);
  if(process.platform==='win32'){ t.diagnostic('symlink creation requires Windows privileges; remaining checks apply'); return; }
  symlinkSync(join(f.config.dataPath,'metadata.sqlite'),join(f.config.dataPath,'linked.db'));
  await assert.rejects(backup(f.config,f.destination),/FT_BACKUP_FILE/); assert.equal(existsSync(f.destination),false); assert.equal(readRuntimeLock(f.config),null);
});
test('manifest traversal, duplicate paths and symlink directory are refused', async t => {
  const f=setup(t); await backup(f.config,f.destination);
  const path=join(f.destination,'BACKUP-MANIFEST.json'), original=readFileSync(path,'utf8'), m=JSON.parse(original);
  m.files[0].path='../outside'; writeFileSync(path,JSON.stringify(m)); await assert.rejects(verifyBackup(f.destination),/FT_BACKUP_PATH/);
  const duplicate=JSON.parse(original); duplicate.files.push(duplicate.files[0]); writeFileSync(path,JSON.stringify(duplicate)); await assert.rejects(verifyBackup(f.destination),/FT_BACKUP_MANIFEST/);
  writeFileSync(path,original);
  if(process.platform!=='win32') { symlinkSync(f.destination,join(f.external,'linked'),'dir'); await assert.rejects(verifyBackup(join(f.external,'linked')),/FT_BACKUP_DIRECTORY/); }
});
test('stale unlock refuses living process and malformed lock; only a confirmed absent PID can be cleared', t => {
  const f=setup(t), release=acquireRuntimeLock(f.config,'test'); assert.throws(()=>unlockStale(f.config),/FT_RUNTIME_BUSY/); release();
  const finished=spawnSync(process.execPath,['-e',''],{timeout:3000}); assert.equal(finished.status,0);
  writeFileSync(join(f.config.dataPath,'runtime.lock'),JSON.stringify({pid:finished.pid,token:'12345678-1234-1234-1234-123456789abc'}));
  assert.equal(unlockStale(f.config).unlocked,true); assert.equal(unlockStale(f.config).unlocked,false);
  writeFileSync(join(f.config.dataPath,'runtime.lock'),'not-json'); assert.throws(()=>unlockStale(f.config),/FT_LOCK_INVALID/);
});
test('failed storage construction releases runtime lock for repair and retry', t => {
  const f=setup(t); assert.throws(()=>createService(f.config,{storageFactory(){throw new Error('fixture-storage-failure')}}),/fixture-storage-failure/);
  assert.equal(readRuntimeLock(f.config),null); const release=acquireRuntimeLock(f.config); release();
});
test('copied maintenance CLI enforces stopped acknowledgement and doctor is read-only without exposing keys', async t => {
  const f=setup(t);
  for(const name of ['server','shared','web/files','scripts','integration','package.json'])cpSync(join(PROJECT_ROOT,name),join(f.root,name),{recursive:true});
  for(const name of ['ws','qrcode-generator'])cpSync(join(PROJECT_ROOT,'node_modules',name),join(f.root,'node_modules',name),{recursive:true,dereference:true});
  writeFileSync(join(f.root,'config.local.json'),JSON.stringify({dataDirectory:f.config.dataDirectory,bridgePublicKey:f.config.bridgePublicKey}));
  const teacher=join(f.external,'academic-cms');mkdirSync(teacher);writeFileSync(join(teacher,'package.json'),'{"name":"academic-cms"}');
  // Sibling location is checked too: teacher root below the shared parent of the copied tool.
  const sibling=join(f.root,'..',f.root.split(/[\\/]/).at(-1)+'-teacher');mkdirSync(sibling);t.after(()=>rmSync(sibling,{recursive:true,force:true}));writeFileSync(join(sibling,'package.json'),'{"name":"academic-cms"}');
  const patch=JSON.parse(readFileSync(join(PROJECT_ROOT,'integration/teacher-site/patches/teacher-step2.json'),'utf8'));
  for(const item of patch.files){const p=join(sibling,item.path);mkdirSync(join(p,'..'),{recursive:true});writeFileSync(p,item.blocks.map(x=>x.after).join('\n'));}
  const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>!k.startsWith('FT_')));
  const run=(script,args=[])=>spawnSync(process.execPath,[join(f.root,'scripts',script),...args],{cwd:f.external,env,encoding:'utf8',timeout:8000});
  assert.notEqual(run('maintenance.mjs',['backup',f.destination]).status,0);assert.equal(existsSync(f.destination),false);
  const before=readFileSync(join(f.config.dataPath,'metadata.sqlite')), key=readFileSync(join(f.config.dataPath,'teacher-signing-key.pkcs8')).toString('base64');
  const doctor=run('doctor.mjs',[sibling]);assert.equal(doctor.status,0,doctor.stdout+doctor.stderr);assert.equal(JSON.parse(doctor.stdout).readOnly,true);assert.ok(!doctor.stdout.includes(key));assert.deepEqual(readFileSync(join(f.config.dataPath,'metadata.sqlite')),before);
  const backed=run('maintenance.mjs',['backup',f.destination,'--stopped']);assert.equal(backed.status,0,backed.stderr);
  assert.equal(run('maintenance.mjs',['verify',f.destination]).status,0);
  const restored=run('maintenance.mjs',['restore',f.destination,join(f.external,'cli restored')]);assert.equal(restored.status,0,restored.stderr);
  writeFileSync(join(f.root,'SOURCE-MANIFEST.json'),JSON.stringify({'package.json':'0'.repeat(64)}));const changed=run('doctor.mjs',[sibling]);assert.notEqual(changed.status,0);assert.match(changed.stdout,/FT_SOURCE_CHANGED/);
});


test('custom WAL mode is refused instead of copying an incomplete standalone database', async t => {
  const f = setup(t), db = new DatabaseSync(join(f.config.dataPath, 'metadata.sqlite'));
  db.exec('PRAGMA journal_mode=WAL'); db.close();
  await assert.rejects(backup(f.config, f.destination), /FT_BACKUP_JOURNAL/);
  assert.equal(existsSync(f.destination), false); assert.equal(readRuntimeLock(f.config), null);
});
