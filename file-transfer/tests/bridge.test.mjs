import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fixture } from './helpers.mjs';
import { signBridgeToken, verifyBridgeToken, identityFromSession, validateIdentity, bridgeKey } from '../server/bridge-token.mjs';
import { createService } from '../server/service.mjs';
import { openStorage } from '../server/storage.mjs';
import { ROUTES } from '../shared/contracts.mjs';

const user = { kind: 'user', uid: 'teacher:member', name: '测试教师', roleId: 'role:reader', roleName: '普通用户', sessionVersion: 'session:one', mustChangePassword: false };
const guest = identityFromSession(null);
const keys = generateKeyPairSync('ed25519');

test('signed assertion is short-lived, audience checked and bound to one API path', () => {
  const now = Math.floor(Date.now() / 1000);
  const token = signBridgeToken(keys.privateKey, user, ROUTES.session, { now });
  assert.deepEqual(verifyBridgeToken(keys.publicKey, token, ROUTES.session, now).identity, user);
  assert.throws(() => verifyBridgeToken(keys.publicKey, token, ROUTES.adminOverview, now));
  assert.throws(() => verifyBridgeToken(keys.publicKey, token, ROUTES.session, now + 30));
  assert.throws(() => verifyBridgeToken(keys.publicKey, token, ROUTES.session, now - 4));
  const parts = token.split('.'); parts[1] = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(parts[1], 'base64url')), aud: 'other-service' })).toString('base64url');
  assert.throws(() => verifyBridgeToken(keys.publicKey, parts.join('.'), ROUTES.session, now));
});
test('forged signatures, unknown algorithms and identity escalation are rejected', () => {
  const token = signBridgeToken(keys.privateKey, user, ROUTES.session);
  assert.throws(() => verifyBridgeToken(generateKeyPairSync('ed25519').publicKey, token, ROUTES.session));
  const parts = token.split('.'); parts[0] = Buffer.from('{"alg":"none"}').toString('base64url');
  assert.throws(() => verifyBridgeToken(keys.publicKey, parts.join('.'), ROUTES.session));
  assert.throws(() => validateIdentity({ ...guest, uid: user.uid }));
  assert.throws(() => validateIdentity({ ...user, permissions: ['transfer.manage'] }));
  assert.throws(() => bridgeKey('not a key', 'public'));
});

async function setup(t) {
  const { config } = fixture(t);
  const effective = { ...config, port: 0, bridgePublicKey: keys.publicKey.export({ format: 'der', type: 'spki' }).toString('base64') };
  const service = createService(effective); const address = await service.listen();
  const storage = openStorage(effective);
  t.after(() => storage.close()); t.after(() => service.close());
  async function get(path, identity = user, token = signBridgeToken(keys.privateKey, identity, path)) {
    const response = await fetch(`http://127.0.0.1:${address.port}${path}`, { headers: { authorization: `Bearer ${token}`, 'x-user-role': 'superadmin' } });
    return { status: response.status, body: await response.json(), headers: response.headers };
  }
  return { service, storage, get, effective, address };
}
test('anonymous and ordinary users cannot access management; explicit UID grant works', async t => {
  const { get, storage } = await setup(t);
  const anonymous = await get(ROUTES.session, guest);
  assert.equal(anonymous.status, 200); assert.equal(anonymous.body.authenticated, false);
  assert.deepEqual(anonymous.body.permissions, []);
  assert.equal((await get(ROUTES.adminOverview, guest)).status, 401);
  assert.equal((await get(ROUTES.adminOverview)).status, 403);
  storage.setManager(user.uid, true);
  const admin = await get(ROUTES.adminOverview);
  assert.equal(admin.status, 200);
  assert.deepEqual(admin.body.session.permissions, ['transfer.manage']);
  assert.equal(admin.headers.get('cache-control'), 'private, no-store');
  assert.doesNotMatch(JSON.stringify(admin.body), /sessionVersion|privateKey|signingKey|sessionToken/u);
  assert.equal((await get(ROUTES.adminOverview, { ...user, mustChangePassword: true })).status, 403);
  assert.equal((await get(ROUTES.adminOverview, { ...user, uid: 'different:uid', roleName: '超级管理员' })).status, 403);
});
test('revoking a tool grant takes effect on the next request without restarting services', async t => {
  const { storage, get } = await setup(t);
  storage.setManager(user.uid, true); assert.equal((await get(ROUTES.adminOverview)).status, 200);
  storage.setManager(user.uid, false); assert.equal((await get(ROUTES.adminOverview)).status, 403);
});
test('replaying a signed authorization succeeds at most once, including concurrent requests', async t => {
  const { get } = await setup(t);
  const token = signBridgeToken(keys.privateKey, user, ROUTES.session);
  const responses = await Promise.all([get(ROUTES.session, user, token), get(ROUTES.session, user, token)]);
  assert.deepEqual(responses.map(r => r.status).sort(), [200, 401]);
});
test('replay protection persists through a database/service restart', async t => {
  const { service, storage, get, effective } = await setup(t);
  const token = signBridgeToken(keys.privateKey, user, ROUTES.session);
  assert.equal((await get(ROUTES.session, user, token)).status, 200);
  await service.close(); storage.close();
  const reopened = createService(effective); const address = await reopened.listen(); t.after(() => reopened.close());
  const response = await fetch(`http://127.0.0.1:${address.port}${ROUTES.session}`, { headers: { authorization: `Bearer ${token}` } });
  assert.equal(response.status, 401);
});
test('schema 1 migrates transactionally and preserves the original tool identity', t => {
  const { config } = fixture(t); mkdirSync(config.dataPath, { recursive: true });
  const db = new DatabaseSync(join(config.dataPath, 'metadata.sqlite'));
  db.exec("CREATE TABLE service_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL) STRICT; INSERT INTO service_meta VALUES('owner','academic-file-transfer'),('instance_id','original-instance'); PRAGMA user_version=1;"); db.close();
  const storage = openStorage(config); storage.setManager(user.uid, true); assert.equal(storage.isManager(user.uid), true);
  const jti = randomUUID(); assert.equal(storage.consumeNonce(jti, 101, 100), true); assert.equal(storage.consumeNonce(jti, 101, 100), false);
  storage.close();
  const check = new DatabaseSync(join(config.dataPath, 'metadata.sqlite'));
  assert.equal(check.prepare("SELECT value FROM service_meta WHERE key='instance_id'").get().value, 'original-instance');
  assert.equal(check.prepare('PRAGMA user_version').get().user_version, 8); check.close();
});
