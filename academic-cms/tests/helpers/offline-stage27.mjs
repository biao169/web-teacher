import { DatabaseSync } from 'node:sqlite'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { applyMigrations, loadMigrations } from '../../scripts/db/migrations.mjs'

export const root = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const output = process.env.STAGE27_CORE_OUTPUT || resolve(root, '.tmp/stage27-core')
const require = createRequire(import.meta.url)
export const loadStage27 = name => require(resolve(output, name))
export const core = Object.freeze({
  ...loadStage27('db/adapters/sqlite.js'),
  ...loadStage27('db/adapters/d1.js'),
  ...loadStage27('shared/enums/auth.js'),
  ...loadStage27('shared/admin/content-modules.js'),
  ...loadStage27('shared/admin/registry.js'),
  ...loadStage27('server/security/permissions.js'),
  ...loadStage27('server/services/admin/content-errors.js'),
  ...loadStage27('server/services/admin/content-query.js'),
  ...loadStage27('server/services/admin/content-validation.js'),
  ...loadStage27('server/services/admin/content-store.js'),
  ...loadStage27('server/services/admin/content-service.js'),
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
      throw error
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

export function principal(overrides = {}) {
  const permissions = {}
  for (const module of core.AUTH_MODULES) permissions[module] = Object.freeze({ view: true, create: true, edit: true, delete: true, export: true })
  return Object.freeze({
    sessionUid: 'session:stage27', userUid: 'user:stage27', username: 'admin', displayName: '阶段 27 管理员', email: 'admin@example.invalid',
    roleUid: 'role:admin', roleName: '管理员', roleLevel: 100, roleIsSystem: true,
    visibilityScopes: new Set(['public', 'authenticated', 'staff', 'owner', 'hidden']), permissions: Object.freeze(permissions), mustChangePassword: false,
    ...overrides,
  })
}

export function insertFixtures(db) {
  const at = '2026-09-01T00:00:00.000Z'
  const insert = (sql, ...params) => db.prepare(sql).run(...params)
  insert(`INSERT INTO profiles (uid,created_at,updated_at,name,role,organization,contact_visibility,visibility,is_active,is_featured,sort_order)
    VALUES ('profiles:alpha',?,?,?,?,?,'hidden','public',1,1,1)`, at, at, '张明', '教师', '示例大学')
  insert(`INSERT INTO profiles (uid,created_at,updated_at,name,role,organization,contact_visibility,visibility,is_active,is_featured,sort_order)
    VALUES ('profiles:beta',?,?,?,?,?,'hidden','hidden',1,0,2)`, at, at, '李华', '研究人员', '示例大学')
  insert(`INSERT INTO publications (uid,created_at,updated_at,title,authors,venue,year,doi,pdf_visibility,visibility,is_featured,sort_order)
    VALUES ('publications:alpha',?,?,?,?,?,?,?,'hidden','public',1,1)`, at, at, '边缘一致性协议', '张明; 李华', '系统学报', 2026, '10.1234/example.1')
  insert(`INSERT INTO projects (uid,created_at,updated_at,name,source,project_role,start_date,end_date,status,amount,visibility,is_featured,sort_order)
    VALUES ('projects:alpha',?,?,?,?,?,?,?,?,?,'public',1,1)`, at, at, '可靠系统项目', '国家自然科学基金', '主持', '2025-01-01', '2028-12-31', '在研', '1200000.50')
  insert(`INSERT INTO messages (uid,created_at,updated_at,name,email,message_type,subject,content,status,visibility)
    VALUES ('messages:alpha',?,?,?,?,?,?,?,'new','hidden')`, at, at, '访问者', 'visitor@example.invalid', 'collaboration', '合作咨询', '希望开展合作。')
  return at
}
