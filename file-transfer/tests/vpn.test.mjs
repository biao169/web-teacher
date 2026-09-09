import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { writeFileSync, symlinkSync, chmodSync, mkdirSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { openStorage } from '../server/storage.mjs';
import { readInterface, readSnapshot, createMeterMonitor } from '../server/meter-source.mjs';
import { copyMetered } from '../server/metered-copy.mjs';
import { bytesToUnit, unitToBytes } from '../shared/vpn.mjs';
import { usagePeriods } from '../server/usage.mjs';
import { fixture } from './helpers.mjs';

const at = Date.parse('2026-09-08T04:00:00Z');
function setup(t, overrides = {}) {
  const { config, root } = fixture(t), store = openStorage(config); t.after(() => store.close()); store.setManager('owner', true);
  const save = patch => { const current = store.readSettings(); return store.saveSettings({ revision: current.revision, settings: { ...current.settings, ...patch }, managers: current.managers }, 'owner'); };
  save({ vpnMeterSource: 'snapshot', vpnProtectionMode: 'estimate', vpnScopeVerified: true, vpnDailyBytes: '1000', vpnMonthlyBytes: '2000', vpnReserveBytes: '100', ...overrides });
  const snapshot = (now = at, daily = '100', monthly = '200') => { const s = store.readSettings().settings, p = usagePeriods(now, s.vpnTimeZone); return { kind: 'snapshot', sourceId: s.vpnSourceId, observedAt: now, timeZone: s.vpnTimeZone, billing: s.vpnBilling, daily: { ...p.daily, usedBytes: daily }, monthly: { ...p.monthly, usedBytes: monthly } }; };
  const observe = sample => store.vpn.observe(sample, store.readSettings().revision, sample.observedAt);
  const counter = (now = at, rx = '1000', tx = '2000', epoch = 'boot:1') => ({ kind: 'counter', sourceId: store.readSettings().settings.vpnSourceId, observedAt: now, rxBytes: rx, txBytes: tx, epoch });
  const calibrate = (dailyBytes = '100', monthlyBytes = '200', now = at) => store.vpn.calibrate({ revision: store.readSettings().revision, dailyBytes, monthlyBytes }, 'owner', now);
  return { store, budget: store.vpn, config, root, save, snapshot, observe, counter, calibrate };
}
test('GB/GiB switching preserves single-byte and signed-64-bit values; fractional input never rounds budgets up', () => {
  for (const unit of ['GB', 'GiB']) for (const bytes of ['0', '1', '1073741824', '9223372036854775807']) assert.equal(unitToBytes(bytesToUnit(bytes, unit), unit), bytes);
  assert.equal(unitToBytes('1', 'GiB'), '1073741824'); assert.equal(unitToBytes('0.1', 'GiB'), '107374182');
  assert.equal(unitToBytes('', 'GB', true), null); assert.throws(() => unitToBytes('-1', 'GB')); assert.throws(() => unitToBytes('Infinity', 'GiB'));
});
test('strict mode never treats a fresh polling snapshot or a checkbox as an enforced gateway cap', t => {
  const c = setup(t, { vpnProtectionMode: 'strict' }); c.observe(c.snapshot());
  const v = c.budget.view(at); assert.equal(v.meterAvailable, true); assert.equal(v.reason, 'FT_VPN_HARD_GATE_REQUIRED'); assert.equal(v.hardLimitAvailable, false);
  assert.throws(() => c.budget.reserve({ rxBytes: '0', txBytes: '1', path: 'confirmed-vpn' }, at), /FT_VPN_HARD_GATE_REQUIRED/);
  c.save({ vpnGuard: false }); assert.equal(c.budget.view(at).reason, 'FT_VPN_DISABLED');
});
test('snapshot validates source, time, timezone, billing, exact periods and nondecreasing usage', t => {
  const c = setup(t), good = c.snapshot();
  for (const patch of [{ sourceId: 'wrong' }, { observedAt: at + 1 }, { timeZone: 'UTC' }, { billing: 'outbound' }, { extra: true }, { daily: { ...good.daily, start: good.daily.start + 1 } }]) assert.throws(() => c.budget.observe({ ...good, ...patch }, c.store.readSettings().revision, at));
  c.observe(good); c.observe(c.snapshot(at + 1, '1', '2'));
  assert.equal(c.budget.view(at + 1).daily.usedBytes, '100'); assert.equal(c.budget.view(at + 1).monthly.usedBytes, '200');
  assert.throws(() => c.budget.observe(c.snapshot(at - 1), c.store.readSettings().revision, at), /FT_METER_INVALID/);
});
test('same old sample never refreshes freshness; recovery needs a new observation', t => {
  const c = setup(t); const sample = c.snapshot(); c.observe(sample);
  c.budget.observe(sample, c.store.readSettings().revision, at + 10000);
  assert.equal(c.budget.view(at + 30000).reason, 'FT_METER_STALE');
  c.observe(c.snapshot(at + 30001)); assert.equal(c.budget.view(at + 30001).reason, null);
});
test('local counters need an initial baseline and include all selected-interface traffic in the chosen billing direction', t => {
  const c = setup(t, { vpnMeterSource: 'interface', vpnInterface: 'tun0', vpnBilling: 'outbound' }); c.observe(c.counter());
  assert.throws(() => c.calibrate('invalid', '200'), e => e.status === 422 && e.code === 'FT_METER_INVALID');
  assert.equal(c.budget.view(at).reason, 'FT_METER_BASELINE'); c.calibrate(); c.observe(c.counter(at + 1000, '1100', '2250'));
  assert.equal(c.budget.view(at + 1000).daily.usedBytes, '350'); assert.equal(c.budget.view(at + 1000).monthly.usedBytes, '450');
  c.calibrate('0', '0', at + 1001); assert.equal(c.budget.view(at + 1001).daily.usedBytes, '350');
  c.save({ vpnBilling: 'both' }); assert.equal(c.budget.view(at + 1001).reason, 'FT_METER_CHANGED');
});
test('counter reset stays blocked over later samples until an administrator recalibrates', t => {
  const c = setup(t, { vpnMeterSource: 'interface', vpnInterface: 'tun0' }); c.observe(c.counter()); c.calibrate();
  c.observe(c.counter(at + 1, '0', '0', 'new-boot:1')); assert.equal(c.budget.view(at + 1).reason, 'FT_METER_RESET');
  c.observe(c.counter(at + 2, '10', '20', 'new-boot:1')); assert.equal(c.budget.view(at + 2).reason, 'FT_METER_RESET');
  assert.throws(() => c.budget.calibrate({ revision: c.store.readSettings().revision, dailyBytes: '1', monthlyBytes: '2' }, 'stranger', at + 2), /FT_FORBIDDEN/);
  c.calibrate('150', '250', at + 2); assert.equal(c.budget.view(at + 2).daily.usedBytes, '150');
});
test('counter intervals crossing midnight are charged conservatively and old windows cannot cross day or month boundaries', t => {
  const c = setup(t, { vpnMeterSource: 'interface', vpnInterface: 'tun0' }); const before = Date.parse('2026-09-30T15:59:59.500Z');
  c.observe(c.counter(before)); c.calibrate('100', '200', before);
  const g = c.budget.reserve({ rxBytes: '0', txBytes: '10', path: 'confirmed-vpn' }, before);
  assert.equal(g.expiresAt, Date.parse('2026-09-30T16:00:00Z'));
  c.observe(c.counter(before + 1000, '1010', '2020'));
  assert.equal(c.budget.view(before + 1000).daily.usedBytes, '30'); assert.equal(c.budget.view(before + 1000).monthly.usedBytes, '30');
  assert.throws(() => c.budget.assertGrant(g.token, before + 1000), /FT_VPN_LEASE/);
});
test('reserved and issued amounts include both billing directions and overhead; cancellation releases only unused bytes', t => {
  const c = setup(t); c.observe(c.snapshot()); const g = c.budget.reserve({ rxBytes: '100', txBytes: '100', path: 'confirmed-vpn' }, at);
  assert.equal(g.reservedBytes, '220'); assert.equal(c.budget.view(at).daily.remainingBytes, '580');
  c.budget.spend(g.token, { sequence: 1, rxBytes: '50', txBytes: '50' }, at);
  c.budget.spend(g.token, { sequence: 1, rxBytes: '50', txBytes: '50' }, at);
  assert.equal(c.budget.view(at).pendingBytes, '110'); c.budget.finish(g.token, at);
  assert.equal(c.budget.view(at).reservedBytes, '0'); assert.equal(c.budget.view(at).pendingBytes, '110');
  assert.throws(() => c.budget.spend(g.token, { sequence: 2, rxBytes: '100', txBytes: '100' }, at), /FT_VPN_LEASE/);
});
test('spending the exact final reserved allowance works, while an additional reservation is refused', t => {
  const c = setup(t, { vpnOverheadPercent: 0 }); c.observe(c.snapshot());
  const g = c.budget.reserve({ rxBytes: '0', txBytes: '800', path: 'confirmed-vpn' }, at);
  assert.throws(() => c.budget.reserve({ rxBytes: '0', txBytes: '1', path: 'confirmed-vpn' }, at), /FT_VPN_DAILY/);
  c.observe(c.snapshot(at + 1));
  c.budget.spend(g.token, { sequence: 1, rxBytes: '0', txBytes: '800' }, at + 1); assert.equal(c.budget.view(at + 1).pendingBytes, '800');
});
test('shared external usage can revoke an existing grant; later samples do not resurrect it', t => {
  const c = setup(t); c.observe(c.snapshot()); const g = c.budget.reserve({ rxBytes: '0', txBytes: '100', path: 'confirmed-vpn' }, at);
  c.observe(c.snapshot(at + 1, '850', '1000')); assert.throws(() => c.budget.assertGrant(g.token, at + 1), /FT_VPN_LEASE/);
  c.observe(c.snapshot(at + 2, '100', '200')); assert.throws(() => c.budget.assertGrant(g.token, at + 2), /FT_VPN_LEASE/);
});
test('meter failure, settings edits, unknown routes and monthly exhaustion block metered grants', t => {
  const c = setup(t); c.observe(c.snapshot());
  assert.throws(() => c.budget.reserve({ rxBytes: '0', txBytes: '10', path: 'unknown' }, at), /FT_VPN_PATH_UNKNOWN/);
  assert.throws(() => c.budget.reserve({ rxBytes: '0', txBytes: '10', path: 'confirmed-outside-vpn' }, at), /FT_VPN_PATH_UNKNOWN/);
  const g = c.budget.reserve({ rxBytes: '0', txBytes: '10', path: 'confirmed-vpn' }, at); c.budget.fail('FT_METER_UNAVAILABLE', at + 1);
  assert.throws(() => c.budget.assertGrant(g.token, at + 1), /FT_VPN_LEASE/);
  c.observe(c.snapshot(at + 2)); const h = c.budget.reserve({ rxBytes: '0', txBytes: '10', path: 'confirmed-vpn' }, at + 2);
  c.save({ vpnReserveBytes: '101' }); assert.throws(() => c.budget.assertGrant(h.token, at + 3), /FT_VPN_LEASE/);
  c.observe(c.snapshot(at + 4, '100', '1900')); assert.equal(c.budget.view(at + 4).reason, 'FT_VPN_MONTHLY');
});
test('restart retains measured and pending usage; expired unused reservations release without refunding issued bytes', t => {
  const c = setup(t); c.observe(c.snapshot()); const g = c.budget.reserve({ rxBytes: '0', txBytes: '100', path: 'confirmed-vpn' }, at);
  c.budget.spend(g.token, { sequence: 1, rxBytes: '0', txBytes: '20' }, at); c.store.close();
  const reopened = openStorage(c.config); t.after(() => reopened.close()); const v = reopened.vpn.view(at + 2001);
  assert.equal(v.daily.usedBytes, '100'); assert.equal(v.reservedBytes, '0'); assert.equal(v.pendingBytes, '22'); assert.equal(v.activeReservations, 0);
});
test('reconciliation requires a fresh matching observation, no active windows, delay and explicit administrator confirmation', t => {
  const c = setup(t); c.observe(c.snapshot()); const g = c.budget.reserve({ rxBytes: '0', txBytes: '100', path: 'confirmed-vpn' }, at);
  c.budget.spend(g.token, { sequence: 1, rxBytes: '0', txBytes: '100' }, at); c.budget.finish(g.token, at);
  const request = observedAt => ({ revision: c.store.readSettings().revision, observedAt, confirm: true });
  assert.throws(() => c.budget.reconcile(request(at), 'owner', at), /FT_VPN_RECONCILE/);
  c.observe(c.snapshot(at + 30001, '210', '310')); assert.equal(c.budget.view(at + 30001).pendingBytes, '110');
  assert.throws(() => c.budget.reconcile({ ...request(at + 30001), confirm: false }, 'owner', at + 30001), /FT_VPN_RECONCILE/);
  c.budget.reconcile(request(at + 30001), 'owner', at + 30001); assert.equal(c.budget.view(at + 30001).pendingBytes, '0'); assert.equal(c.budget.view(at + 30001).daily.usedBytes, '210');
});
test('two SQLite worker connections cannot reserve the same remaining exit budget', async t => {
  const c = setup(t, { vpnOverheadPercent: 0 }); c.observe(c.snapshot()); const barrier = new SharedArrayBuffer(4);
  const code = `const{parentPort,workerData:w}=require('node:worker_threads');(async()=>{const{openStorage}=await import(w.url);const s=openStorage(w.config);parentPort.postMessage('ready');Atomics.wait(new Int32Array(w.barrier),0,0);try{s.vpn.reserve({rxBytes:'0',txBytes:'800',path:'confirmed-vpn'},w.now);parentPort.postMessage('ok')}catch(e){parentPort.postMessage(e.code)}finally{s.close()}})()`;
  const workers = [1, 2].map(() => new Worker(code, { eval: true, workerData: { url: new URL('../server/storage.mjs', import.meta.url).href, config: c.config, now: at, barrier } })); t.after(() => Promise.all(workers.map(w => w.terminate())));
  let ready = 0; const results = await Promise.all(workers.map(w => new Promise((resolve, reject) => { w.on('error', reject); w.on('message', m => { if (m === 'ready') { if (++ready === 2) { Atomics.store(new Int32Array(barrier), 0, 1); Atomics.notify(new Int32Array(barrier), 0); } } else resolve(m); }); })));
  assert.deepEqual(results.sort(), ['FT_VPN_DAILY', 'ok']);
});
test('bounded copy reserves before reading, preserves actual bytes and retains issued accounting', async t => {
  const c = setup(t, { vpnDailyBytes: '1000000', vpnMonthlyBytes: '2000000', vpnReserveBytes: '0', vpnOverheadPercent: 0 }); const now = Date.now(); c.observe(c.snapshot(now, '0', '0'));
  const source = Uint8Array.from({ length: 100001 }, (_, i) => i % 251), chunks = []; let offset = 0;
  const result = await copyMetered({ budget: c.budget, totalBytes: String(source.length), direction: 'both', path: 'confirmed-vpn', read: async length => { assert.ok(BigInt(c.budget.view().pendingBytes) > 0n); const chunk = source.slice(offset, offset += length); return chunk; }, write: async bytes => chunks.push(bytes.slice()) });
  assert.equal(result.bytes, '100001'); assert.deepEqual(Buffer.concat(chunks), Buffer.from(source)); assert.equal(c.budget.view().pendingBytes, '200002');
});
test('quota failure reads no content and a meter outage cancels an ongoing cooperative writer', async t => {
  const c = setup(t); c.observe(c.snapshot(Date.now())); let read = false;
  await assert.rejects(copyMetered({ budget: c.budget, totalBytes: '1000', direction: 'outbound', path: 'confirmed-vpn', read: async () => { read = true; }, write: async () => {} })); assert.equal(read, false);
  const beginning = Date.now(); let aborted = false;
  await assert.rejects(copyMetered({ budget: c.budget, totalBytes: '100', direction: 'outbound', path: 'confirmed-vpn', read: async n => new Uint8Array(n), write: async (_bytes, signal) => new Promise((_, reject) => { signal.addEventListener('abort', () => { aborted = true; reject(Error('writer stopped')); }, { once: true }); c.budget.fail('FT_METER_UNAVAILABLE'); }) }));
  assert.equal(aborted, true); assert.ok(Date.now() - beginning < 1500); assert.equal(c.budget.view().pendingBytes, '110');
});
test('Linux collector reads actual interface counters without sending traffic; Windows uses only fixed literal arguments', async () => {
  if (process.platform === 'linux') { const s = await readInterface('lo', 'read-only-loopback'); assert.equal(s.kind, 'counter'); assert.ok(BigInt(s.rxBytes) >= 0n); assert.ok(s.epoch.includes(':')); }
  let args; const result = await readInterface("VPN ' name", 'windows', { platform: 'win32', now: () => at, execute: async (command, argv, options) => { assert.equal(command, 'powershell.exe'); assert.equal(options.windowsHide, true); args = argv; return { stdout: '{"rxBytes":"9007199254740993","txBytes":"2","epoch":"boot:guid"}' }; } });
  assert.equal(args.at(-1), "VPN ' name"); assert.ok(!args.includes('-Command')); assert.ok(!args.includes('-ExecutionPolicy')); assert.equal(result.rxBytes, '9007199254740993');
  await assert.rejects(readInterface('../escape', 'bad')); await assert.rejects(readInterface('tun0', 'bad', { platform: 'unsupported' }));
});
test('snapshot reader rejects symlinks, writable-by-others files, oversized input and malformed JSON', async t => {
  const c = setup(t), path = join(c.config.dataPath, 'telemetry/vpn-snapshot.json');
  writeFileSync(path, JSON.stringify(c.snapshot()), { mode: 0o600 }); assert.equal((await readSnapshot(c.config)).sourceId, 'vpn-main');
  writeFileSync(path, '{'); await assert.rejects(readSnapshot(c.config)); writeFileSync(path, ' '.repeat(8193)); await assert.rejects(readSnapshot(c.config));
  writeFileSync(path, '{}'); if (process.platform !== 'win32') { chmodSync(path, 0o666); await assert.rejects(readSnapshot(c.config)); }
  const other = join(c.root, 'other'); mkdirSync(other); symlinkSync(join(c.config.dataPath, 'telemetry'), join(other, 'telemetry')); await assert.rejects(readSnapshot({ dataPath: other }));
});
test('monitor persists failures and ignores a late observation after settings change', async t => {
  const c = setup(t); const monitor = createMeterMonitor(c.store, c.config, { now: () => at, reader: async () => { throw Error('offline'); } }); await monitor.poll(); assert.equal(c.budget.view(at).reason, 'FT_METER_UNAVAILABLE'); await monitor.close();
  let resolve; const pending = new Promise(ok => { resolve = ok; }); const other = createMeterMonitor(c.store, c.config, { now: () => at, reader: () => pending }); const polling = other.poll(); c.save({ vpnSourceId: 'new-account' }); resolve(c.snapshot()); await polling; assert.equal(c.budget.view(at).observedAt, null); await other.close();
});
test('local import command validates and atomically publishes a billing snapshot from stdin', async t => {
  const c = setup(t); for (const dir of ['scripts', 'server', 'shared', 'web/files']) cpSync(new URL('../' + dir, import.meta.url), join(c.root, dir), { recursive: true });
  const sample = c.snapshot(Date.now()); const run = spawnSync(process.execPath, [join(c.root, 'scripts/import-vpn-snapshot.mjs')], { cwd: '/tmp', input: JSON.stringify(sample), encoding: 'utf8', timeout: 10000 });
  assert.equal(run.status, 0, run.stderr); assert.equal(JSON.parse(run.stdout).saved, true); assert.equal((await readSnapshot(c.config)).observedAt, sample.observedAt);
  assert.equal(c.budget.view().daily.usedBytes, '100');
});
