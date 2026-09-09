import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import Database from 'better-sqlite3'
import { applyMigrations, loadMigrations } from '../../scripts/db/migrations.mjs'
import { RESOURCE_CATALOG } from '../../shared/complete-admin/core.mjs'

const root = resolve(import.meta.dirname, '../..')
const source = path => readFileSync(resolve(root, path), 'utf8')

test('账号权限页面挂载专用完整工作台', () => {
  const page = source('app/pages/admin/auth/index.vue')
  const workspace = source('app/components/admin/complete/AdminCompleteAuthWorkspace.vue')
  assert.match(page, /<AdminCompleteAuthWorkspace\s*\/>/u)
  assert.doesNotMatch(page, /useAdminDashboard/u)
  for (const feature of ['新建用户', '重置密码', '删除角色', '权限矩阵', '撤销全部', '未保存修改']) assert.match(workspace, new RegExp(feature, 'u'))
})

test('账号权限服务复用规范枚举、密码核心并使用合法会话撤销原因', () => {
  const service = source('server/services/complete-admin/auth-service.ts')
  const password = source('server/services/complete-admin/password-bridge.ts')
  assert.match(service, /AUTH_MODULES/u)
  assert.doesNotMatch(service, /const MODULES =/u)
  for (const reason of ['user_disabled', 'role_disabled', 'password_changed', 'admin_revoked', 'security_policy']) assert.match(service, new RegExp(reason, 'u'))
  assert.ok((service.match(/revoke_reason/g) ?? []).length >= 4)
  assert.doesNotMatch(service, /account_changed|password_reset|permissions_changed/u)
  assert.match(password, /validateNewPassword/u)
  assert.match(password, /new PasswordService\(\)\.hash/u)
})

test('所有账号权限写入旁路均被收口到专用接口', () => {
  for (const key of ['users', 'roles', 'permissions']) {
    assert.equal(Object.hasOwn(RESOURCE_CATALOG, key), false, key)
  }
  for (const route of [
    'server/api/v1/admin/complete/auth/roles/[uid].delete.ts',
    'server/api/v1/admin/complete/auth/users/[uid]/sessions.get.ts',
    'server/api/v1/admin/complete/auth/users/[uid]/sessions.post.ts',
  ]) assert.doesNotThrow(() => source(route))
})

test('服务端保护系统角色、当前角色、层级、权限升级和最后系统管理员', () => {
  const service = source('server/services/complete-admin/auth-service.ts')
  for (const guard of [
    'SYSTEM_ROLE_PROTECTED', 'SYSTEM_ADMIN_TARGET_PROTECTED', 'CURRENT_ROLE_PROTECTED',
    'SELF_PRIVILEGE_CHANGE_FORBIDDEN', 'SELF_PASSWORD_RESET_FORBIDDEN',
    'ROLE_LEVEL_FORBIDDEN', 'PERMISSION_ESCALATION_FORBIDDEN', 'LAST_SYSTEM_ADMIN_REQUIRED',
    'PERMISSION_REQUIRES_VIEW', 'EDIT_CONFLICT',
  ]) assert.match(service, new RegExp(guard, 'u'))
  assert.doesNotMatch(service.match(/async sessions[\s\S]*?async revokeSessions/u)?.[0] ?? '', /token_hash|password_hash/u)
})

test('0009 升级迁移会映射旧模块名、清理未知模块并撤销受影响会话', async () => {
  const migrations = await loadMigrations(resolve(root, 'migrations'))
  const upgradeIndex = migrations.findIndex(item => item.name === '0009_auth_management_integrity.sql')
  assert.equal(upgradeIndex, 8)
  const db = new Database(':memory:')
  try {
    applyMigrations(db, migrations.slice(0, upgradeIndex))
    const created = '2026-01-01T00:00:00.000Z'
    db.prepare(`INSERT INTO auth_roles (uid,name,level,description,visibility_scopes,is_system,is_active,sort_order,created_at,updated_at) VALUES ('role:legacy','Legacy',20,NULL,'["public"]',0,1,0,?,?)`).run(created, created)
    db.prepare(`INSERT INTO auth_users (uid,username,password_hash,display_name,email,role_uid,status,must_change_password,last_login_at,visibility,created_at,updated_at) VALUES ('user:legacy','legacy','hash','Legacy',NULL,'role:legacy','active',0,NULL,'hidden',?,?)`).run(created, created)
    const insertPermission = db.prepare(`INSERT INTO auth_permissions (uid,role_uid,module,can_view,can_create,can_edit,can_delete,can_export,sort_order,created_at,updated_at) VALUES (?, 'role:legacy', ?, 1,0,0,0,0,0,?,?)`)
    for (const module of ['navigation', 'media', 'translation', 'rogue']) insertPermission.run(`permission:${module}`, module, created, created)
    db.prepare(`INSERT INTO auth_sessions (uid,user_uid,token_hash,created_at,updated_at,last_seen_at,idle_expires_at,expires_at,revoked_at,revoke_reason,user_agent_hash) VALUES ('session:legacy','user:legacy',?, ?, ?, ?, '2099-01-01T00:00:00.000Z','2099-02-01T00:00:00.000Z',NULL,NULL,NULL)`).run('a'.repeat(64), created, created, created)
    applyMigrations(db, migrations)
    const modules = db.prepare(`SELECT module FROM auth_permissions WHERE role_uid='role:legacy' ORDER BY module`).all().map(row => row.module)
    assert.deepEqual(modules, ['media_assets', 'navigation_items', 'translation_cache'])
    assert.deepEqual(db.prepare(`SELECT revoked_at,revoke_reason FROM auth_sessions WHERE uid='session:legacy'`).get().revoke_reason, 'security_policy')
    assert.equal(db.pragma('quick_check', { simple: true }), 'ok')
  } finally { db.close() }
})
