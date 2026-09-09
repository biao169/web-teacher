import { readFileSync, writeFileSync, lstatSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ensureStoragePath } from './storage.mjs';

const error = code => new Error(code);
export function readRuntimeLock(config) {
  const path = join(config.dataPath, 'runtime.lock');
  let stat;
  try { stat = lstatSync(path); } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > 4096) throw error('FT_LOCK_INVALID');
  let value; try { value = JSON.parse(readFileSync(path, 'utf8')); } catch { throw error('FT_LOCK_INVALID'); }
  if (!Number.isSafeInteger(value.pid) || value.pid < 1 || typeof value.token !== 'string' || !/^[a-f0-9-]{36}$/u.test(value.token)) throw error('FT_LOCK_INVALID');
  return value;
}
export function acquireRuntimeLock(config, purpose = 'service') {
  const path = join(ensureStoragePath(config), 'runtime.lock');
  const value = { pid: process.pid, token: randomUUID(), purpose, createdAt: new Date().toISOString() };
  try { writeFileSync(path, JSON.stringify(value) + '\n', { flag: 'wx', mode: 0o600 }); }
  catch (e) { if (e.code === 'EEXIST') throw error('FT_RUNTIME_BUSY: 数据目录已有服务或维护锁。停止服务；异常退出后使用 maintenance.mjs unlock-stale。'); throw e; }
  let released = false;
  return () => {
    if (released) return;
    // Never remove another owner's lock, including after external operator changes.
    if (readRuntimeLock(config)?.token === value.token) unlinkSync(path);
    released = true;
  };
}
export function unlockStale(config) {
  ensureStoragePath(config);
  const value = readRuntimeLock(config);
  if (!value) return { unlocked: false };
  try { process.kill(value.pid, 0); throw error('FT_RUNTIME_BUSY: 锁记录的进程仍存在，拒绝解锁。'); }
  catch (e) { if (e.code !== 'ESRCH') throw e; }
  if (readRuntimeLock(config)?.token !== value.token) throw error('FT_LOCK_CHANGED');
  unlinkSync(join(config.dataPath, 'runtime.lock'));
  return { unlocked: true };
}
