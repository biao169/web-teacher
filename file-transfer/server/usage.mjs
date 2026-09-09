import { createHash } from 'node:crypto';
import { byteCount } from '../shared/contracts.mjs';
import { policyFor } from '../shared/settings.mjs';
import { lanError } from '../shared/lan.mjs';

export const guestIdValid = id => typeof id === 'string' && /^guest:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(id);
// Stable across logins, distinct from the short-lived authentication lease.
export function usageKey(identity) {
  if (identity.kind === 'anonymous' && !guestIdValid(identity.uid)) throw lanError('FT_GUEST_REQUIRED', 401);
  return createHash('sha256').update(`${identity.kind}:${identity.uid}`).digest('hex');
}
export function installUsage(db) {
  db.exec(`CREATE TABLE transfer_allowances (
    task TEXT NOT NULL, member TEXT NOT NULL, identity_key TEXT NOT NULL, kind TEXT NOT NULL,
    bytes TEXT NOT NULL, created_at INTEGER NOT NULL, authorized_at INTEGER,
    expires_at INTEGER NOT NULL, finished_at INTEGER, outcome TEXT,
    PRIMARY KEY(task, member)
  ) STRICT;
  CREATE INDEX allowance_identity ON transfer_allowances(identity_key, authorized_at);
  CREATE INDEX allowance_kind ON transfer_allowances(kind, authorized_at);
  CREATE INDEX allowance_expiry ON transfer_allowances(expires_at);`);
}
// Search actual timezone dates, including 23/25-hour days; never assume UTC+8.
export function usagePeriods(now, timeZone) {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  const date = ms => { const p = Object.fromEntries(fmt.formatToParts(ms).map(x => [x.type, x.value])); return `${p.year}-${p.month}-${p.day}`; };
  const today = date(now), month = today.slice(0, 7) + '-01';
  const tomorrow = new Date(Date.parse(today + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10);
  const d = new Date(month + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + 1); const nextMonth = d.toISOString().slice(0, 10);
  const boundary = target => { let low = now - 36 * 86400000, high = now + 36 * 86400000; while (high - low > 1) { const mid = Math.floor((low + high) / 2); if (date(mid) < target) low = mid; else high = mid; } return high; };
  return { daily: { start: boundary(today), resetAt: boundary(tomorrow) }, monthly: { start: boundary(month), resetAt: boundary(nextMonth) } };
}
export function createUsage(db) {
  const atomic = work => { db.exec('BEGIN IMMEDIATE'); try { const value = work(); db.exec('COMMIT'); return value; } catch (e) { db.exec('ROLLBACK'); throw e; } };
  function sweep(now, settings) {
    db.prepare("UPDATE transfer_allowances SET finished_at=?, outcome='expired' WHERE finished_at IS NULL AND expires_at<=?").run(now, now);
    // Required accounting survives the optional transfer-record switch. No names,
    // file paths, codes, IP addresses, credentials or file contents are stored.
    const days = Math.max(62, settings.recordTransfers ? settings.recordRetentionDays : 0);
    db.prepare('DELETE FROM transfer_allowances WHERE finished_at IS NOT NULL AND COALESCE(authorized_at, created_at)<?').run(now - days * 86400000);
  }
  function totals(key, pool, rule, settings, now) {
    const periods = usagePeriods(now, settings.personalTimeZone);
    const rows = db.prepare(`SELECT task, bytes, authorized_at, expires_at, finished_at FROM transfer_allowances WHERE ${pool ? "kind='anonymous'" : 'identity_key=?'} AND (authorized_at>=? OR finished_at IS NULL)`).all(...(pool ? [] : [key]), Math.min(periods.daily.start, periods.monthly.start));
    let reserved = 0n; const active = new Set(); const used = { daily: 0n, monthly: 0n };
    for (const r of rows) {
      const alive = r.finished_at === null && r.expires_at > now;
      if (alive) active.add(r.task);
      if (r.authorized_at === null) { if (alive) reserved += BigInt(r.bytes); }
      else for (const kind of ['daily', 'monthly']) if (r.authorized_at >= periods[kind].start && r.authorized_at < periods[kind].resetAt) used[kind] += BigInt(r.bytes);
    }
    const result = { activeTasks: active.size, concurrency: rule.concurrency };
    for (const kind of ['daily', 'monthly']) {
      const cap = rule[kind + 'Bytes']; const left = cap === null ? null : BigInt(cap) - used[kind] - reserved;
      result[kind] = { limitBytes: cap, usedBytes: used[kind].toString(), reservedBytes: reserved.toString(), remainingBytes: left === null ? null : (left > 0n ? left : 0n).toString(), resetAt: periods[kind].resetAt };
    }
    return result;
  }
  const poolRule = s => ({ dailyBytes: s.guestDailyBytes, monthlyBytes: s.guestMonthlyBytes, concurrency: s.guestConcurrency });
  function snapshot(identity, settings, now = Date.now()) {
    const established = identity.kind === 'user' || guestIdValid(identity.uid);
    return { established, basis: 'authorized-task-send-plus-receive', timeZone: settings.personalTimeZone,
      personal: established ? totals(usageKey(identity), false, policyFor(settings, identity), settings, now) : null,
      guestPool: identity.kind === 'anonymous' ? totals(null, true, poolRule(settings), settings, now) : null };
  }
  function checkBudget(value, extra, pool = false) {
    for (const kind of ['daily', 'monthly']) {
      const p = value[kind]; if (p.limitBytes !== null && (BigInt(p.usedBytes) + BigInt(p.reservedBytes) + extra > BigInt(p.limitBytes) || p.limitBytes === '0')) throw lanError(pool ? 'FT_GUEST_POOL_' + kind.toUpperCase() : 'FT_QUOTA_' + kind.toUpperCase(), 429);
    }
  }
  return {
    snapshot,
    prune(settings, now = Date.now()) { return atomic(() => sweep(now, settings)); },
    reserve(task, member, identity, bytes, settings, expiresAt, now = Date.now()) {
      const key = usageKey(identity); byteCount(bytes);
      return atomic(() => {
        sweep(now, settings);
        if (db.prepare('SELECT 1 FROM transfer_allowances WHERE task=? AND member=?').get(task, member)) throw lanError('FT_PROTOCOL');
        const rule = policyFor(settings, identity); const mine = totals(key, false, rule, settings, now);
        const already = db.prepare('SELECT 1 FROM transfer_allowances WHERE task=? AND identity_key=? AND finished_at IS NULL').get(task, key);
        if (!already && mine.activeTasks >= rule.concurrency) throw lanError('FT_CONCURRENCY', 429);
        checkBudget(mine, BigInt(bytes));
        if (identity.kind === 'anonymous') {
          const pool = totals(null, true, poolRule(settings), settings, now);
          const sameTask = db.prepare("SELECT 1 FROM transfer_allowances WHERE task=? AND kind='anonymous' AND finished_at IS NULL").get(task);
          if (!sameTask && pool.activeTasks >= pool.concurrency) throw lanError('FT_GUEST_POOL_CONCURRENCY', 429);
          checkBudget(pool, BigInt(bytes), true);
        }
        db.prepare('INSERT INTO transfer_allowances(task,member,identity_key,kind,bytes,created_at,expires_at) VALUES(?,?,?,?,?,?,?)').run(task, member, key, identity.kind, bytes, now, expiresAt);
      });
    },
    authorize(task, identities, settings, now = Date.now()) {
      return atomic(() => {
        sweep(now, settings);
        const rows = db.prepare('SELECT * FROM transfer_allowances WHERE task=? ORDER BY member').all(task);
        if (rows.length !== 2 || rows.some(r => r.finished_at !== null)) throw lanError('FT_AUTH_EXPIRED', 401);
        if (identities.length !== 2 || identities.some((id, i) => usageKey(id) !== rows[i].identity_key)) throw lanError('FT_PROTOCOL');
        if (rows.every(r => r.authorized_at !== null)) return; // Retry is idempotent.
        if (rows.some(r => r.authorized_at !== null)) throw lanError('FT_PROTOCOL');
        for (const id of identities) checkBudget(totals(usageKey(id), false, policyFor(settings, id), settings, now), 0n);
        if (identities.some(id => id.kind === 'anonymous')) checkBudget(totals(null, true, poolRule(settings), settings, now), 0n, true);
        db.prepare('UPDATE transfer_allowances SET authorized_at=? WHERE task=?').run(now, task);
      });
    },
    authorizeSingle(task, member, identity, settings, now = Date.now()) {
      return atomic(() => {
        sweep(now, settings);
        const row=db.prepare('SELECT * FROM transfer_allowances WHERE task=? AND member=?').get(task,member);
        if(!row||row.finished_at!==null||row.identity_key!==usageKey(identity))throw lanError('FT_AUTH_EXPIRED',401);
        if(row.authorized_at!==null)return;
        checkBudget(totals(usageKey(identity),false,policyFor(settings,identity),settings,now),0n);
        if(identity.kind==='anonymous')checkBudget(totals(null,true,poolRule(settings),settings,now),0n,true);
        db.prepare('UPDATE transfer_allowances SET authorized_at=? WHERE task=? AND member=?').run(now,task,member);
      });
    },
    reopen(task,member,identity,settings,expiresAt,now=Date.now()) {
      return atomic(()=>{sweep(now,settings);const key=usageKey(identity),r=db.prepare('SELECT * FROM transfer_allowances WHERE task=? AND member=?').get(task,member);
        if(!r||r.identity_key!==key||r.authorized_at===null)throw lanError('FT_RECOVERY_UNAVAILABLE');
        const own=totals(key,false,policyFor(settings,identity),settings,now),already=db.prepare('SELECT 1 FROM transfer_allowances WHERE task=? AND identity_key=? AND finished_at IS NULL AND expires_at>?').get(task,key,now);
        if(!already&&own.activeTasks>=own.concurrency)throw lanError('FT_CONCURRENCY',429);
        if(identity.kind==='anonymous'){const pool=totals(null,true,poolRule(settings),settings,now),same=db.prepare("SELECT 1 FROM transfer_allowances WHERE task=? AND kind='anonymous' AND finished_at IS NULL AND expires_at>?").get(task,now);if(!same&&pool.activeTasks>=pool.concurrency)throw lanError('FT_GUEST_POOL_CONCURRENCY',429);}
        // Reopen the original charged row. Never create another authorization.
        db.prepare('UPDATE transfer_allowances SET expires_at=?,finished_at=NULL,outcome=NULL WHERE task=? AND member=?').run(expiresAt,task,member);
      });
    },
    touch(task, expiresAt, now = Date.now()) {
      const result = db.prepare('UPDATE transfer_allowances SET expires_at=? WHERE task=? AND finished_at IS NULL AND expires_at>?').run(expiresAt, task, now);
      if (!result.changes) throw lanError('FT_AUTH_EXPIRED', 401);
    },
    finish(task, outcome, now = Date.now()) {
      db.prepare('UPDATE transfer_allowances SET finished_at=?, outcome=? WHERE task=? AND finished_at IS NULL').run(now, outcome, task);
    },
  };
}
