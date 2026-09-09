import { createStorageCore } from './storage-core.mjs';
import {installRecovery,createRecovery} from './recovery.mjs';
import { installShares, createShares } from './shares.mjs';
import { lstatSync, mkdirSync, realpathSync, chmodSync } from 'node:fs';
import { join, relative, sep, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { installVpn, createVpnBudget } from './vpn-budget.mjs';
import { installUsage, createUsage } from './usage.mjs';
import { defaultSettings, validateSubmission, settingsError, validUid } from '../shared/settings.mjs';

function statIfPresent(path) {
  try { return lstatSync(path); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
function directory(path) {
  const st = statIfPresent(path);
  if (!st) mkdirSync(path, { mode: 0o700 });
  else if (st.isSymbolicLink() || !st.isDirectory()) throw new Error('FT_STORAGE: 存储路径不能是符号链接或普通文件。');
}
function regularFile(path) {
  const st = statIfPresent(path);
  if (st && (st.isSymbolicLink() || !st.isFile() || st.nlink !== 1)) throw new Error('FT_STORAGE: 数据库及其辅助文件必须是独立普通文件。');
}

export function ensureStoragePath(config) {
  // Re-check before touching disk, including callers bypassing loadConfig.
  const root = realpathSync(config.projectRoot);
  const rel = relative(resolve(config.projectRoot), config.dataPath);
  const parts = rel.split(sep);
  if (parts[0] !== 'storage' || parts.length < 2 || parts.includes('..')) throw new Error('FT_STORAGE: 数据路径必须位于本工具 storage/ 下。');
  let current = root;
  for (const part of parts) { current = join(current, part); directory(current); }
  return current;
}

export function openStorage(config) {
  const current = ensureStoragePath(config);
  for (const part of ['checkpoints', 'temporary', 'telemetry']) directory(join(current, part));
  const dbPath = join(current, 'metadata.sqlite');
  for (const suffix of ['', '-journal', '-wal', '-shm']) regularFile(dbPath + suffix);
  const db = new DatabaseSync(dbPath);
  try {
    db.exec('PRAGMA busy_timeout = 3000; PRAGMA foreign_keys = ON;');
    db.exec('BEGIN IMMEDIATE');
    const version = db.prepare('PRAGMA user_version').get().user_version;
    if (version === 0) {
      if (db.prepare("SELECT count(*) AS count FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'").get().count !== 0) throw new Error('FT_STORAGE: 拒绝使用已有的其他数据库。');
      db.exec('CREATE TABLE service_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;');
      const insert = db.prepare('INSERT INTO service_meta (key, value) VALUES (?, ?)');
      insert.run('owner', 'academic-file-transfer');
      insert.run('instance_id', randomUUID());
      insert.run('created_at', new Date().toISOString());
      db.exec('PRAGMA user_version = 1');
    } else if (![1, 2, 3, 4, 5, 6, 7, 8].includes(version)) throw new Error('FT_STORAGE: 数据库版本不兼容；请使用对应版本服务。');
    if (db.prepare("SELECT value FROM service_meta WHERE key = 'owner'").get()?.value !== 'academic-file-transfer') throw new Error('FT_STORAGE: 数据库不属于本工具。');
    if (version < 2) {
      db.exec(`CREATE TABLE admin_grants (user_uid TEXT PRIMARY KEY, granted_at TEXT NOT NULL, granted_by TEXT NOT NULL) STRICT;
        CREATE TABLE bridge_nonces (jti TEXT PRIMARY KEY, expires_at INTEGER NOT NULL) STRICT;
        CREATE INDEX bridge_nonce_expiry ON bridge_nonces(expires_at);
        PRAGMA user_version = 2;`);
    }
    if (version < 3) {
      db.exec(`CREATE TABLE tool_settings (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, document TEXT NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT NOT NULL) STRICT;
        CREATE TABLE settings_audit (revision INTEGER PRIMARY KEY, changed_at TEXT NOT NULL, changed_by TEXT NOT NULL, action TEXT NOT NULL) STRICT;
        PRAGMA user_version = 3;`);
      db.prepare('INSERT INTO tool_settings VALUES(1, 0, ?, ?, ?)').run(JSON.stringify(defaultSettings()), new Date().toISOString(), 'initial-defaults');
    }
    if (version < 4) {
      const row = db.prepare('SELECT document FROM tool_settings WHERE id=1').get();
      const settings = { lanNetworks: '', lanVerified: false, ...JSON.parse(row.document) };
      db.prepare('UPDATE tool_settings SET document=? WHERE id=1').run(JSON.stringify(settings));
      db.exec('PRAGMA user_version = 4');
    }
    if (version < 5) {
      installUsage(db);
      const row = db.prepare('SELECT document FROM tool_settings WHERE id=1').get();
      const defaults = defaultSettings();
      const settings = { personalTimeZone: defaults.personalTimeZone, guestDailyBytes: defaults.guestDailyBytes, guestMonthlyBytes: defaults.guestMonthlyBytes, guestConcurrency: defaults.guestConcurrency, ...JSON.parse(row.document) };
      db.prepare('UPDATE tool_settings SET document=? WHERE id=1').run(JSON.stringify(settings));
      db.exec('PRAGMA user_version = 5');
    }
    if (version < 6) {
      installVpn(db);
      const row = db.prepare('SELECT document FROM tool_settings WHERE id=1').get();
      db.prepare('UPDATE tool_settings SET document=? WHERE id=1').run(JSON.stringify({ ...defaultSettings(), ...JSON.parse(row.document) }));
      db.exec('PRAGMA user_version = 6');
    }
    if (version < 7) {
      installShares(db);
      const row=db.prepare('SELECT document FROM tool_settings WHERE id=1').get();
      const settings={...defaultSettings(),...JSON.parse(row.document)};
      settings.rules=settings.rules.map(rule=>({...rule,links:rule.links.map(id=>id==='turn-relay'?'server-relay':id)}));
      db.prepare('UPDATE tool_settings SET document=? WHERE id=1').run(JSON.stringify(settings));
      db.exec('PRAGMA user_version = 7');
    }
    if(version<8){installRecovery(db);const row=db.prepare('SELECT document FROM tool_settings WHERE id=1').get();db.prepare('UPDATE tool_settings SET document=? WHERE id=1').run(JSON.stringify({...defaultSettings(),...JSON.parse(row.document)}));db.exec('PRAGMA user_version = 8');}
    db.exec('COMMIT');
    if (process.platform !== 'win32') chmodSync(dbPath, 0o600);
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch { /* Transaction may already have ended. */ }
    db.close();
    throw error;
  }
  return createStorageCore(db, config, createShares);
}
