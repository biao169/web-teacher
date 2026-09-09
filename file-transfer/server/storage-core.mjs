import { createRecovery } from './recovery.mjs';
import { createUsage } from './usage.mjs';
import { createVpnBudget } from './vpn-budget.mjs';
import { defaultSettings, validateSubmission, settingsError, validUid } from '../shared/settings.mjs';
export function createStorageCore(db,config,createShares){
  let closed = false;
  function snapshot() {
    const row = db.prepare('SELECT * FROM tool_settings WHERE id=1').get();
    return { revision: row.revision, settings: { ...defaultSettings(), ...JSON.parse(row.document) }, updatedAt: row.updated_at, updatedBy: row.updated_by,
      managers: db.prepare('SELECT user_uid FROM admin_grants ORDER BY user_uid').all().map(r => r.user_uid),
      audit: db.prepare('SELECT revision, changed_at, changed_by, action FROM settings_audit ORDER BY revision DESC LIMIT 20').all() };
  }
  function record(actor, action) {
    const at = new Date().toISOString();
    db.prepare('UPDATE tool_settings SET revision=revision+1, updated_at=?, updated_by=? WHERE id=1').run(at, actor);
    db.prepare('INSERT INTO settings_audit SELECT revision, ?, ?, ? FROM tool_settings WHERE id=1').run(at, actor, action);
    db.exec('DELETE FROM settings_audit WHERE revision NOT IN (SELECT revision FROM settings_audit ORDER BY revision DESC LIMIT 100)');
  }
  return {
    accountsDB: db,
    recovery: createRecovery(db,snapshot),
    shares: createShares(db,config,snapshot),
    usage: createUsage(db),
    vpn: createVpnBudget(db, snapshot),
    readSettings: snapshot,
    saveSettings(submission, actor) {
      const value = validateSubmission(submission);
      db.exec('BEGIN IMMEDIATE');
      try {
        if (!db.prepare('SELECT 1 FROM admin_grants WHERE user_uid=?').get(actor)) throw settingsError('FT_FORBIDDEN', 403);
        if (snapshot().revision !== value.revision) throw settingsError('FT_CONFLICT', 409);
        // A web save must retain its current administrator. Recovery CLI remains available.
        if (!value.managers.includes(actor)) throw settingsError('FT_VALIDATION', 422, { managers: 'keepSelf' });
        db.prepare('UPDATE tool_settings SET document=? WHERE id=1').run(JSON.stringify(value.settings));
        for (const { user_uid } of db.prepare('SELECT user_uid FROM admin_grants').all()) if (!value.managers.includes(user_uid)) db.prepare('DELETE FROM admin_grants WHERE user_uid=?').run(user_uid);
        for (const uid of value.managers) db.prepare('INSERT OR IGNORE INTO admin_grants VALUES(?, ?, ?)').run(uid, new Date().toISOString(), actor);
        record(actor, 'settings-and-grants');
        const saved = snapshot(); db.exec('COMMIT'); return saved;
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    },
    consumeNonce(jti, expiresAt, now) {
      db.exec('BEGIN IMMEDIATE');
      try {
        db.prepare('DELETE FROM bridge_nonces WHERE expires_at <= ?').run(now);
        if (db.prepare('SELECT COUNT(*) AS count FROM bridge_nonces').get().count >= 10000) throw new Error('FT_AUTH_BUSY');
        const result = db.prepare('INSERT OR IGNORE INTO bridge_nonces(jti, expires_at) VALUES (?, ?)').run(jti, expiresAt);
        db.exec('COMMIT'); return result.changes === 1;
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    },
    isManager(uid) { return typeof uid === 'string' && Boolean(db.prepare('SELECT 1 FROM admin_grants WHERE user_uid = ?').get(uid)); },
    listManagers() { return db.prepare('SELECT user_uid, granted_at, granted_by FROM admin_grants ORDER BY user_uid').all(); },
    setManager(uid, enabled) {
      if (!validUid(uid)) throw new Error('FT_INVALID_UID');
      db.exec('BEGIN IMMEDIATE');
      try {
        const result = enabled ? db.prepare("INSERT OR IGNORE INTO admin_grants(user_uid, granted_at, granted_by) VALUES (?, ?, 'local-operator')").run(uid, new Date().toISOString()) : db.prepare('DELETE FROM admin_grants WHERE user_uid = ?').run(uid);
        if (result.changes) record('local-operator', enabled ? 'grant' : 'revoke');
        db.exec('COMMIT');
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    },
    health() {
      if (closed) return false;
      try { return db.prepare("SELECT value FROM service_meta WHERE key = 'owner'").get()?.value === 'academic-file-transfer'; }
      catch { return false; }
    },
    close() { if (!closed) { db.close(); closed = true; } },
  };
}
