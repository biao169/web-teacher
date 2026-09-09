import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, symlinkSync, linkSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fixture } from './helpers.mjs';
import { openStorage } from '../server/storage.mjs';
import { defaultSettings } from '../shared/settings.mjs';

test('schema 5 upgrade preserves personal ledger, settings, managers and revision while closing unconfigured VPN paths', t => {
  const {config} = fixture(t); const first = openStorage(config); first.setManager('owner', true);
  const before = first.readSettings(); first.close();
  const db = new DatabaseSync(join(config.dataPath, 'metadata.sqlite'));
  const old = {...before.settings};
  for (const key of ['vpnBudgetUnit','vpnProtectionMode','vpnMeterSource','vpnInterface','vpnSourceId','vpnScopeVerified','vpnPollSeconds','vpnStaleSeconds','vpnOverheadPercent']) delete old[key];
  db.prepare('UPDATE tool_settings SET document=?').run(JSON.stringify(old));
  db.prepare("INSERT INTO transfer_allowances VALUES('kept-task','sender','hashed-identity','user','123',1,2,9999999999999,3,'complete')").run();
  const ledger = db.prepare('SELECT * FROM transfer_allowances').all();
  db.exec('DROP TABLE recovery_members; DROP TABLE recovery_tasks; DROP TABLE temporary_shares; DROP TABLE vpn_state; DROP TABLE vpn_grants; DROP TABLE vpn_audit; PRAGMA user_version=5'); db.close();
  const upgraded = openStorage(config);
  assert.deepEqual(upgraded.readSettings(), {...before, settings:{...defaultSettings(), ...old}});
  assert.equal(upgraded.vpn.view().hardLimitAvailable, false);
  assert.equal(upgraded.vpn.view().eligibleForControlledTransfer, false); upgraded.close();
  const inspect = new DatabaseSync(join(config.dataPath, 'metadata.sqlite'));
  assert.deepEqual(inspect.prepare('SELECT * FROM transfer_allowances').all(), ledger); inspect.close();
});

test('schema 3 upgrade preserves settings and grants while keeping new LAN verification closed', t => {
  const {config}=fixture(t);const first=openStorage(config);first.setManager('owner',true);
  const snap=first.readSettings();snap.settings.enabled=true;snap.settings.noticeZh='保留配置';
  first.saveSettings({revision:snap.revision,settings:snap.settings,managers:snap.managers},'owner');
  const before=first.readSettings();first.close();
  const db=new DatabaseSync(join(config.dataPath,'metadata.sqlite'));
  const old={...before.settings};delete old.lanNetworks;delete old.lanVerified;
  db.prepare('UPDATE tool_settings SET document=?').run(JSON.stringify(old));db.exec('DROP TABLE transfer_allowances; DROP TABLE recovery_members; DROP TABLE recovery_tasks; DROP TABLE temporary_shares; DROP TABLE vpn_state; DROP TABLE vpn_grants; DROP TABLE vpn_audit; PRAGMA user_version=3');db.close();
  const upgraded=openStorage(config);const after=upgraded.readSettings();upgraded.close();
  assert.deepEqual(after,{...before,settings:{lanNetworks:'',lanVerified:false,...old}});
  assert.equal(after.settings.enabled,true);assert.equal(after.settings.lanVerified,false);
});

