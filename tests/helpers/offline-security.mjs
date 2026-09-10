import { createHash } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { applyMigrations, loadMigrations } from '../../scripts/db/migrations.mjs'

export const root = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const require = createRequire(import.meta.url)
export const loadSecurity = name => require(resolve(root, '.tmp/security-core', name))

export const core = {
  ...loadSecurity('db/adapters/sqlite.js'),
  ...loadSecurity('db/adapters/d1.js'),
  ...loadSecurity('server/security/errors.js'),
  ...loadSecurity('server/security/body.js'),
  ...loadSecurity('server/security/bytes.js'),
  ...loadSecurity('server/security/password.js'),
  ...loadSecurity('server/security/password-policy.js'),
  ...loadSecurity('server/security/tokens.js'),
  ...loadSecurity('server/security/config.js'),
  ...loadSecurity('server/security/cookies.js'),
  ...loadSecurity('server/security/origin.js'),
  ...loadSecurity('server/security/request-protection.js'),
  ...loadSecurity('server/security/headers.js'),
  ...loadSecurity('server/security/permissions.js'),
  ...loadSecurity('server/security/visibility.js'),
  ...loadSecurity('server/security/session-policy.js'),
  ...loadSecurity('server/audit/sanitize.js'),
  ...loadSecurity('server/audit/commands.js'),
  ...loadSecurity('server/services/auth/auth-store.js'),
  ...loadSecurity('server/services/auth/authentication-service.js'),
  ...loadSecurity('server/services/auth/bootstrap-service.js'),
  ...loadSecurity('server/services/auth/session-service.js'),
  ...loadSecurity('server/services/auth/throttle-service.js'),
  ...loadSecurity('shared/enums/auth.js'),
  ...loadSecurity('shared/utils/unicode.js'),
}

export const migrations = await loadMigrations(resolve(root, 'migrations'))

