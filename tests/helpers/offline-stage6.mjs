import { createHash } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { applyMigrations, loadMigrations } from '../../scripts/db/migrations.mjs'

export const root = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const output = process.env.STAGE6_CORE_OUTPUT || resolve(root, '.tmp/stage6-core')
const require = createRequire(import.meta.url)
export const loadStage6 = name => require(resolve(output, name))
export const core = Object.freeze({
  ...loadStage6('db/adapters/sqlite.js'), ...loadStage6('db/adapters/d1.js'), ...loadStage6('db/query.js'),
  ...loadStage6('db/seeds/sample-data.js'),
  ...loadStage6('server/security/password.js'), ...loadStage6('server/security/password-policy.js'), ...loadStage6('server/security/tokens.js'),
  ...loadStage6('server/security/errors.js'),
  ...loadStage6('server/services/auth/auth-store.js'), ...loadStage6('server/services/auth/session-service.js'),
  ...loadStage6('server/services/auth/registration-service.js'), ...loadStage6('server/services/auth/account-service.js'),
  ...loadStage6('server/services/interactions/settings-store.js'), ...loadStage6('server/services/interactions/action-throttle-store.js'),
  ...loadStage6('server/services/interactions/action-throttle-service.js'),
  ...loadStage6('server/services/contact/contact-store.js'), ...loadStage6('server/services/contact/contact-service.js'),
  ...loadStage6('server/interactions/errors.js'), ...loadStage6('server/i18n/source-ref.js'), ...loadStage6('server/i18n/fingerprint.js'),
  ...loadStage6('shared/enums/auth.js'), ...loadStage6('shared/utils/redirect.js'),
})
export const migrations = await loadMigrations(resolve(root, 'migrations'))

class D1ProtocolDouble {
  constructor(db) { this.db = db }
  prepare(sql) {
    const db = this.db
    const build = params => {
      const execute = () => {
        const statement = db.prepare(sql)
        const rows = statement.all(...params)
        const readOnly = /^\s*(SELECT|WITH|EXPLAIN|PRAGMA)\b/iu.test(sql)
        const meta = db.prepare('SELECT changes() changes, last_insert_rowid() last_row_id').get()
        return { success: true, results: rows, meta: { changes: readOnly ? 0 : Number(meta.changes), last_row_id: Number(meta.last_row_id) } }
      }
      return { bind: (...values) => build(values), all: async () => execute(), run: async () => execute(), _execute: execute }
    }
    return build([])
  }
  async batch(statements) {
    try {
      this.db.exec('BEGIN IMMEDIATE')
      const results = statements.map(statement => statement._execute())
      this.db.exec('COMMIT')
      return results
    }
    catch (error) {
      if (this.db.isTransaction) this.db.exec('ROLLBACK')
      throw new Error(`D1_ERROR: ${error.message}`, { cause: error })
    }
  }
}
function syncConnection(db) {
  return { prepare: sql => db.prepare(sql), exec: sql => db.exec(sql), get inTransaction() { return db.isTransaction } }
}
export function createHarness(kind = 'sqlite') {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys=ON')
  const connection = syncConnection(db)
  applyMigrations(connection, migrations)
  const adapter = kind === 'sqlite' ? new core.SqliteAdapter(connection) : new core.D1Adapter(new D1ProtocolDouble(db))
  return { db, adapter, kind, close() { db.close() } }
}

export class TestPbkdf2Engine {
  async derive(password, salt, iterations, bytes) {
    const chunks = []; let counter = 0
    while (Buffer.concat(chunks).length < bytes) chunks.push(createHash('sha256').update(password).update(salt).update(String(iterations)).update(String(counter++)).digest())
    return new Uint8Array(Buffer.concat(chunks).subarray(0, bytes))
  }
}
export function clock(initial = '2026-08-29T10:00:00.000Z') {
  let time = Date.parse(initial)
  return { now: () => new Date(time), advance(ms) { time += ms }, iso: () => new Date(time).toISOString() }
}
export function ids() { let i = 0; return prefix => `${prefix}:stage6-${String(++i).padStart(4, '0')}` }

export async function seedHarness(h, password = 'Demo stage six passphrase 2026!') {
  const passwords = new core.PasswordService(new TestPbkdf2Engine())
  const passwordHash = await passwords.hash(password)
  const result = await core.applySampleSeed(h.adapter, { passwordHash, seededAt: new Date('2026-08-29T00:00:00.000Z') })
  return { result, passwords, password }
}

export function createInteractionServices(h, passwords, options = {}) {
  const time = options.clock ?? clock()
  const idFactory = options.idFactory ?? ids()
  const tokens = new core.AuthTokenService('stage6-auth-secret-with-at-least-thirty-two-bytes')
  const authStore = new core.AuthStore(h.adapter)
  const sessions = new core.SessionService(authStore, tokens, { clock: time.now, idFactory, sessionPolicy: { idleSeconds: 900, absoluteSeconds: 7200, touchSeconds: 60 } })
  const settings = new core.InteractionSettingsStore(h.adapter)
  const throttleStore = new core.PublicActionThrottleStore(h.adapter)
  const registrationThrottle = new core.PublicActionThrottleService(throttleStore, tokens, { windowSeconds: 3600, blockSeconds: 3600, identityLimit: options.registrationLimit ?? 3, networkLimit: 10, retentionSeconds: 86400 }, time.now)
  const contactThrottle = new core.PublicActionThrottleService(throttleStore, tokens, { windowSeconds: 900, blockSeconds: 900, identityLimit: options.contactLimit ?? 4, networkLimit: 12, retentionSeconds: 86400 }, time.now)
  const registration = new core.RegistrationService(authStore, settings, registrationThrottle, passwords, { clock: time.now, idFactory })
  const account = new core.AccountService(authStore, passwords, sessions, { clock: time.now, idFactory })
  const contact = new core.ContactService(new core.ContactStore(h.adapter), settings, contactThrottle, { clock: time.now, idFactory: () => `message:stage6-${String(Math.floor(Math.random()*1e12)).padStart(12,'0')}` })
  return { time, tokens, authStore, sessions, settings, registration, account, contact }
}
