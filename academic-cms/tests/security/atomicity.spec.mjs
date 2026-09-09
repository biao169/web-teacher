import test from 'node:test'
import assert from 'node:assert/strict'
import { bootstrapAdmin, createSecurityHarness, createServices } from '../helpers/offline-security.mjs'

for (const kind of ['sqlite', 'd1']) {
  test(`${kind}: concurrent bootstrap attempts produce exactly one administrator`, async () => {
    const harness = createSecurityHarness(kind)
    try {
      const first = createServices(harness)
      const second = createServices(harness)
      const results = await Promise.allSettled([
        bootstrapAdmin(first, { username: 'adminone', email: 'one@example.edu' }),
        bootstrapAdmin(second, { username: 'admintwo', email: 'two@example.edu' }),
      ])
      assert.equal(results.filter(result => result.status === 'fulfilled').length, 1)
      assert.equal(results.filter(result => result.status === 'rejected').length, 1)
      assert.equal(harness.db.prepare('SELECT count(*) total FROM auth_users').get().total, 1)
      assert.equal(harness.db.prepare('SELECT count(*) total FROM auth_bootstrap_state').get().total, 1)
      assert.equal(harness.db.prepare('SELECT count(*) total FROM auth_permissions').get().total, 19)
    }
    finally { harness.close() }
  })

  test(`${kind}: a pre-existing matching bootstrap marker cannot authorize partial initialization`, async () => {
    const harness = createSecurityHarness(kind)
    try {
      const at = '2026-08-29T00:00:00.000Z'
      const userUid = 'user:preseeded-collision'
      harness.db.prepare('INSERT INTO auth_bootstrap_state(id,completed_at,user_uid) VALUES(1,?,?)').run(at, userUid)
      const services = createServices(harness)
      await assert.rejects(() => services.store.bootstrapAdmin({
        userUid,
        username: 'collision-admin',
        passwordHash: 'must-not-be-inserted',
        displayName: 'Collision Admin',
        email: 'collision@example.edu',
        at,
        audit: {
          uid: 'audit:preseeded-collision',
          at,
          actor: { uid: userUid, name: 'Collision Admin' },
          action: 'bootstrap',
          module: 'auth',
          targetUid: userUid,
          summary: 'Must not commit',
          detail: { request_id: 'preseeded-collision' },
          status: 'success',
        },
      }), error => error.code === 'AUTH_CONFLICT')
      assert.equal(harness.db.prepare('SELECT count(*) total FROM auth_bootstrap_state').get().total, 1)
      assert.equal(harness.db.prepare('SELECT count(*) total FROM auth_roles').get().total, 0)
      assert.equal(harness.db.prepare('SELECT count(*) total FROM auth_users').get().total, 0)
      assert.equal(harness.db.prepare('SELECT count(*) total FROM auth_permissions').get().total, 0)
      assert.equal(harness.db.prepare('SELECT count(*) total FROM operation_logs').get().total, 0)
    }
    finally { harness.close() }
  })

  test(`${kind}: a late audit conflict rolls back bootstrap state, role, user and permissions`, async () => {
    const harness = createSecurityHarness(kind)
    try {
      const at = '2026-08-29T00:00:00.000Z'
      harness.db.prepare(`INSERT INTO operation_logs(uid,created_at,updated_at,action,module,detail_json,status)
        VALUES(?,?,?,?,?,?,?)`).run('audit:fixed', at, at, 'fixture', 'auth', '{}', 'success')
      let sequence = 0
      const services = createServices(harness, {
        idFactory(prefix) {
          if (prefix === 'audit') return 'audit:fixed'
          sequence += 1
          return `${prefix}:rollback-${sequence}`
        },
      })
      await assert.rejects(bootstrapAdmin(services), error => ['AUTH_CONFLICT', 'DB_UNIQUE', 'DB_UNKNOWN'].includes(error.code))
      assert.equal(harness.db.prepare('SELECT count(*) total FROM auth_bootstrap_state').get().total, 0)
      assert.equal(harness.db.prepare('SELECT count(*) total FROM auth_roles').get().total, 0)
      assert.equal(harness.db.prepare('SELECT count(*) total FROM auth_users').get().total, 0)
      assert.equal(harness.db.prepare('SELECT count(*) total FROM auth_permissions').get().total, 0)
      assert.equal(harness.db.prepare('SELECT count(*) total FROM operation_logs').get().total, 1)
    }
    finally { harness.close() }
  })

  test(`${kind}: an audit conflict prevents session revocation in the same atomic batch`, async () => {
    const harness = createSecurityHarness(kind)
    try {
      const services = createServices(harness)
      await bootstrapAdmin(services, { username: 'root-admin', password: 'A genuinely long passphrase 2026!' })
      const created = await services.auth.login({
        username: 'root-admin',
        password: 'A genuinely long passphrase 2026!',
        network: null,
        requestId: 'revoke-audit-login',
      })
      const at = '2026-08-29T00:10:00.000Z'
      harness.db.prepare(`INSERT INTO operation_logs(uid,created_at,updated_at,action,module,detail_json,status)
        VALUES(?,?,?,?,?,?,?)`).run('audit:revoke-conflict', at, at, 'fixture', 'auth', '{}', 'success')

      await assert.rejects(() => services.store.revokeSessionByHash(created.sessionHash, at, 'logout', {
        uid: 'audit:revoke-conflict',
        at,
        actor: { uid: null, name: null },
        action: 'logout',
        module: 'auth',
        targetUid: null,
        summary: 'Must roll back',
        detail: { request_id: 'revoke-audit-conflict' },
        status: 'success',
      }))

      const stored = harness.db.prepare('SELECT revoked_at,revoke_reason FROM auth_sessions WHERE token_hash=?').get(created.sessionHash)
      assert.equal(stored.revoked_at, null)
      assert.equal(stored.revoke_reason, null)
    }
    finally { harness.close() }
  })

}
