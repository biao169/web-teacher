import { readFile, open, lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { byteCount } from '../shared/contracts.mjs';
import { settingsError } from '../shared/settings.mjs';

const run = promisify(execFile);
export async function readInterface(name, sourceId, { platform = process.platform, read = readFile, execute = run, now = Date.now } = {}) {
  if (typeof name !== 'string' || !name || name.length > 200 || name.trim() !== name || /[\\/\u0000-\u001f]/u.test(name)) throw settingsError('FT_METER_INVALID', 422);
  let value;
  if (platform === 'linux') {
    if (Buffer.byteLength(name) > 15 || /\s/u.test(name)) throw settingsError('FT_METER_INVALID', 422);
    const [rx, tx, boot, index, state] = await Promise.all(['statistics/rx_bytes', 'statistics/tx_bytes', '/proc/sys/kernel/random/boot_id', 'ifindex', 'operstate'].map(p => read(p.startsWith('/') ? p : `/sys/class/net/${name}/${p}`, 'utf8')));
    if (!['up', 'unknown'].includes(state.trim())) throw settingsError('FT_METER_UNAVAILABLE', 503);
    value = { rxBytes: byteCount(rx.trim()), txBytes: byteCount(tx.trim()), epoch: `${boot.trim()}:${index.trim()}` };
  } else if (platform === 'win32') {
    // Literal argument array, fixed bundled script, no shell or execution-policy override.
    const { stdout } = await execute('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-File', fileURLToPath(new URL('../scripts/read-interface.ps1', import.meta.url)), '-InterfaceName', name], { windowsHide: true, timeout: 5000, maxBuffer: 8192, encoding: 'utf8' });
    value = JSON.parse(stdout.replace(/^\uFEFF/u, '').trim());
    if (Object.keys(value).sort().join(',') !== 'epoch,rxBytes,txBytes') throw settingsError('FT_METER_INVALID', 422);
    byteCount(value.rxBytes); byteCount(value.txBytes);
  } else throw settingsError('FT_METER_UNAVAILABLE', 503);
  return { kind: 'counter', sourceId, observedAt: now(), ...value };
}
export async function readSnapshot(config) {
  const directory = join(config.dataPath, 'telemetry'), path = join(directory, 'vpn-snapshot.json');
  const parent = await lstat(directory);
  if (!parent.isDirectory() || parent.isSymbolicLink()) throw settingsError('FT_METER_INVALID', 422);
  const before = await lstat(path);
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size > 8192 || (process.platform !== 'win32' && (before.mode & 0o022))) throw settingsError('FT_METER_INVALID', 422);
  const handle = await open(path, 'r');
  try {
    const current = await handle.stat(); if (current.ino !== before.ino || current.dev !== before.dev) throw settingsError('FT_METER_INVALID', 422);
    const bytes = Buffer.alloc(8193); const result = await handle.read(bytes, 0, bytes.length, 0);
    if (result.bytesRead > 8192) throw settingsError('FT_METER_INVALID', 422);
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, result.bytesRead)));
  } finally { await handle.close(); }
}
export function createMeterMonitor(storage, config, { reader, now = Date.now } = {}) {
  let running = false, stopped = false, timer, nextAt = 0;
  async function poll() {
    if (running || stopped) return;
    running = true;
    try {
      const current = storage.readSettings(), s = current.settings;
      nextAt = now() + s.vpnPollSeconds * 1000;
      if (s.vpnMeterSource === 'off') return;
      const sample = reader ? await reader(s) : s.vpnMeterSource === 'interface' ? await readInterface(s.vpnInterface, s.vpnSourceId) : await readSnapshot(config);
      if (!stopped) storage.vpn.observe(sample, current.revision, now());
    } catch (e) {
      if (!stopped && e.code !== 'FT_CONFLICT') { try { storage.vpn.fail(['FT_METER_STALE', 'FT_METER_INVALID'].includes(e.code) ? e.code : 'FT_METER_UNAVAILABLE', now()); } catch { /* All grants independently recheck the database. */ } }
    } finally { running = false; }
  }
  return {
    poll,
    start() { if (timer) return; timer = setInterval(() => { if (now() >= nextAt) void poll(); }, 1000); timer.unref(); void poll(); },
    async close() { stopped = true; clearInterval(timer); while (running) await new Promise(ok => setTimeout(ok, 10)); },
  };
}
