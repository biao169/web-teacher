import type { H3Event } from 'h3'
import { normalizeUid, redactSensitive } from '~~/shared/complete-admin/core.mjs'
import { ADMIN_MODULES } from '~~/shared/admin/registry'
import {
  AUTH_MODULES,
  PERMISSION_ACTIONS,
  VISIBILITY_SCOPES,
  type AuthModule,
  type PermissionAction,
} from '~~/shared/enums/auth'
import type { AdminPrincipal } from '../../utils/complete-admin/auth'
import { resolveAdminDatabase, type SqlAdapter, type SqlOperation, type SqlValue } from '../../utils/complete-admin/db'
import { hashAdminPassword } from './password-bridge'

const USERNAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/u
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u
const SAFE_USER_COLUMNS = 'u.uid,u.username,u.display_name,u.email,u.role_uid,u.status,u.must_change_password,u.last_login_at,u.visibility,u.created_at,u.updated_at'
const MODULE_DEFINITIONS = Object.freeze(ADMIN_MODULES.map(item => ({ key: item.module, title: item.title, description: item.description })))

function plain(value: unknown, code = 'INVALID_BODY'): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(code)
  return value as Record<string, any>
}
function bool(value: unknown): number {
  if (value === true || value === 1 || value === '1') return 1
  if (value === false || value === 0 || value === '0') return 0
  throw new Error('INVALID_BOOLEAN')
}
function text(value: unknown, max: number, required = true): string | null {
  const normalized = String(value ?? '').normalize('NFC').trim()
  if (!normalized) {
    if (required) throw new Error('REQUIRED_TEXT')
    return null
  }
  if (normalized.length > max || /[\u0000-\u001f\u007f]/u.test(normalized)) throw new Error('INVALID_TEXT')
  return normalized
}
function expectedTimestamp(value: unknown): string {
  const normalized = String(value ?? '').trim()
  if (!normalized || Number.isNaN(Date.parse(normalized))) throw new Error('EXPECTED_UPDATED_AT_REQUIRED')
  return new Date(normalized).toISOString()
}
function nowAfter(previous?: string | null): string {
  const now = Date.now()
  const prior = previous ? Date.parse(previous) : 0
  return new Date(Math.max(now, Number.isFinite(prior) ? prior + 1 : now)).toISOString()
}
function audit(principal: AdminPrincipal, action: string, target: string | null, summary: string, detail: unknown, now: string): SqlOperation {
  return {
    sql: `INSERT INTO operation_logs (uid, actor_uid, actor_name, action, module, target_uid, summary, detail_json, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'auth', ?, ?, ?, 'success', ?, ?)`,
    params: [`log:${crypto.randomUUID()}`, principal.userUid, principal.displayName || principal.username, action, target, summary, JSON.stringify(redactSensitive(detail)), now, now],
    expectChanges: 1,
  }
}
function authGeneration(now: string): SqlOperation {
  return {
    sql: `INSERT INTO cache_generations (tag,generation,updated_at) VALUES ('auth',1,?) ON CONFLICT(tag) DO UPDATE SET generation=cache_generations.generation+1,updated_at=excluded.updated_at`,
    params: [now],
    expectChanges: { min: 1 },
  }
}
function permissionGranted(permissions: unknown, module: AuthModule, action: PermissionAction): boolean {
  if (!permissions || typeof permissions !== 'object' || Array.isArray(permissions)) return false
  const row = (permissions as Record<string, unknown>)[module]
  if (row === true || row === '*') return true
  if (!row || typeof row !== 'object' || Array.isArray(row)) return false
  const record = row as Record<string, unknown>
  const camel = `can${action[0]!.toUpperCase()}${action.slice(1)}`
  return record[action] === true || record[action] === 1 || record[`can_${action}`] === true || record[`can_${action}`] === 1 || record[camel] === true || record[camel] === 1
}
function visibilityScopes(value: unknown, fallback: unknown = ['public']): string {
  const source = value === undefined ? fallback : value
  try {
    const parsed = typeof source === 'string' ? JSON.parse(source) : source
    if (!Array.isArray(parsed) || parsed.length < 1 || parsed.some(item => !VISIBILITY_SCOPES.includes(String(item) as any))) throw new Error('invalid')
    return JSON.stringify([...new Set(parsed.map(String))])
  } catch {
    throw new Error('INVALID_VISIBILITY_SCOPES')
  }
}

