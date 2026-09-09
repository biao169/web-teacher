import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { Worker } from 'node:worker_threads';
import { openStorage } from '../server/storage.mjs';
import { usageKey, usagePeriods } from '../server/usage.mjs';
import { signGuestCookie, readGuestCookie } from '../server/guest-cookie.mjs';
import { identityFromSession, validateIdentity } from '../server/bridge-token.mjs';
import { defaultSettings, defaultRule, policyFor, publicPolicy } from '../shared/settings.mjs';
import { fixture } from './helpers.mjs';

const user = (uid = 'a', sessionVersion = 'session') => ({ kind: 'user', uid, sessionVersion, name: uid, roleId: 'staff', roleName: 'Staff', mustChangePassword: false });
const guest = () => identityFromSession(null, 'guest:' + randomUUID());
const start = Date.parse('2026-09-08T04:00:00Z');
function setup(t) { const { config } = fixture(t); const store = openStorage(config); t.after(() => store.close()); const s = { ...defaultSettings(), enabled: true, lanVerified: true, lanNetworks: '192.168.1.0/24' }; return { config, store, u: store.usage, s }; }
function pair(u, s, task = 'one', bytes = '10', now = start, a = user(), b = user('b')) {
  u.reserve(task, 'send', a, bytes, s, now + 45000, now); u.reserve(task, 'receive', b, bytes, s, now + 45000, now);
  return { authorize: () => u.authorize(task, [b, a], s, now), a, b };
}
test('signed guest identity resists tampering, expires, renews the same ID and is distinct from teacher accounts', () => {
  const keys = generateKeyPairSync('ed25519'); const cookie = signGuestCookie(keys.privateKey, undefined, 1000);
  assert.equal(readGuestCookie(keys.publicKey, cookie.value, 1000), cookie.uid);
  assert.equal(readGuestCookie(keys.privateKey, cookie.value, 1001), cookie.uid);
  assert.equal(readGuestCookie(keys.privateKey, cookie.value, 1000 + 30 * 86400), null);
  assert.equal(readGuestCookie(keys.publicKey, cookie.value.replace(/^./, 'X'), 1000), null);
  assert.equal(readGuestCookie(generateKeyPairSync('ed25519').publicKey, cookie.value, 1000), null);
  assert.equal(signGuestCookie(keys.privateKey, cookie.uid, 2000).uid, cookie.uid);
  assert.throws(() => validateIdentity({ ...guest(), uid: 'pretend-admin' }));
  assert.throws(() => usageKey(identityFromSession(null)), /FT_GUEST_REQUIRED/);
  assert.equal(usageKey(user('a', 'first')), usageKey(user('a', 'second')));
  assert.notEqual(usageKey(guest()), usageKey(guest()));
});
test('timezone boundaries handle Shanghai midnight, month rollover and both DST changes', () => {
  assert.equal(usagePeriods(start, 'Asia/Shanghai').daily.start, Date.parse('2026-09-07T16:00:00Z'));
  const end = usagePeriods(Date.parse('2026-12-31T20:00:00Z'), 'UTC');
  assert.equal(end.monthly.resetAt, Date.parse('2027-01-01T00:00:00Z'));
  for (const [iso, hours] of [['2026-03-08T12:00:00Z', 23], ['2026-11-01T12:00:00Z', 25]]) {
    const p = usagePeriods(Date.parse(iso), 'America/New_York'); assert.equal(p.daily.resetAt - p.daily.start, hours * 3600000);
  }
});
test('reservation blocks another task; pre-authorization cancellation releases all allowance', t => {
  const { u, s } = setup(t); s.rules[1].dailyBytes = '10';
  u.reserve('one', 'send', user(), '10', s, start + 45000, start);
  assert.equal(u.snapshot(user(), s, start).personal.daily.reservedBytes, '10');
  assert.throws(() => u.reserve('two', 'send', user(), '1', s, start + 45000, start), /FT_QUOTA_DAILY/);
  u.finish('one', 'FT_CANCELLED', start); u.finish('one', 'FT_CANCELLED', start);
  assert.equal(u.snapshot(user(), s, start).personal.daily.remainingBytes, '10');
  u.reserve('two', 'send', user(), '10', s, start + 45000, start);
});
test('authorization charges both sides exactly once; later failure and service restart cannot refund it', t => {
  const { u, s, store, config } = setup(t); s.rules[1].dailyBytes = '10';
  const p = pair(u, s); p.authorize(); p.authorize(); u.finish('one', 'FT_PEER_LEFT', start);
  store.close(); const reopened = openStorage(config); t.after(() => reopened.close());
  for (const id of [p.a, p.b]) { const v = reopened.usage.snapshot(id, s, start).personal; assert.equal(v.daily.usedBytes, '10'); assert.equal(v.daily.reservedBytes, '0'); assert.equal(v.activeTasks, 0); }
  assert.throws(() => reopened.usage.reserve('two', 'send', user('a', 'new-session'), '1', s, start + 45000, start), /FT_QUOTA_DAILY/);
});
test('same account sending to itself counts two payloads but a single concurrent task', t => {
  const { u, s } = setup(t); s.rules[1].concurrency = 1; s.rules[1].dailyBytes = '20';
  const p = pair(u, s, 'self', '10', start, user(), user('a', 'second-login')); p.authorize();
  const v = u.snapshot(user(), s, start).personal; assert.equal(v.activeTasks, 1); assert.equal(v.daily.usedBytes, '20');
  assert.throws(() => u.reserve('another', 'send', user(), '0', s, start + 45000, start), /FT_CONCURRENCY/);
});
test('reservations cross midnight safely and are charged to authorization day, not creation day', t => {
  const { u, s } = setup(t); s.rules[1].dailyBytes = '10';
  const before = Date.parse('2026-09-30T15:59:50Z'), after = before + 20000;
  pair(u, s, 'crossing', '10', before);
  assert.equal(u.snapshot(user(), s, after).personal.daily.reservedBytes, '10');
  u.authorize('crossing', [user('b'), user()], s, after);
  assert.equal(u.snapshot(user(), s, after).personal.monthly.usedBytes, '10');
  u.finish('crossing', 'FT_COMPLETE', after);
  assert.throws(() => u.reserve('more', 'send', user(), '1', s, after + 45000, after), /FT_QUOTA_DAILY/);
  assert.equal(u.snapshot(user(), s, after + 86400000).personal.daily.usedBytes, '0');
  assert.equal(u.snapshot(user(), s, after + 86400000).personal.monthly.usedBytes, '10');
});
test('crashed reservations expire; authorized bytes remain charged and expired leases cannot resurrect', t => {
  const { u, s } = setup(t); pair(u, s, 'crashed');
  assert.equal(u.snapshot(user(), s, start + 45001).personal.daily.reservedBytes, '0');
  assert.throws(() => u.touch('crashed', start + 90000, start + 45001), /FT_AUTH_EXPIRED/);
  assert.throws(() => u.authorize('crashed', [user('b'), user()], s, start + 45001), /FT_AUTH_EXPIRED/);
  pair(u, s, 'authorized').authorize(); assert.equal(u.snapshot(user(), s, start + 45001).personal.daily.usedBytes, '10');
});
test('monthly cap, zero cap, exact signed-64-bit amounts and unlimited sums never round upward', t => {
  const { u, s } = setup(t); s.rules[1].monthlyBytes = '9';
  assert.throws(() => u.reserve('one', 'send', user(), '10', s, start + 45000, start), /FT_QUOTA_MONTHLY/);
  s.rules[1].monthlyBytes = '0'; assert.throws(() => u.reserve('zero', 'send', user(), '0', s, start + 45000, start), /FT_QUOTA_MONTHLY/);
  s.rules[1].monthlyBytes = '9223372036854775807'; pair(u, s, 'huge', '9223372036854775807').authorize(); u.finish('huge', 'done', start);
  assert.equal(u.snapshot(user(), s, start).personal.monthly.remainingBytes, '0');
  s.rules[1].monthlyBytes = null; pair(u, s, 'more', '9223372036854775807').authorize();
  assert.equal(u.snapshot(user(), s, start).personal.monthly.usedBytes, '18446744073709551614');
});
test('independent guests still share an atomic pool cap; a new cookie cannot reset shared usage', t => {
  const { u, s } = setup(t); s.guestDailyBytes = '10'; const a = guest(), b = guest();
  const p = pair(u, s, 'guest-one', '10', start, a, user()); p.authorize(); u.finish('guest-one', 'done', start);
  const value = u.snapshot(b, s, start); assert.equal(value.personal.daily.usedBytes, '0'); assert.equal(value.guestPool.daily.usedBytes, '10');
  assert.throws(() => u.reserve('guest-two', 'send', b, '1', s, start + 45000, start), /FT_GUEST_POOL_DAILY/);
  assert.equal(u.snapshot(user(), s, start).guestPool, null);
  s.guestDailyBytes = null; s.guestConcurrency = 1;
  u.reserve('guest-three', 'send', a, '1', s, start + 45000, start);
  assert.throws(() => u.reserve('guest-four', 'send', b, '1', s, start + 45000, start), /FT_GUEST_POOL_CONCURRENCY/);
});
test('rule precedence and rate provenance are visible, quota exhaustion blocks only new tasks', t => {
  const { u, s } = setup(t); const role = { ...defaultRule('role', 'staff'), send: true, lanRateKbps: 500, dailyBytes: '10' };
  s.rules.push(role); assert.equal(policyFor(s, user()).source, 'role'); assert.equal(policyFor(s, user()).lanRateKbps, 500);
  s.rules.push({ ...defaultRule('user', 'a'), send: true, dailyBytes: '10' }); s.lanRateKbps = 100;
  assert.equal(policyFor(s, user()).source, 'user'); assert.equal(policyFor(s, user()).rateSource.lan, 'global');
  u.reserve('one', 'send', user(), '10', s, start + 45000, start);
  const p = publicPolicy(s, user(), u.snapshot(user(), s, start)); assert.equal(p.accessReasons.send, 'FT_QUOTA_DAILY'); assert.equal(p.accessReasons.receive, 'FT_ACCESS_DENIED');
  assert.equal(p.transferAvailable, false); assert.equal(p.usage.personal.daily.reservedBytes, '10');
  assert.equal(JSON.stringify(p).includes('identity_key'), false);
});
test('two worker connections cannot spend the same final allowance concurrently', async t => {
  const { config, s } = setup(t); s.rules[1].dailyBytes = '10'; const barrier = new SharedArrayBuffer(4);
  const code = `const {parentPort,workerData:w}=require('node:worker_threads');(async()=>{const {openStorage}=await import(w.url);const st=openStorage(w.config);parentPort.postMessage('ready');Atomics.wait(new Int32Array(w.barrier),0,0);try{st.usage.reserve(w.task,'send',w.identity,'10',w.settings,w.now+45000,w.now);parentPort.postMessage('ok')}catch(e){parentPort.postMessage(e.code)}finally{st.close()}})().catch(e=>{throw e});`;
  const workers = [1, 2].map(n => new Worker(code, { eval: true, workerData: { url: new URL('../server/storage.mjs', import.meta.url).href, config, task: 'race-' + n, identity: user(), settings: s, now: start, barrier } }));
  t.after(() => Promise.all(workers.map(w => w.terminate())));
  let ready = 0;
  const results = await Promise.all(workers.map(w => new Promise((resolve, reject) => { w.on('error', reject); w.on('message', m => { if (m === 'ready') { if (++ready === 2) { Atomics.store(new Int32Array(barrier), 0, 1); Atomics.notify(new Int32Array(barrier), 0); } } else resolve(m); }); })));
  assert.deepEqual(results.sort(), ['FT_QUOTA_DAILY', 'ok']);
});
