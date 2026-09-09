import { createHash, randomBytes } from 'node:crypto';
import { byteCount } from '../shared/contracts.mjs';
import { billedBytes, VPN_WINDOW_BYTES, VPN_WINDOW_MS } from '../shared/vpn.mjs';
import { usagePeriods } from './usage.mjs';
import { settingsError } from '../shared/settings.mjs';

const error = (code, status = 409) => settingsError(code, status);
const checkedBytes = value => { try { return byteCount(value); } catch { throw error('FT_METER_INVALID', 422); } };
const hash = v => createHash('sha256').update(v).digest('hex');
export const meterFingerprint = s => hash(JSON.stringify([s.vpnMeterSource, s.vpnInterface, s.vpnSourceId, s.vpnBilling, s.vpnTimeZone]));
const max = (a, b) => a > b ? a : b;
export function installVpn(db) {
  db.exec(`CREATE TABLE vpn_state(id INTEGER PRIMARY KEY CHECK(id=1), document TEXT NOT NULL) STRICT;
    INSERT INTO vpn_state VALUES(1, '{}');
    CREATE TABLE vpn_grants(token_hash TEXT PRIMARY KEY, revision INTEGER NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
      rx_max TEXT NOT NULL, tx_max TEXT NOT NULL, overhead INTEGER NOT NULL, rx_issued TEXT NOT NULL, tx_issued TEXT NOT NULL,
      sequence INTEGER NOT NULL, closed_at INTEGER, reconciled_at INTEGER) STRICT;
    CREATE INDEX vpn_grants_expiry ON vpn_grants(expires_at);
    CREATE TABLE vpn_audit(id INTEGER PRIMARY KEY, at INTEGER NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL, details TEXT NOT NULL) STRICT;`);
}
export function createVpnBudget(db, getSettings) {
  const atomic = fn => { db.exec('BEGIN IMMEDIATE'); try { const result = fn(); db.exec('COMMIT'); return result; } catch (e) { db.exec('ROLLBACK'); throw e; } };
  const read = () => JSON.parse(db.prepare('SELECT document FROM vpn_state WHERE id=1').get().document);
  const write = state => db.prepare('UPDATE vpn_state SET document=? WHERE id=1').run(JSON.stringify(state));
  function audit(actor, action, details, now) {
    db.prepare('INSERT INTO vpn_audit(at,actor,action,details) VALUES(?,?,?,?)').run(now, actor, action, JSON.stringify(details));
    db.exec('DELETE FROM vpn_audit WHERE id NOT IN (SELECT id FROM vpn_audit ORDER BY id DESC LIMIT 100)');
  }
  const cost = (rx, tx, billing, overhead) => (billedBytes(rx, tx, billing) * BigInt(100 + overhead) + 99n) / 100n;
  function amounts(s, revision, now) {
    let reserved = 0n, pending = BigInt(read().pendingBytes || '0'), active = 0;
    for (const r of db.prepare('SELECT * FROM vpn_grants WHERE reconciled_at IS NULL').all()) {
      // A settings change cannot refund issued bytes. Original billing is encoded
      // by zeroing unbilled direction maxima at reservation time.
      const issued = cost(r.rx_issued, r.tx_issued, 'both', r.overhead);
      pending += issued;
      if (r.closed_at === null && r.expires_at > now && r.revision === revision) {
        active++; reserved += cost(r.rx_max, r.tx_max, 'both', r.overhead) - issued;
      }
    }
    return { reserved, pending, active };
  }
  function health(state, s, now) {
    if (!s.vpnGuard) return 'FT_VPN_DISABLED';
    if (s.vpnDailyBytes === null || s.vpnMonthlyBytes === null) return 'FT_VPN_UNCONFIGURED';
    if (s.vpnMeterSource === 'off') return 'FT_METER_UNCONFIGURED';
    if (!s.vpnScopeVerified) return 'FT_METER_SCOPE';
    if (state.fingerprint && state.fingerprint !== meterFingerprint(s)) return 'FT_METER_CHANGED';
    if (state.fault) return state.fault;
    if (!state.sample) return 'FT_METER_UNAVAILABLE';
    if (!state.known) return 'FT_METER_BASELINE';
    if (state.sample.observedAt > now || now - state.sample.observedAt >= s.vpnStaleSeconds * 1000) return 'FT_METER_STALE';
    const periods = usagePeriods(now, s.vpnTimeZone);
    if (['daily', 'monthly'].some(p => state[p]?.start !== periods[p].start)) return 'FT_METER_STALE';
    return null;
  }
  function view(now = Date.now(), admin = false) {
    const { settings: s, revision } = getSettings(), state = read(), totals = amounts(s, revision, now), periods = usagePeriods(now, s.vpnTimeZone);
    let reason = health(state, s, now);
    const result = { mode: s.vpnProtectionMode, source: s.vpnMeterSource, unit: s.vpnBudgetUnit, timeZone: s.vpnTimeZone, billing: s.vpnBilling,
      observedAt: state.sample?.observedAt ?? null, estimated: true, hardLimitAvailable: false, meterAvailable: !health(state, { ...s, vpnGuard: true, vpnDailyBytes: '0', vpnMonthlyBytes: '0' }, now),
      activeReservations: totals.active, pendingBytes: totals.pending.toString(), reservedBytes: totals.reserved.toString(), warning: false, reason: null, eligibleForControlledTransfer: false };
    for (const period of ['daily', 'monthly']) {
      const known = state.known && state[period]?.start === periods[period].start && state.fingerprint === meterFingerprint(s);
      const used = known ? BigInt(state[period].usedBytes) : null, limit = s[period === 'daily' ? 'vpnDailyBytes' : 'vpnMonthlyBytes'];
      const remaining = used === null || limit === null ? null : BigInt(limit) - BigInt(s.vpnReserveBytes) - used - totals.pending - totals.reserved;
      result[period] = { usedBytes: used?.toString() ?? null, limitBytes: limit, safetyBytes: s.vpnReserveBytes, reservedBytes: totals.reserved.toString(), pendingBytes: totals.pending.toString(),
        remainingBytes: remaining === null ? null : max(0n, remaining).toString(), resetAt: periods[period].resetAt };
      if (remaining !== null && remaining <= 0n) reason ||= period === 'daily' ? 'FT_VPN_DAILY' : 'FT_VPN_MONTHLY';
      if (remaining !== null && limit !== null && remaining * 100n <= BigInt(limit) * BigInt(s.vpnWarningPercent)) result.warning = true;
    }
    reason ||= s.vpnProtectionMode === 'strict' ? 'FT_VPN_HARD_GATE_REQUIRED' : null;
    result.reason = reason; result.eligibleForControlledTransfer = !reason;
    if (admin) { result.revision = revision; result.sourceId = s.vpnSourceId; result.interface = s.vpnInterface;
      result.rawCounter = state.sample?.kind === 'counter' ? { rxBytes: state.sample.rxBytes, txBytes: state.sample.txBytes } : null;
      result.audit = db.prepare('SELECT at,actor,action,details FROM vpn_audit ORDER BY id DESC LIMIT 20').all(); }
    return result;
  }
  function validateSample(sample, s, now) {
    if (!sample || !['counter', 'snapshot'].includes(sample.kind) || sample.sourceId !== s.vpnSourceId || !Number.isSafeInteger(sample.observedAt) || sample.observedAt > now || sample.observedAt <= 0) throw error('FT_METER_INVALID', 422);
    if (now - sample.observedAt >= s.vpnStaleSeconds * 1000) throw error('FT_METER_STALE', 503);
    if (sample.kind === 'counter') {
      if (s.vpnMeterSource !== 'interface' || typeof sample.epoch !== 'string' || !sample.epoch || sample.epoch.length > 200 || Object.keys(sample).sort().join(',') !== 'epoch,kind,observedAt,rxBytes,sourceId,txBytes') throw error('FT_METER_INVALID', 422);
      checkedBytes(sample.rxBytes); checkedBytes(sample.txBytes);
    } else {
      if (s.vpnMeterSource !== 'snapshot' || sample.timeZone !== s.vpnTimeZone || sample.billing !== s.vpnBilling || Object.keys(sample).sort().join(',') !== 'billing,daily,kind,monthly,observedAt,sourceId,timeZone') throw error('FT_METER_INVALID', 422);
      const periods = usagePeriods(sample.observedAt, s.vpnTimeZone);
      for (const p of ['daily', 'monthly']) { if (!sample[p] || Object.keys(sample[p]).sort().join(',') !== 'resetAt,start,usedBytes' || sample[p].start !== periods[p].start || sample[p].resetAt !== periods[p].resetAt) throw error('FT_METER_INVALID', 422); checkedBytes(sample[p].usedBytes); }
      if (BigInt(sample.monthly.usedBytes) < BigInt(sample.daily.usedBytes)) throw error('FT_METER_INVALID', 422);
    }
  }
  function adminCheck(input, actor) {
    const current = getSettings();
    if (!db.prepare('SELECT 1 FROM admin_grants WHERE user_uid=?').get(actor)) throw error('FT_FORBIDDEN', 403);
    if (input?.revision !== current.revision) throw error('FT_CONFLICT');
    return current;
  }
  function prune(now) {
    db.prepare('UPDATE vpn_grants SET closed_at=MIN(expires_at,?) WHERE closed_at IS NULL AND (expires_at<=? OR revision<>?)').run(now, now, getSettings().revision);
    const state = read(); let pending = BigInt(state.pendingBytes || '0'), through = state.pendingThroughAt || 0;
    for (const row of db.prepare('SELECT * FROM vpn_grants WHERE closed_at IS NOT NULL AND reconciled_at IS NULL').all()) {
      pending += cost(row.rx_issued, row.tx_issued, 'both', row.overhead); through = Math.max(through, row.closed_at);
    }
    state.pendingBytes = pending.toString(); state.pendingThroughAt = through; write(state);
    db.exec('DELETE FROM vpn_grants WHERE closed_at IS NOT NULL OR reconciled_at IS NOT NULL');
  }
  function assertLive(row, current, now) {
    if (!row || row.closed_at !== null || row.expires_at <= now || row.revision !== current.revision) throw error('FT_VPN_LEASE', 403);
    const s = current.settings, state = read(); const reason = health(state, s, now);
    if (reason) throw error(reason, 503);
    if (s.vpnProtectionMode !== 'estimate') throw error('FT_VPN_HARD_GATE_REQUIRED', 503);
    const all = amounts(s, current.revision, now);
    for (const p of ['daily', 'monthly']) if (BigInt(state[p].usedBytes) + BigInt(s.vpnReserveBytes) + all.pending + all.reserved > BigInt(s[p === 'daily' ? 'vpnDailyBytes' : 'vpnMonthlyBytes'])) throw error(p === 'daily' ? 'FT_VPN_DAILY' : 'FT_VPN_MONTHLY', 429);
  }
  return {
    view,
    observe(sample, expectedRevision, now = Date.now()) {
      return atomic(() => {
        const { settings: s, revision } = getSettings(); if (revision !== expectedRevision) throw error('FT_CONFLICT');
        validateSample(sample, s, now); const old = read(), fingerprint = meterFingerprint(s);
        if (old.fingerprint === fingerprint && old.sample && sample.observedAt <= old.sample.observedAt) {
          if (JSON.stringify(sample) === JSON.stringify(old.sample)) return view(now, true);
          throw error('FT_METER_INVALID', 422);
        }
        const periods = usagePeriods(sample.observedAt, s.vpnTimeZone), state = { ...old, fingerprint, sample, fault: null };
        if (sample.kind === 'snapshot') {
          state.known = true;
          for (const p of ['daily', 'monthly']) state[p] = { ...periods[p], usedBytes: max(BigInt(sample[p].usedBytes), old[p]?.start === periods[p].start ? BigInt(old[p].usedBytes) : 0n).toString() };
        } else {
          const changed = old.fingerprint && old.fingerprint !== fingerprint;
          const reset = old.sample?.kind === 'counter' && (old.sample.epoch !== sample.epoch || BigInt(sample.rxBytes) < BigInt(old.sample.rxBytes) || BigInt(sample.txBytes) < BigInt(old.sample.txBytes));
          if (changed || reset || ['FT_METER_RESET', 'FT_METER_CHANGED'].includes(old.fault)) { state.known = false; state.fault = changed ? 'FT_METER_CHANGED' : 'FT_METER_RESET'; }
          else if (!old.sample || !old.known) state.known = false;
          else {
            const delta = billedBytes(BigInt(sample.rxBytes) - BigInt(old.sample.rxBytes), BigInt(sample.txBytes) - BigInt(old.sample.txBytes), s.vpnBilling);
            for (const p of ['daily', 'monthly']) state[p] = { ...periods[p], usedBytes: ((old[p].start === periods[p].start ? BigInt(old[p].usedBytes) : 0n) + delta).toString() };
          }
        }
        write(state);
        const totals = amounts(s, revision, now);
        const overdrawn = ['daily', 'monthly'].some(p => state[p] && s[p === 'daily' ? 'vpnDailyBytes' : 'vpnMonthlyBytes'] !== null &&
          BigInt(state[p].usedBytes) + BigInt(s.vpnReserveBytes) + totals.pending + totals.reserved > BigInt(s[p === 'daily' ? 'vpnDailyBytes' : 'vpnMonthlyBytes']));
        // Zero free bytes blocks NEW reservations, but a fully funded existing
        // window remains valid. Only a fault or actual overdraw revokes it.
        if (health(state, s, now) || overdrawn) db.prepare('UPDATE vpn_grants SET closed_at=? WHERE closed_at IS NULL').run(now);
        prune(now); return view(now, true);
      });
    },
    fail(code = 'FT_METER_UNAVAILABLE', now = Date.now()) {
      return atomic(() => { const state = read(); if (!['FT_METER_RESET', 'FT_METER_CHANGED'].includes(state.fault)) state.fault = code; write(state); db.prepare('UPDATE vpn_grants SET closed_at=? WHERE closed_at IS NULL').run(now); prune(now); });
    },
    calibrate(input, actor, now = Date.now()) {
      return atomic(() => {
        const { settings: s } = adminCheck(input, actor);
        if (Object.keys(input).sort().join(',') !== 'dailyBytes,monthlyBytes,revision' || s.vpnMeterSource !== 'interface') throw error('FT_METER_INVALID', 422);
        checkedBytes(input.dailyBytes); checkedBytes(input.monthlyBytes); if (BigInt(input.dailyBytes) > BigInt(input.monthlyBytes)) throw error('FT_METER_INVALID', 422);
        const state = read();
        if (state.sample?.kind !== 'counter' || state.fingerprint !== meterFingerprint(s) || now - state.sample.observedAt >= s.vpnStaleSeconds * 1000 || state.sample.observedAt > now) throw error('FT_METER_STALE', 503);
        const periods = usagePeriods(state.sample.observedAt, s.vpnTimeZone);
        if (usagePeriods(now, s.vpnTimeZone).daily.start !== periods.daily.start) throw error('FT_METER_STALE', 503);
        for (const p of ['daily', 'monthly']) state[p] = { ...periods[p], usedBytes: max(BigInt(input[p + 'Bytes']), state[p]?.start === periods[p].start ? BigInt(state[p].usedBytes) : 0n).toString() };
        state.known = true; state.fault = null; write(state); db.prepare('UPDATE vpn_grants SET closed_at=? WHERE closed_at IS NULL').run(now); prune(now); audit(actor, 'calibrate', { dailyBytes: state.daily.usedBytes, monthlyBytes: state.monthly.usedBytes }, now); return view(now, true);
      });
    },
    reconcile(input, actor, now = Date.now()) {
      return atomic(() => {
        const { settings: s, revision } = adminCheck(input, actor), state = read();
        if (Object.keys(input).sort().join(',') !== 'confirm,observedAt,revision' || input.confirm !== true || health(state, s, now) || state.sample.observedAt !== input.observedAt) throw error('FT_VPN_RECONCILE');
        prune(now); const totals = amounts(s, revision, now);
        const last = Math.max(read().pendingThroughAt || 0, db.prepare('SELECT MAX(COALESCE(closed_at,expires_at)) AS at FROM vpn_grants WHERE reconciled_at IS NULL').get().at || 0);
        if (totals.active || (last && state.sample.observedAt < last + s.vpnStaleSeconds * 1000)) throw error('FT_VPN_RECONCILE');
        db.prepare('UPDATE vpn_grants SET reconciled_at=? WHERE reconciled_at IS NULL').run(now);
        write({ ...read(), pendingBytes: '0', pendingThroughAt: 0 });
        audit(actor, 'reconcile-confirmed', { pendingBytes: totals.pending.toString(), observedAt: input.observedAt }, now); return view(now, true);
      });
    },
    reserve({ rxBytes, txBytes, path = 'unknown' }, now = Date.now()) {
      byteCount(rxBytes); byteCount(txBytes);
      if (BigInt(rxBytes) + BigInt(txBytes) > BigInt(VPN_WINDOW_BYTES) || BigInt(rxBytes) + BigInt(txBytes) === 0n) throw error('FT_VPN_LEASE', 422);
      return atomic(() => {
        const { settings: s, revision } = getSettings(); prune(now);
        if (!['confirmed-vpn', 'unknown'].includes(path) || (path === 'unknown' && s.vpnUnknownPath !== 'meter')) throw error('FT_VPN_PATH_UNKNOWN', 403);
        const status = view(now); if (status.reason) throw error(status.reason, 503);
        const rx = s.vpnBilling === 'outbound' ? '0' : rxBytes, tx = s.vpnBilling === 'inbound' ? '0' : txBytes;
        const bytes = cost(rx, tx, 'both', s.vpnOverheadPercent);
        for (const p of ['daily', 'monthly']) if (bytes > BigInt(status[p].remainingBytes)) throw error(p === 'daily' ? 'FT_VPN_DAILY' : 'FT_VPN_MONTHLY', 429);
        if (db.prepare('SELECT COUNT(*) AS n FROM vpn_grants WHERE reconciled_at IS NULL').get().n >= 10000) throw error('FT_VPN_RECONCILE', 503);
        const token = randomBytes(32).toString('base64url'), expiresAt = Math.min(now + VPN_WINDOW_MS, status.daily.resetAt, status.monthly.resetAt, status.observedAt + s.vpnStaleSeconds * 1000);
        db.prepare("INSERT INTO vpn_grants VALUES(?,?,?,?,?,?,?,'0','0',0,NULL,NULL)").run(hash(token), revision, now, expiresAt, rx, tx, s.vpnOverheadPercent);
        return { token, expiresAt, rxBytes: rx, txBytes: tx, reservedBytes: bytes.toString() };
      });
    },
    spend(token, { sequence, rxBytes, txBytes }, now = Date.now()) {
      byteCount(rxBytes); byteCount(txBytes);
      return atomic(() => {
        const current = getSettings(), row = db.prepare('SELECT * FROM vpn_grants WHERE token_hash=?').get(hash(token)); assertLive(row, current, now);
        const rx = current.settings.vpnBilling === 'outbound' ? '0' : rxBytes, tx = current.settings.vpnBilling === 'inbound' ? '0' : txBytes;
        if (sequence === row.sequence && rx === row.rx_issued && tx === row.tx_issued) return;
        if (!Number.isSafeInteger(sequence) || sequence !== row.sequence + 1 || BigInt(rx) < BigInt(row.rx_issued) || BigInt(tx) < BigInt(row.tx_issued) || BigInt(rx) > BigInt(row.rx_max) || BigInt(tx) > BigInt(row.tx_max)) throw error('FT_VPN_LEASE', 422);
        db.prepare('UPDATE vpn_grants SET rx_issued=?,tx_issued=?,sequence=? WHERE token_hash=?').run(rx, tx, sequence, hash(token));
      });
    },
    assertGrant(token, now = Date.now()) { assertLive(db.prepare('SELECT * FROM vpn_grants WHERE token_hash=?').get(hash(token)), getSettings(), now); },
    finish(token, now = Date.now()) { db.prepare('UPDATE vpn_grants SET closed_at=? WHERE token_hash=? AND closed_at IS NULL').run(now, hash(token)); },
  };
}