export class CompleteAdminAuthService {
  constructor(private readonly event: H3Event, private readonly principal: AdminPrincipal) {}

  private async db(): Promise<SqlAdapter> { return resolveAdminDatabase(this.event) }

  private async role(db: SqlAdapter, uid: string): Promise<Record<string, any>> {
    const row = await db.first<Record<string, any>>(`SELECT uid,name,level,description,visibility_scopes,is_system,is_active,sort_order,created_at,updated_at FROM auth_roles WHERE uid=? LIMIT 1`, [uid])
    if (!row) throw new Error('ROLE_NOT_FOUND')
    return row
  }

  private async assertRoleAssignable(db: SqlAdapter, uid: string): Promise<Record<string, any>> {
    const role = await this.role(db, uid)
    if (Number(role.is_active) !== 1) throw new Error('ROLE_DISABLED')
    if (Number(role.level) > this.principal.roleLevel) throw new Error('ROLE_LEVEL_FORBIDDEN')
    if (Number(role.is_system) === 1 && this.principal.roleIsSystem !== true) throw new Error('SYSTEM_ADMIN_TARGET_PROTECTED')
    return role
  }

  private async targetUser(db: SqlAdapter, uid: string): Promise<Record<string, any>> {
    const row = await db.first<Record<string, any>>(`SELECT ${SAFE_USER_COLUMNS},r.name AS role_name,r.level AS role_level,r.is_system AS role_is_system,r.is_active AS role_is_active FROM auth_users u JOIN auth_roles r ON r.uid=u.role_uid WHERE u.uid=? LIMIT 1`, [uid])
    if (!row) throw new Error('RECORD_NOT_FOUND')
    if (Number(row.role_level) > this.principal.roleLevel) throw new Error('ROLE_LEVEL_FORBIDDEN')
    if (Number(row.role_is_system) === 1 && this.principal.roleIsSystem !== true) throw new Error('SYSTEM_ADMIN_TARGET_PROTECTED')
    return row
  }

  private async safeUser(db: SqlAdapter, uid: string): Promise<Record<string, unknown>> {
    const now = new Date().toISOString()
    const row = await db.first<Record<string, unknown>>(`SELECT ${SAFE_USER_COLUMNS},r.name AS role_name,r.level AS role_level,r.is_system AS role_is_system,r.is_active AS role_is_active,(SELECT COUNT(*) FROM auth_sessions s WHERE s.user_uid=u.uid AND s.revoked_at IS NULL AND s.idle_expires_at>? AND s.expires_at>?) AS active_session_count FROM auth_users u JOIN auth_roles r ON r.uid=u.role_uid WHERE u.uid=? LIMIT 1`, [now, now, uid])
    if (!row) throw new Error('RECORD_NOT_FOUND')
    return row
  }

  private async assertRoleNameAvailable(db: SqlAdapter, name: string, excludingUid?: string): Promise<void> {
    const params: SqlValue[] = [name]
    let sql = `SELECT uid FROM auth_roles WHERE lower(name)=lower(?)`
    if (excludingUid) { sql += ' AND uid<>?'; params.push(excludingUid) }
    if (await db.first(sql, params)) throw new Error('DUPLICATE_ROLE_NAME')
  }

