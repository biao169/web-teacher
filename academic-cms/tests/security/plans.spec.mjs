import test from 'node:test'
import assert from 'node:assert/strict'
import { createSecurityHarness } from '../helpers/offline-security.mjs'

function detail(db, sql, ...params) {
  return db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...params).map(row => String(row.detail)).join(' | ')
}

test('authentication hot-path query plans use token, username and expiry indexes', () => {
  const harness = createSecurityHarness()
  try {
    assert.match(detail(harness.db, 'SELECT * FROM auth_sessions WHERE token_hash=?', 'a'.repeat(64)), /idx_auth_sessions_token_hash/)
    assert.match(detail(harness.db, 'SELECT * FROM auth_users WHERE username=? COLLATE NOCASE', 'administrator'), /(?:idx|ux)_auth_users_username_nocase/)
    assert.match(detail(harness.db, 'SELECT * FROM auth_login_throttles WHERE expires_at <= ?', '2026-08-29T00:00:00.000Z'), /idx_auth_login_throttles_expiry/)
    assert.match(detail(harness.db, 'SELECT * FROM auth_sessions WHERE user_uid=? AND revoked_at IS NULL ORDER BY created_at DESC,id DESC', 'user:test'), /idx_auth_sessions_user_active/)
    assert.match(detail(harness.db, 'SELECT * FROM auth_sessions WHERE revoked_at IS NOT NULL AND revoked_at <= ?', '2026-08-29T00:00:00.000Z'), /idx_auth_sessions_revoked/)
  }
  finally { harness.close() }
})
