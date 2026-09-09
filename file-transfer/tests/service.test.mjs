import { test } from 'node:test';
import assert from 'node:assert/strict';
import { connect } from 'node:net';
import { generateKeyPairSync } from 'node:crypto';
import { openStorage } from '../server/storage.mjs';
import { readdirSync } from 'node:fs';
import { fixture } from './helpers.mjs';
import { createService } from '../server/service.mjs';
import { ROUTES, TRANSPORTS } from '../shared/contracts.mjs';

async function running(t, dependencies) {
  const { config } = fixture(t);
  // Ephemeral ports are test-only; operator configuration rejects port 0.
  const service = createService({ ...config, port: 0 }, dependencies);
  const address = await service.listen();
  t.after(() => service.close());
  return { service, config, port: address.port, origin: `http://127.0.0.1:${address.port}` };
}
test('health, readiness and capabilities distinguish running from transfer availability', async t => {
  const { origin } = await running(t);
  for (const path of [ROUTES.health, ROUTES.ready, ROUTES.capabilities]) {
    const res = await fetch(origin + path);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('cache-control'), 'private, no-store');
    const text = await res.text();
    assert.doesNotMatch(text, /instance_id|dataPath|projectRoot|sqlite/u);
    const body = JSON.parse(text);
    assert.equal(body.protocolVersion, 1);
    if (path === ROUTES.capabilities) {
      assert.equal(body.transferAvailable, false);
      assert.deepEqual(body.transports.map(p => p.id), TRANSPORTS);
      assert.ok(body.transports.every(p => !p.available && p.reason === 'FT_BRIDGE_UNCONFIGURED'));
    }
  }
  const head = await fetch(origin + ROUTES.health, { method: 'HEAD' });
  assert.equal(head.status, 200); assert.equal(await head.text(), '');
});
test('disabled transport/admin/auth routes cannot be enabled by payload or headers', async t => {
  const { origin, config } = await running(t);
  for (const route of ['signal', 'auth', 'admin/future', 'tasks', 'pairings', 'uploads', 'downloads/file', 'shares', 'turn', 'quota']) {
    const res = await fetch(`${origin}/transfer-api/v1/${route}?enabled=true`, { method: 'POST', headers: { 'x-user-role': 'admin', authorization: 'Bearer fake' }, body: '{"enabled":true}' });
    assert.equal(res.status, 503, route);
    assert.equal((await res.json()).error.code, 'FT_NOT_IMPLEMENTED');
  }
  assert.deepEqual(readdirSync(config.dataPath + '/temporary'), []);
});
test('private files and future frontend routes are not served', async t => {
  const { origin } = await running(t);
  for (const path of ['/', '/storage/data/metadata.sqlite', '/config.local.json', ROUTES.publicZh, ROUTES.admin, '/api/v1/auth/session']) {
    const res = await fetch(origin + path); assert.equal(res.status, 404, path);
  }
  const res = await fetch(origin + ROUTES.health, { method: 'POST', body: 'ignored' });
  assert.equal(res.status, 405); assert.equal(res.headers.get('allow'), 'GET, HEAD');
});
test('readiness degrades when storage becomes unavailable', async t => {
  const { origin } = await running(t, { storageFactory: () => ({ health: () => false, close() {} }) });
  assert.equal((await fetch(origin + ROUTES.ready)).status, 503);
  assert.equal((await fetch(origin + ROUTES.health)).status, 200);
});
test('Malformed WebSocket upgrades are refused without opening signaling', async t => {
  const { port } = await running(t);
  const response = await new Promise((resolve, reject) => {
    const socket = connect(port, '127.0.0.1', () => socket.write('GET /transfer-api/v1/signal HTTP/1.1\r\nHost: localhost\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n'));
    let text = ''; socket.setTimeout(3000, () => socket.destroy(new Error('timeout')));
    socket.on('data', chunk => { text += chunk; }); socket.on('end', () => resolve(text)); socket.on('error', reject);
  });
  assert.match(response, /^HTTP\/1.1 400/u);
});
test('shutdown is idempotent and releases its listening port', async t => {
  const { service, origin } = await running(t);
  await Promise.all([service.close(), service.close()]);
  await assert.rejects(fetch(origin + ROUTES.health, { signal: AbortSignal.timeout(2000) }));
});
test('bind conflicts are surfaced and both instances can be cleaned up', async t => {
  const { port } = await running(t);
  const { config } = fixture(t);
  const other = createService({ ...config, port });
  await assert.rejects(other.listen(), { code: 'EADDRINUSE' });
  await other.close();
});


test('readiness reports verified relay availability when LAN is disabled', async t => {
  const { config } = fixture(t), keys = generateKeyPairSync('ed25519');
  const store = openStorage(config); store.setManager('operator', true); const snapshot = store.readSettings();
  Object.assign(snapshot.settings, { enabled: true, lanEnabled: false, relayEnabled: true, serverVpnPath: 'confirmed-outside-vpn', serverOutsideVerified: true });
  store.saveSettings({ revision: snapshot.revision, settings: snapshot.settings, managers: snapshot.managers }, 'operator'); store.close();
  const service = createService({ ...config, port: 0, bridgePublicKey: keys.publicKey.export({ type: 'spki', format: 'der' }).toString('base64') });
  t.after(() => service.close()); const at = await service.listen();
  const origin = `http://127.0.0.1:${at.port}`;
  assert.equal((await (await fetch(origin + ROUTES.ready)).json()).transferAvailable, true);
  const capabilities = await (await fetch(origin + ROUTES.capabilities)).json();
  assert.equal(capabilities.transports.find(x => x.id === 'lan-direct').available, false);
  assert.equal(capabilities.transports.find(x => x.id === 'server-relay').available, true);
});