  private async assertLastSystemAdministratorSafe(db: SqlAdapter, user: Record<string, any>, nextStatus: string, nextRole: Record<string, any>): Promise<void> {
    if (Number(user.role_is_system) !== 1 || String(user.status) !== 'active') return
    if (nextStatus === 'active' && Number(nextRole.is_system) === 1 && Number(nextRole.is_active) === 1) return
    const count = await db.first<{ total: number }>(`SELECT COUNT(*) AS total FROM auth_users u JOIN auth_roles r ON r.uid=u.role_uid WHERE u.status='active' AND r.is_system=1 AND r.is_active=1`)
    if (Number(count?.total ?? 0) <= 1) throw new Error('LAST_SYSTEM_ADMIN_REQUIRED')
  }

  async overview(): Promise<Record<string, unknown>> {
    const db = await this.db()
    const now = new Date().toISOString()
    const modulePlaceholders = AUTH_MODULES.map(() => '?').join(',')
    const [users, roles, permissions] = await Promise.all([
      db.all<Record<string, unknown>>(`SELECT ${SAFE_USER_COLUMNS},r.name AS role_name,r.level AS role_level,r.is_system AS role_is_system,r.is_active AS role_is_active,(SELECT COUNT(*) FROM auth_sessions s WHERE s.user_uid=u.uid AND s.revoked_at IS NULL AND s.idle_expires_at>? AND s.expires_at>?) AS active_session_count FROM auth_users u JOIN auth_roles r ON r.uid=u.role_uid ORDER BY u.updated_at DESC,u.id DESC LIMIT 500`, [now, now]),
      db.all<Record<string, unknown>>(`SELECT r.uid,r.name,r.level,r.description,r.visibility_scopes,r.is_system,r.is_active,r.sort_order,r.created_at,r.updated_at,(SELECT COUNT(*) FROM auth_users u WHERE u.role_uid=r.uid) AS user_count FROM auth_roles r ORDER BY r.level DESC,r.sort_order ASC,r.id ASC LIMIT 200`),
      db.all<Record<string, unknown>>(`SELECT uid,role_uid,module,can_view,can_create,can_edit,can_delete,can_export,sort_order,updated_at FROM auth_permissions WHERE module IN (${modulePlaceholders}) ORDER BY role_uid,sort_order,module LIMIT 5000`, AUTH_MODULES),
    ])
    const activeUsers = users.filter(user => user.status === 'active').length
    return {
      users,
      roles,
      permissions,
      modules: MODULE_DEFINITIONS,
      metrics: {
        users: users.length,
        activeUsers,
        restrictedUsers: users.length - activeUsers,
        activeRoles: roles.filter(role => Number(role.is_active) === 1).length,
        activeSessions: users.reduce((sum, user) => sum + Number(user.active_session_count ?? 0), 0),
      },
    }
  }

  async createUser(input: unknown): Promise<Record<string, unknown>> {
    const body = plain(input)
    const uid = body.uid === undefined ? normalizeUid(`user:${crypto.randomUUID()}`) : normalizeUid(body.uid)
    const username = text(body.username, 64)!.toLowerCase()
    if (!USERNAME_RE.test(username)) throw new Error('INVALID_USERNAME')
    const displayName = text(body.displayName, 200)!
    const email = text(body.email, 320, false)
    if (email && !EMAIL_RE.test(email)) throw new Error('INVALID_EMAIL')
    const roleUid = normalizeUid(body.roleUid)
    const db = await this.db()
    await this.assertRoleAssignable(db, roleUid)
    if (await db.first(`SELECT uid FROM auth_users WHERE uid=? LIMIT 1`, [uid])) throw new Error('DUPLICATE_UID')
    if (await db.first(`SELECT uid FROM auth_users WHERE username=? COLLATE NOCASE LIMIT 1`, [username])) throw new Error('DUPLICATE_USERNAME')
    const passwordContext: { username: string; displayName?: string; email?: string } = { username, displayName }
    if (email) passwordContext.email = email
    const passwordHash = await hashAdminPassword(String(body.password ?? ''), passwordContext)
    const now = new Date().toISOString()
    await db.batch([
      { sql: `INSERT INTO auth_users (uid,username,password_hash,display_name,email,role_uid,status,must_change_password,last_login_at,visibility,created_at,updated_at) VALUES (?,?,?,?,?,?,'active',1,NULL,'hidden',?,?)`, params: [uid, username, passwordHash, displayName, email, roleUid, now, now], expectChanges: 1 },
      audit(this.principal, 'create_user', uid, '创建用户账号', { username, roleUid }, now),
      authGeneration(now),
    ])
    return this.safeUser(db, uid)
  }