test('independent database survives restart without reinitializing its identity', t => {
  const { config } = fixture(t);
  const first = openStorage(config);
  assert.equal(first.health(), true);
  first.close(); first.close();
  assert.equal(first.health(), false);
  const inspect = () => {
    const db = new DatabaseSync(join(config.dataPath, 'metadata.sqlite'), { readOnly: true });
    const meta = db.prepare('SELECT * FROM service_meta ORDER BY key').all();
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, 8);
    db.close(); return meta;
  };
  const before = inspect();
  const second = openStorage(config); second.close();
  assert.deepEqual(inspect(), before);
  assert.deepEqual(readdirSync(config.dataPath).sort(), ['checkpoints', 'metadata.sqlite', 'telemetry', 'temporary']);
});
test('storage refuses an existing unrelated database without changing its data', t => {
  const { config } = fixture(t);
  mkdirSync(config.dataPath, { recursive: true });
  const db = new DatabaseSync(join(config.dataPath, 'metadata.sqlite'));
  db.exec("CREATE TABLE teacher_secret(value TEXT); INSERT INTO teacher_secret VALUES ('original')");
  assert.throws(() => openStorage(config), /其他数据库/u);
  assert.equal(db.prepare('SELECT value FROM teacher_secret').get().value, 'original');
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 0);
  db.close();
});
test('future schema is rejected without downgrading', t => {
  const { config } = fixture(t);
  mkdirSync(config.dataPath, { recursive: true });
  const db = new DatabaseSync(join(config.dataPath, 'metadata.sqlite'));
  db.exec('PRAGMA user_version = 99'); db.close();
  assert.throws(() => openStorage(config), /版本不兼容/u);
});
test('symlinked data directory is rejected before writing to its target', t => {
  const { root, config } = fixture(t);
  const target = join(root, 'teacher-media');
  mkdirSync(target); mkdirSync(join(root, 'storage'));
  symlinkSync(target, config.dataPath, process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => openStorage(config), /FT_STORAGE/u);
  assert.deepEqual(readdirSync(target), []);
});
test('database hard links are rejected', t => {
  const { root, config } = fixture(t);
  mkdirSync(config.dataPath, { recursive: true });
  const source = join(root, 'foreign.sqlite');
  const db = new DatabaseSync(source); db.exec('PRAGMA user_version = 99'); db.close();
  linkSync(source, join(config.dataPath, 'metadata.sqlite'));
  assert.throws(() => openStorage(config), /独立普通文件/u);
});

test('schema 4 upgrade adds personal accounting without changing the previous policy, revision or managers',t=>{
 const {config}=fixture(t);const st=openStorage(config);st.setManager('owner',true);const before=st.readSettings();st.close();
 const db=new DatabaseSync(join(config.dataPath,'metadata.sqlite'));const old={...before.settings};for(const key of ['personalTimeZone','guestDailyBytes','guestMonthlyBytes','guestConcurrency'])delete old[key];
 db.prepare('UPDATE tool_settings SET document=?').run(JSON.stringify(old));db.exec('DROP TABLE transfer_allowances; DROP TABLE recovery_members; DROP TABLE recovery_tasks; DROP TABLE temporary_shares; DROP TABLE vpn_state; DROP TABLE vpn_grants; DROP TABLE vpn_audit; PRAGMA user_version=4');db.close();
 const upgraded=openStorage(config);assert.deepEqual(upgraded.readSettings(),before);assert.ok(upgraded.usage);upgraded.close();
});

test('schema 6 migration preserves VPN and personal ledgers, translates the legacy relay permission and defaults new routes to blocked',t=>{
 const {config}=fixture(t),store=openStorage(config);store.setManager('owner',true);const before=store.readSettings();store.close();const db=new DatabaseSync(join(config.dataPath,'metadata.sqlite'));
 const old={...before.settings};for(const key of ['wanNetworks','wanVerified','stunUrls','serverVpnPath','serverOutsideVerified'])delete old[key];old.rules[1].links.push('turn-relay');
 db.prepare('UPDATE tool_settings SET document=?').run(JSON.stringify(old));db.prepare("UPDATE vpn_state SET document=?").run(JSON.stringify({pendingBytes:'123',pendingThroughAt:1}));db.prepare("INSERT INTO transfer_allowances VALUES('kept','send','hash','user','456',1,2,3,4,'complete')").run();db.exec('DROP TABLE recovery_members; DROP TABLE recovery_tasks; DROP TABLE temporary_shares; PRAGMA user_version=6');db.close();
 const upgraded=openStorage(config),after=upgraded.readSettings();assert.equal(after.revision,before.revision);assert.deepEqual(after.managers,before.managers);assert.ok(after.settings.rules[1].links.includes('server-relay'));assert.ok(!after.settings.rules[1].links.includes('turn-relay'));assert.equal(after.settings.wanVerified,false);assert.equal(after.settings.serverVpnPath,'unknown');assert.equal(upgraded.vpn.view().pendingBytes,'123');assert.equal(upgraded.shares.list().count,0);upgraded.close();
 const inspect=new DatabaseSync(join(config.dataPath,'metadata.sqlite'));assert.equal(inspect.prepare('SELECT bytes FROM transfer_allowances WHERE task=?').get('kept').bytes,'456');inspect.close();
});