/** Real SQLite storage behind a D1-shaped protocol test double, not workerd. */
export class D1ProtocolDouble {
  constructor(db) { this.db = db }
  prepare(sql) {
    const db = this.db
    const build = params => {
      const execute = () => {
        const statement = db.prepare(sql)
        const rows = statement.all(...params)
        const readOnly = /^\s*(SELECT|WITH|EXPLAIN|PRAGMA)\b/i.test(sql)
        const meta = db.prepare('SELECT changes() changes, last_insert_rowid() last_row_id').get()
        return { success: true, results: rows, meta: { changes: readOnly ? 0 : Number(meta.changes), last_row_id: Number(meta.last_row_id) } }
      }
      return {
        bind: (...values) => build(values),
        all: async () => execute(),
        run: async () => execute(),
        _execute: execute,
      }
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

export function syncConnection(db) {
  return {
    prepare: sql => db.prepare(sql),
    exec: sql => db.exec(sql),
    get inTransaction() { return db.isTransaction },
  }
}

export function createSecurityHarness(kind = 'sqlite') {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  const connection = syncConnection(db)
  applyMigrations(connection, migrations)
  const adapter = kind === 'sqlite'
    ? new core.SqliteAdapter(connection)
    : new core.D1Adapter(new D1ProtocolDouble(db))
  return { db, connection, adapter, kind, close() { db.close() } }
}

/** Fast deterministic PBKDF2-shaped engine for service contract tests only. */
export class TestPbkdf2Engine {
  calls = []
  async derive(password, salt, iterations, bytes) {
    this.calls.push({ password: Buffer.from(password), salt: Buffer.from(salt), iterations, bytes })
    const chunks = []
    let counter = 0
    while (Buffer.concat(chunks).length < bytes) {
      chunks.push(createHash('sha256').update(password).update(salt).update(String(iterations)).update(String(counter++)).digest())
    }
    return new Uint8Array(Buffer.concat(chunks).subarray(0, bytes))
  }
}

export function adjustableClock(iso = '2026-08-29T00:00:00.000Z') {
  let time = Date.parse(iso)
  return {
    now: () => new Date(time),
    advance(seconds) { time += seconds * 1000 },
    set(value) { time = Date.parse(value) },
    iso: () => new Date(time).toISOString(),
  }
}

export function sequentialIds() {
  let value = 0
  return prefix => `${prefix}:test-${String(++value).padStart(4, '0')}`
}

export function createServices(harness, options = {}) {
  const clock = options.clock ?? adjustableClock()
  const engine = options.engine ?? new TestPbkdf2Engine()
  const passwords = new core.PasswordService(engine)
  const tokens = new core.AuthTokenService(options.secret ?? 'stage2-test-auth-secret-with-at-least-thirty-two-bytes')
  const store = new core.AuthStore(harness.adapter)
  const ids = options.idFactory ?? sequentialIds()
  const sessionPolicy = options.sessionPolicy ?? { idleSeconds: 600, absoluteSeconds: 3600, touchSeconds: 60 }
  const sessions = new core.SessionService(store, tokens, { clock: clock.now, sessionPolicy, idFactory: ids })
  const throttle = new core.LoginThrottleService(store, tokens, {
    windowSeconds: 300,
    blockSeconds: 300,
    accountFailures: options.accountFailures ?? 2,
    networkFailures: options.networkFailures ?? 5,
    retentionSeconds: 3600,
  }, clock.now)
  const auth = new core.AuthenticationService(store, passwords, sessions, throttle)
  const bootstrap = new core.BootstrapService(store, passwords, tokens, {
    clock: clock.now,
    idFactory: ids,
    ...(options.passwordBlocklist ? { passwordBlocklist: options.passwordBlocklist } : {}),
  })
  return { clock, engine, passwords, tokens, store, sessions, throttle, auth, bootstrap, ids }
}

export async function bootstrapAdmin(services, overrides = {}) {
  return services.bootstrap.createInitialAdministrator({
    username: overrides.username ?? 'administrator',
    password: overrides.password ?? 'A genuinely long passphrase 2026!',
    displayName: overrides.displayName ?? 'Site Administrator',
    email: overrides.email ?? 'admin@example.edu',
    presentedToken: overrides.presentedToken ?? 'stage2-bootstrap-token-with-at-least-thirty-two-bytes',
    expectedToken: overrides.expectedToken ?? 'stage2-bootstrap-token-with-at-least-thirty-two-bytes',
    requestId: overrides.requestId ?? 'request-bootstrap-1',
  })
}

// Compatibility aliases used by the stage-2 acceptance suites.
export const security = core

export function mutableClock(initial = '2026-08-29T00:00:00.000Z') {
  let time = Date.parse(initial)
  return {
    now: () => new Date(time),
    set(value) { time = Date.parse(value) },
    advance(milliseconds) { time += milliseconds },
  }
}

export function createAuthHarness(kind = 'sqlite', options = {}) {
  const harness = createSecurityHarness(kind)
  const clock = options.clock ?? mutableClock()
  const engine = options.engine ?? new TestPbkdf2Engine()
  const secret = options.secret ?? 'stage2-auth-secret-with-more-than-32-bytes-2026'
  const token = options.bootstrapToken ?? 'stage2-bootstrap-token-with-more-than-32-bytes-2026'
  const ids = { user: 0, session: 0, audit: 0 }
  const idFactory = prefix => `${prefix}:test-${++ids[prefix]}`
  const passwords = new core.PasswordService(engine)
  const tokens = new core.AuthTokenService(secret)
  const store = new core.AuthStore(harness.adapter)
  const sessions = new core.SessionService(store, tokens, {
    clock: clock.now,
    sessionPolicy: options.sessionPolicy ?? { idleSeconds: 1800, absoluteSeconds: 28800, touchSeconds: 300 },
    idFactory,
  })
  const throttle = new core.LoginThrottleService(store, tokens, {
    windowSeconds: 900,
    blockSeconds: 900,
    accountFailures: 5,
    networkFailures: 30,
    retentionSeconds: 86400,
  }, clock.now)
  const authentication = new core.AuthenticationService(store, passwords, sessions, throttle)
  const bootstrap = new core.BootstrapService(store, passwords, tokens, { clock: clock.now, idFactory })
  return {
    ...harness,
    clock,
    engine,
    secret,
    bootstrapToken: token,
    store,
    tokens,
    passwords,
    sessions,
    throttle,
    authentication,
    bootstrap,
    async createAdmin(overrides = {}) {
      return bootstrap.createInitialAdministrator({
        username: 'root-admin',
        password: 'Tideglass!Orbit!Cedar!2026',
        displayName: 'Root Administrator',
        email: 'root@example.test',
        presentedToken: token,
        expectedToken: token,
        requestId: 'request-bootstrap',
        ...overrides,
      })
    },
  }
}