  async updateUser(uidValue: unknown, input: unknown): Promise<Record<string, unknown>> {
    const uid = normalizeUid(uidValue)
    const body = plain(input)
    const expected = expectedTimestamp(body.expectedUpdatedAt)
    const db = await this.db()
    const current = await this.targetUser(db, uid)
    if (String(current.updated_at) !== expected) throw new Error('EDIT_CONFLICT')

    const values: Record<string, SqlValue> = {}
    if (body.displayName !== undefined) {
      const value = text(body.displayName, 200)!
      if (value !== current.display_name) values.display_name = value
    }
    if (body.email !== undefined) {
      const value = text(body.email, 320, false)
      if (value && !EMAIL_RE.test(value)) throw new Error('INVALID_EMAIL')
      if (value !== current.email) values.email = value
    }
    let nextRole = await this.role(db, String(current.role_uid))
    if (body.roleUid !== undefined) {
      const roleUid = normalizeUid(body.roleUid)
      nextRole = await this.assertRoleAssignable(db, roleUid)
      if (roleUid !== current.role_uid) values.role_uid = roleUid
    }
    const nextStatus = body.status === undefined ? String(current.status) : String(body.status)
    if (!['active', 'disabled', 'locked'].includes(nextStatus)) throw new Error('INVALID_USER_STATUS')
    if (nextStatus !== current.status) values.status = nextStatus
    if (body.mustChangePassword !== undefined) {
      const value = bool(body.mustChangePassword)
      if (value !== Number(current.must_change_password)) values.must_change_password = value
    }

    const privilegeChange = Object.hasOwn(values, 'status') || Object.hasOwn(values, 'role_uid')
    if (uid === this.principal.userUid && privilegeChange) throw new Error('SELF_PRIVILEGE_CHANGE_FORBIDDEN')
    if (privilegeChange) await this.assertLastSystemAdministratorSafe(db, current, nextStatus, nextRole)
    if (!Object.keys(values).length) return this.safeUser(db, uid)

    const now = nowAfter(String(current.updated_at))
    const keys = Object.keys(values)
    const operations: SqlOperation[] = [{
      sql: `UPDATE auth_users SET ${keys.map(key => `"${key}"=?`).join(',')},updated_at=? WHERE uid=? AND updated_at=?`,
      params: [...keys.map(key => values[key]!), now, uid, expected],
      expectChanges: 1,
    }]
    if (privilegeChange) {
      const reason = nextStatus === 'active' ? 'security_policy' : 'user_disabled'
      operations.push({ sql: `UPDATE auth_sessions SET revoked_at=?,revoke_reason=?,updated_at=? WHERE user_uid=? AND revoked_at IS NULL`, params: [now, reason, now, uid] })
    }
    operations.push(audit(this.principal, 'update_user', uid, '更新用户账号', { fields: keys }, now), authGeneration(now))
    await db.batch(operations)
    return this.safeUser(db, uid)
  }

