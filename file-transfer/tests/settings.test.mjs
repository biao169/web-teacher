import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { request } from 'node:http';
import { fixture } from './helpers.mjs';
import { defaultSettings, defaultRule, validateSettings, validateSubmission, publicPolicy, bytesToGB, gbToBytes } from '../shared/settings.mjs';
import { openStorage } from '../server/storage.mjs';
import { createService } from '../server/service.mjs';
import { signBridgeToken, identityFromSession } from '../server/bridge-token.mjs';
import { ROUTES } from '../shared/contracts.mjs';
const manager = { kind: 'user', uid: 'manager:one', name: 'Manager', roleId: 'role:one', roleName: 'Role', sessionVersion: 'session:one', mustChangePassword: false };
const keys = generateKeyPairSync('ed25519');
const submission = snapshot => ({ revision: snapshot.revision, settings: snapshot.settings, managers: snapshot.managers });

test('settings default to closed transfers, unlimited LAN, denied guest access and unconfigured VPN budgets', () => {
  const value = defaultSettings(); assert.deepEqual(validateSettings(value), value);
  assert.equal(value.enabled, false); assert.equal(value.lanRateKbps, null); assert.equal(value.vpnDailyBytes, null);
  assert.equal(value.rules[0].send, false); assert.equal(value.rules[1].send, true);
  value.rules[0].links.push('turn-relay'); assert.equal(defaultSettings().rules[0].links.includes('turn-relay'), false);
});
test('strict validation rejects unknown keys, malformed policies, unsafe values and duplicate IDs with field paths', () => {
  for (const [path, mutate] of [
    ['enabled', s => { s.enabled = 'true'; }], ['extra', s => { s.extra = 'anything'; }],
    ['vpnTimeZone', s => { s.vpnTimeZone = 'Not/AZone'; }], ['lanRateKbps', s => { s.lanRateKbps = 0; }],
    ['vpnDailyBytes', s => { s.vpnDailyBytes = 1e30; }], ['rules.0.links', s => { s.rules[0].links = ['anything']; }],
    ['rules.2.id', s => { s.rules.push(defaultRule('registered')); }], ['rules', s => { s.rules = []; }],
    ['rules.1.maxTaskBytes', s => { s.rules[1].maxFileBytes = '5'; s.rules[1].maxTaskBytes = '4'; }],
  ]) { const value = defaultSettings(); mutate(value); assert.throws(() => validateSettings(value), e => e.code === 'FT_VALIDATION' && path in e.fields, path); }
  for (const value of [null, [], false, { settings: defaultSettings(), managers: [], revision: 0 }]) assert.throws(() => validateSubmission(value));
});
test('decimal GB and byte conversion preserve exact one-byte and 64-bit values, zero and unlimited', () => {
  for (const bytes of ['0', '1', '999999999', '1000000000', '9007199254740993', '9223372036854775807']) assert.equal(gbToBytes(bytesToGB(bytes)), bytes);
  assert.equal(gbToBytes('', true), null); assert.equal(bytesToGB(null), '');
  for (const value of ['-1', '1e4', '.5', '1.0000000001', '9223372036.854775808', 'NaN']) assert.throws(() => gbToBytes(value));
});
test('user override beats role, role beats signed-in default; guests are separate and private rules are not published', () => {
  const s = defaultSettings(); s.lanRateKbps = 5000;
  const role = defaultRule('role', manager.roleId); role.send = true; role.lanRateKbps = 2000;
  const user = defaultRule('user', manager.uid); user.receive = true; user.lanRateKbps = 1000;
  s.rules.push(role, user);
  assert.equal(publicPolicy(s, manager).rule.lanRateKbps, 1000);
  assert.equal(publicPolicy(s, { ...manager, uid: 'other' }).rule.lanRateKbps, 2000);
  assert.equal(publicPolicy(s, { ...manager, uid: 'other', roleId: 'other' }).rule.lanRateKbps, 5000);
  assert.equal(publicPolicy(s, identityFromSession(null)).rule.send, false);
  s.enabled = true; s.relayEnabled = true;
  const p = publicPolicy(s, manager); assert.equal(p.transferAvailable, false); assert.equal(p.meteringAvailable, false); assert.ok(p.links.every(l => !l.available));
  assert.doesNotMatch(JSON.stringify(p), /manager:one|role:one|settings_audit|rules/);
});
test('settings persist across restart with grants and audit; defaults are an explicit versioned save', t => {
  const { config } = fixture(t); let db = openStorage(config); db.setManager(manager.uid, true);
  const value = submission(db.readSettings()); value.settings.lanRateKbps = 12000; value.managers.push('manager:two');
  const saved = db.saveSettings(value, manager.uid); assert.equal(saved.revision, value.revision + 1); assert.equal(saved.audit[0].action, 'settings-and-grants'); db.close();
  db = openStorage(config); assert.deepEqual(db.readSettings(), saved);
  const restored = db.saveSettings({ ...submission(saved), settings: defaultSettings() }, manager.uid);
  assert.equal(restored.settings.lanRateKbps, null); assert.ok(restored.managers.includes('manager:two')); db.close();
});
test('conflicts, invalid fields and removing self leave both settings and grants unchanged', t => {
  const { config } = fixture(t); const db = openStorage(config); t.after(() => db.close()); db.setManager(manager.uid, true);
  const before = db.readSettings();
  assert.throws(() => db.saveSettings({ ...submission(before), managers: ['someone:else'] }, manager.uid), e => e.fields.managers === 'keepSelf');
  const bad = submission(before); bad.settings.enabled = 'yes';
  assert.throws(() => db.saveSettings(bad, manager.uid));
  assert.equal(db.readSettings().settings.enabled, false); assert.deepEqual(db.readSettings().managers, [manager.uid]);
  db.setManager('manager:two', true);
  assert.throws(() => db.saveSettings({ ...submission(before), settings: defaultSettings() }, manager.uid), e => e.code === 'FT_CONFLICT');
  db.setManager(manager.uid, false);
  assert.throws(() => db.saveSettings(submission(db.readSettings()), manager.uid), e => e.code === 'FT_FORBIDDEN');
});
test('schema 2 migration preserves manager grants and consumed nonces', t => {
  const { config } = fixture(t); mkdirSync(config.dataPath, { recursive: true });
  const raw = new DatabaseSync(join(config.dataPath, 'metadata.sqlite'));
  raw.exec("CREATE TABLE service_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL) STRICT; INSERT INTO service_meta VALUES('owner','academic-file-transfer'); CREATE TABLE admin_grants(user_uid TEXT PRIMARY KEY,granted_at TEXT NOT NULL,granted_by TEXT NOT NULL) STRICT; INSERT INTO admin_grants VALUES('manager:one','before','local-operator'); CREATE TABLE bridge_nonces(jti TEXT PRIMARY KEY,expires_at INTEGER NOT NULL) STRICT; INSERT INTO bridge_nonces VALUES('consumed',9999999999); PRAGMA user_version=2;"); raw.close();
  const db = openStorage(config); t.after(() => db.close()); assert.equal(db.isManager(manager.uid), true); assert.equal(db.consumeNonce('consumed', 9999999999, 10), false); assert.equal(db.readSettings().revision, 0);
});
async function setup(t) {
  const { config } = fixture(t);
  const effective = { ...config, port: 0, bridgePublicKey: keys.publicKey.export({ format: 'der', type: 'spki' }).toString('base64') };
  const service = createService(effective); const address = await service.listen(); const db = openStorage(effective); db.setManager(manager.uid, true);
  t.after(() => db.close()); t.after(() => service.close());
  const origin = `http://127.0.0.1:${address.port}`;
  async function call(value, identity = manager, options = {}) {
    const body = JSON.stringify(value); const token = signBridgeToken(keys.privateKey, identity, ROUTES.adminSettings, { method: 'PUT', body });
    const res = await fetch(origin + ROUTES.adminSettings, { method: 'PUT', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body, ...options });
    return { status: res.status, body: await res.json() };
  }
  return { db, call, origin };
}
test('signed settings PUT verifies method and exact body, requires fresh manager authorization', async t => {
  const { db, call, origin } = await setup(t); const value = submission(db.readSettings()); value.settings.lanRateKbps = 3456;
  for (const [identity, status] of [[identityFromSession(null), 401], [{ ...manager, uid: 'ordinary' }, 403], [{ ...manager, mustChangePassword: true }, 403]]) assert.equal((await call(value, identity)).status, status);
  const wrongMethod = signBridgeToken(keys.privateKey, manager, ROUTES.adminSettings);
  assert.equal((await call(value, manager, { headers: { 'content-type': 'application/json', authorization: `Bearer ${wrongMethod}` } })).status, 401);
  assert.equal((await call(value, manager, { body: JSON.stringify({ ...value, managers: [manager.uid, 'attacker'] }) })).status, 401);
  const token = signBridgeToken(keys.privateKey, manager, ROUTES.adminSettings, { method: 'PUT', body: JSON.stringify(value) });
  const opts = { headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` } };
  assert.equal((await call(value, manager, opts)).status, 200); assert.equal((await call(value, manager, opts)).status, 401);
  assert.equal(db.readSettings().settings.lanRateKbps, 3456);
  assert.equal((await fetch(origin + ROUTES.adminSettings)).status, 401);
});
test('simultaneous saves produce one commit and one conflict; validation errors expose field paths', async t => {
  const { db, call } = await setup(t); const value = submission(db.readSettings());
  const responses = await Promise.all([call(value), call(value)]); assert.deepEqual(responses.map(r => r.status).sort(), [200, 409]);
  const next = submission(db.readSettings()); next.settings.vpnDailyBytes = '-1';
  const invalid = await call(next); assert.equal(invalid.status, 422); assert.equal(invalid.body.fields.vpnDailyBytes, 'invalid');
  assert.equal((await call(next, manager, { headers: { 'content-type': 'text/plain' } })).status, 415);
  assert.equal((await call(next, manager, { body: 'x'.repeat(131073) })).status, 413);
});
test('revoking a manager while a settings body is arriving prevents the write', async t => {
  const { db, origin } = await setup(t); const value = submission(db.readSettings()); const body = JSON.stringify(value);
  const token = signBridgeToken(keys.privateKey, manager, ROUTES.adminSettings, { method: 'PUT', body });
  const response = await new Promise((resolve, reject) => {
    const req = request(origin + ROUTES.adminSettings, { method: 'PUT', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` } }, res => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
    req.on('error', reject); req.write(body.slice(0, 20)); setTimeout(() => { db.setManager(manager.uid, false); req.end(body.slice(20)); }, 30);
  });
  assert.equal(response, 403); assert.equal(db.readSettings().audit[0].action, 'revoke');
});