  async resetPassword(uidValue: unknown, input: unknown): Promise<void> {
    const uid = normalizeUid(uidValue)
    if (uid === this.principal.userUid) throw new Error('SELF_PASSWORD_RESET_FORBIDDEN')
    const body = plain(input)
    const expected = expectedTimestamp(body.expectedUpdatedAt)
    const db = await this.db()
    const user = await this.targetUser(db, uid)
    if (String(user.updated_at) !== expected) throw new Error('EDIT_CONFLICT')
    const hash = await hashAdminPassword(String(body.password ?? ''), { username: user.username, displayName: user.display_name, email: user.email })
    const now = nowAfter(String(user.updated_at))
    await db.batch([
      { sql: `UPDATE auth_users SET password_hash=?,must_change_password=1,updated_at=? WHERE uid=? AND updated_at=?`, params: [hash, now, uid, expected], expectChanges: 1 },
      { sql: `UPDATE auth_sessions SET revoked_at=?,revoke_reason='password_changed',updated_at=? WHERE user_uid=? AND revoked_at IS NULL`, params: [now, now, uid] },
      audit(this.principal, 'reset_password', uid, '重置用户密码', {}, now),
      authGeneration(now),
    ])
  }

  async saveRole(uidValue: unknown, input: unknown): Promise<Record<string, unknown>> {
    const body = plain(input)
    const db = await this.db()
    const creating = !uidValue
    const uid = creating
      ? (body.uid === undefined ? normalizeUid(`role:${crypto.randomUUID()}`) : normalizeUid(body.uid))
      : normalizeUid(uidValue)
    if (creating && await db.first(`SELECT uid FROM auth_roles WHERE uid=? LIMIT 1`, [uid])) throw new Error('DUPLICATE_UID')
    const current = creating ? null : await this.role(db, uid)
    if (current && Number(current.level) > this.principal.roleLevel) throw new Error('ROLE_LEVEL_FORBIDDEN')
    if (current && Number(current.is_system) === 1) throw new Error('SYSTEM_ROLE_PROTECTED')
    if (current && uid === this.principal.roleUid) throw new Error('CURRENT_ROLE_PROTECTED')

    const name = text(body.name ?? current?.name, 100)!
    const level = Number(body.level ?? current?.level)
    if (!Number.isSafeInteger(level) || level < 0) throw new Error('INVALID_ROLE_LEVEL')
    if (level > this.principal.roleLevel) throw new Error('ROLE_LEVEL_FORBIDDEN')
    const description = body.description === undefined ? (current?.description ?? null) : text(body.description, 2000, false)
    const scopes = visibilityScopes(body.visibilityScopes ?? body.visibility_scopes, current?.visibility_scopes ?? ['public'])
    const active = body.isActive === undefined ? Number(current?.is_active ?? 1) : bool(body.isActive)
    const sortOrder = Number(body.sortOrder ?? current?.sort_order ?? 0)
    if (!Number.isSafeInteger(sortOrder) || Math.abs(sortOrder) > 1_000_000) throw new Error('INVALID_SORT_ORDER')
    await this.assertRoleNameAvailable(db, name, current ? uid : undefined)
    const now = nowAfter(current?.updated_at)

    if (creating) {
      await db.batch([
        { sql: `INSERT INTO auth_roles (uid,name,level,description,visibility_scopes,is_system,is_active,sort_order,created_at,updated_at) VALUES (?,?,?,?,?,0,?,?,?,?)`, params: [uid, name, level, description, scopes, active, sortOrder, now, now], expectChanges: 1 },
        audit(this.principal, 'create_role', uid, '创建权限角色', { name, level }, now),
        authGeneration(now),
      ])
    } else {
      const expected = expectedTimestamp(body.expectedUpdatedAt)
      if (String(current!.updated_at) !== expected) throw new Error('EDIT_CONFLICT')
      const securityChanged = Number(current!.level) !== level || String(current!.visibility_scopes) !== scopes || Number(current!.is_active) !== active
      const operations: SqlOperation[] = [{
        sql: `UPDATE auth_roles SET name=?,level=?,description=?,visibility_scopes=?,is_active=?,sort_order=?,updated_at=? WHERE uid=? AND updated_at=?`,
        params: [name, level, description, scopes, active, sortOrder, now, uid, expected],
        expectChanges: 1,
      }]
      if (securityChanged) {
        operations.push({
          sql: `UPDATE auth_sessions SET revoked_at=?,revoke_reason=?,updated_at=? WHERE user_uid IN (SELECT uid FROM auth_users WHERE role_uid=?) AND revoked_at IS NULL`,
          params: [now, active === 0 ? 'role_disabled' : 'security_policy', now, uid],
        })
      }
      operations.push(audit(this.principal, 'update_role', uid, '更新权限角色', { name, level, securityChanged }, now), authGeneration(now))
      await db.batch(operations)
    }
    return (await this.role(db, uid)) as Record<string, unknown>
  }

  async deleteRole(uidValue: unknown, expectedValue: unknown): Promise<void> {
    const uid = normalizeUid(uidValue)
    const expected = expectedTimestamp(expectedValue)
    const db = await this.db()
    const role = await this.role(db, uid)
    if (String(role.updated_at) !== expected) throw new Error('EDIT_CONFLICT')
    if (Number(role.level) > this.principal.roleLevel) throw new Error('ROLE_LEVEL_FORBIDDEN')
    if (Number(role.is_system) === 1) throw new Error('SYSTEM_ROLE_PROTECTED')
    if (uid === this.principal.roleUid) throw new Error('CURRENT_ROLE_PROTECTED')
    const usage = await db.first<{ total: number }>(`SELECT COUNT(*) AS total FROM auth_users WHERE role_uid=?`, [uid])
    if (Number(usage?.total ?? 0) > 0) throw new Error('ROLE_IN_USE')
    const now = new Date().toISOString()
    await db.batch([
      { sql: `DELETE FROM auth_permissions WHERE role_uid=?`, params: [uid] },
      { sql: `DELETE FROM auth_roles WHERE uid=? AND updated_at=?`, params: [uid, expected], expectChanges: 1 },
      audit(this.principal, 'delete_role', uid, '删除空角色', { name: role.name }, now),
      authGeneration(now),
    ])
  }

  async savePermissions(roleUidValue: unknown, input: unknown): Promise<{ updated: number; roleUpdatedAt: string }> {
    const roleUid = normalizeUid(roleUidValue)
    const body = plain(input)
    const expected = expectedTimestamp(body.expectedUpdatedAt)
    const matrix = plain(body.permissions, 'INVALID_PERMISSION_MATRIX')
    const db = await this.db()
    const role = await this.assertRoleAssignable(db, roleUid)
    if (String(role.updated_at) !== expected) throw new Error('EDIT_CONFLICT')
    if (Number(role.is_system) === 1) throw new Error('SYSTEM_ROLE_PROTECTED')
    if (roleUid === this.principal.roleUid) throw new Error('CURRENT_ROLE_PROTECTED')
    if (Number(role.level) > this.principal.roleLevel) throw new Error('ROLE_LEVEL_FORBIDDEN')
    const unknown = Object.keys(matrix).filter(module => !AUTH_MODULES.includes(module as AuthModule))
    if (unknown.length) throw new Error('UNKNOWN_PERMISSION_MODULE')

    const normalized = {} as Record<AuthModule, Record<PermissionAction, number>>
    for (const module of AUTH_MODULES) {
      const source = plain(matrix[module] ?? {}, 'INVALID_PERMISSION_ROW')
      const row = {} as Record<PermissionAction, number>
      for (const action of PERMISSION_ACTIONS) {
        row[action] = bool(source[action] ?? false)
        if (row[action] === 1 && !permissionGranted(this.principal.permissions, module, action)) throw new Error('PERMISSION_ESCALATION_FORBIDDEN')
      }
      if (row.view === 0 && PERMISSION_ACTIONS.some(action => action !== 'view' && row[action] === 1)) throw new Error('PERMISSION_REQUIRES_VIEW')
      normalized[module] = row
    }

    const now = nowAfter(String(role.updated_at))
    const modulePlaceholders = AUTH_MODULES.map(() => '?').join(',')
    const operations: SqlOperation[] = [
      { sql: `UPDATE auth_roles SET updated_at=? WHERE uid=? AND updated_at=?`, params: [now, roleUid, expected], expectChanges: 1 },
      { sql: `DELETE FROM auth_permissions WHERE role_uid=? AND module NOT IN (${modulePlaceholders})`, params: [roleUid, ...AUTH_MODULES] },
    ]
    let order = 0
    for (const module of AUTH_MODULES) {
      const row = normalized[module]
      operations.push({
        sql: `INSERT INTO auth_permissions (uid,role_uid,module,can_view,can_create,can_edit,can_delete,can_export,sort_order,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(role_uid,module) DO UPDATE SET can_view=excluded.can_view,can_create=excluded.can_create,can_edit=excluded.can_edit,can_delete=excluded.can_delete,can_export=excluded.can_export,sort_order=excluded.sort_order,updated_at=excluded.updated_at`,
        params: [`permission:${crypto.randomUUID()}`, roleUid, module, row.view, row.create, row.edit, row.delete, row.export, order++, now, now],
      })
    }
    operations.push(
      { sql: `UPDATE auth_sessions SET revoked_at=?,revoke_reason='security_policy',updated_at=? WHERE user_uid IN (SELECT uid FROM auth_users WHERE role_uid=?) AND revoked_at IS NULL`, params: [now, now, roleUid] },
      audit(this.principal, 'update_permissions', roleUid, '更新角色权限', { modules: AUTH_MODULES.length }, now),
      authGeneration(now),
    )
    await db.batch(operations)
    return { updated: AUTH_MODULES.length, roleUpdatedAt: now }
  }

  async sessions(uidValue: unknown): Promise<{ sessions: Record<string, unknown>[] }> {
    const uid = normalizeUid(uidValue)
    const db = await this.db()
    await this.targetUser(db, uid)
    const now = new Date().toISOString()
    const sessions = await db.all<Record<string, unknown>>(`SELECT uid,created_at,last_seen_at,idle_expires_at,expires_at,CASE WHEN user_agent_hash IS NULL THEN NULL ELSE substr(user_agent_hash,1,12) END AS device_fingerprint FROM auth_sessions WHERE user_uid=? AND revoked_at IS NULL AND idle_expires_at>? AND expires_at>? ORDER BY last_seen_at DESC,id DESC LIMIT 20`, [uid, now, now])
    return { sessions }
  }

  async revokeSessions(uidValue: unknown, input: unknown): Promise<{ revoked: number }> {
    const uid = normalizeUid(uidValue)
    const body = plain(input)
    const db = await this.db()
    await this.targetUser(db, uid)
    const revokeAll = body.all === true
    const raw = body.sessionUids
    if (!revokeAll && (!Array.isArray(raw) || raw.length < 1 || raw.length > 20)) throw new Error('INVALID_SESSION_SELECTION')
    const sessionUids = revokeAll ? [] : [...new Set((raw as unknown[]).map(normalizeUid))]
    const now = new Date().toISOString()
    let sql = `UPDATE auth_sessions SET revoked_at=?,revoke_reason='admin_revoked',updated_at=? WHERE user_uid=? AND revoked_at IS NULL AND idle_expires_at>? AND expires_at>?`
    const params: SqlValue[] = [now, now, uid, now, now]
    if (!revokeAll) {
      sql += ` AND uid IN (${sessionUids.map(() => '?').join(',')})`
      params.push(...sessionUids)
    }
    const operations: SqlOperation[] = [{ sql, params, ...(revokeAll ? {} : { expectChanges: sessionUids.length }) }]
    operations.push(audit(this.principal, 'revoke_sessions', uid, '撤销用户活动会话', { all: revokeAll, count: revokeAll ? undefined : sessionUids.length }, now), authGeneration(now))
    const result = await db.batch(operations)
    return { revoked: result[0]?.changes ?? 0 }
  }
}
