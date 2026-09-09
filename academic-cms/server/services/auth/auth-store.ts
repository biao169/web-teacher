import type { DatabaseAdapter, RawRow, SqlCommand, SqlValue } from '../../../db/contracts'
import { DatabaseError } from '../../../db/errors'
import { read, write } from '../../../db/query'
import type { AuthModule, PermissionFlags } from '../../../shared/enums/auth'
import {
  AUTH_MODULES,
  REGISTERED_USER_ROLE_LEVEL,
  REGISTERED_USER_ROLE_NAME,
  REGISTERED_USER_ROLE_UID,
  REGISTERED_USER_VISIBILITY_SCOPES,
  SYSTEM_ADMIN_ROLE_LEVEL,
  SYSTEM_ADMIN_ROLE_NAME,
  SYSTEM_ADMIN_ROLE_UID,
  isAuthModule,
  permissionUid,
  systemAdministratorPermissions,
} from '../../../shared/enums/auth'
import { buildAuditCommand, type AuditEvent } from '../../audit/commands'
import { SecurityError } from '../../security/errors'
import {
  emptyPermissionRecord,
  parseVisibilityScopes,
  permissionFlags,
  type AuthenticatedPrincipal,
} from '../../security/permissions'

export type UserStatus = 'active' | 'disabled' | 'locked'
export type SessionRevokeReason = 'logout' | 'expired' | 'rotated' | 'user_disabled' | 'role_disabled' | 'password_changed' | 'admin_revoked' | 'security_policy'
export type ThrottleScope = 'account' | 'network'

export interface CredentialRecord {
  userUid: string
  username: string
  passwordHash: string
  displayName: string | null
  email: string | null
  userStatus: UserStatus
  mustChangePassword: boolean
  roleUid: string
  roleName: string
  roleLevel: number
  roleIsSystem: boolean
  roleActive: boolean
  visibilityScopes: AuthenticatedPrincipal['visibilityScopes']
  permissions: AuthenticatedPrincipal['permissions']
}

export interface ResolvedSessionRecord {
  tokenHash: string
  createdAt: string
  lastSeenAt: string
  idleExpiresAt: string
  expiresAt: string
  revokedAt: string | null
  revokeReason: SessionRevokeReason | null
  userAgentHash: string | null
  principal: AuthenticatedPrincipal
  userStatus: UserStatus
  roleActive: boolean
}

export interface PersistSessionInput {
  sessionUid: string
  sessionHash: string
  userUid: string
  at: string
  idleExpiresAt: string
  expiresAt: string
  userAgentHash: string | null
  accountThrottleHash: string
  replacementPasswordHash?: string | null
  rotateSessionHash?: string | null
  audit: AuditEvent
}

export interface BootstrapAdminInput {
  userUid: string
  username: string
  passwordHash: string
  displayName: string | null
  email: string | null
  at: string
  audit: AuditEvent
}

export interface RegisterUserInput {
  userUid: string
  username: string
  passwordHash: string
  displayName: string | null
  email: string | null
  at: string
  audit: AuditEvent
}

export interface ChangePasswordInput {
  userUid: string
  currentSessionHash: string
  expectedPasswordHash: string
  replacementPasswordHash: string
  at: string
  audit: AuditEvent
}

export interface ThrottleEntry {
  keyHash: string
  scope: ThrottleScope
  limit: number
}

export interface ThrottleState {
  keyHash: string
  scope: ThrottleScope
  failures: number
  blockedUntil: string | null
}

export interface LoginPreflight {
  credential: CredentialRecord | null
  throttleStates: readonly ThrottleState[]
}

const MAX_ACTIVE_SESSIONS = 10

function value(row: RawRow, field: string): SqlValue {
  if (!Object.hasOwn(row, field)) throw new SecurityError('AUTH_PROTOCOL', `Database row is missing ${field}`)
  return row[field]!
}

function text(row: RawRow, field: string, nullable = false): string | null {
  const result = value(row, field)
  if (result === null && nullable) return null
  if (typeof result !== 'string') throw new SecurityError('AUTH_PROTOCOL', `Database field ${field} is invalid`)
  return result
}

function integer(row: RawRow, field: string): number {
  const result = value(row, field)
  if (typeof result !== 'number' || !Number.isSafeInteger(result)) throw new SecurityError('AUTH_PROTOCOL', `Database field ${field} is invalid`)
  return result
}

function boolean(row: RawRow, field: string): boolean {
  const result = integer(row, field)
  if (result !== 0 && result !== 1) throw new SecurityError('AUTH_PROTOCOL', `Database field ${field} is invalid`)
  return result === 1
}

function userStatus(row: RawRow, field: string): UserStatus {
  const result = text(row, field)
  if (result !== 'active' && result !== 'disabled' && result !== 'locked') throw new SecurityError('AUTH_PROTOCOL', `Database field ${field} is invalid`)
  return result
}

function revokeReason(row: RawRow, field: string): SessionRevokeReason | null {
  const result = text(row, field, true)
  if (result === null) return null
  const allowed: readonly SessionRevokeReason[] = ['logout', 'expired', 'rotated', 'user_disabled', 'role_disabled', 'password_changed', 'admin_revoked', 'security_policy']
  if (!allowed.includes(result as SessionRevokeReason)) throw new SecurityError('AUTH_PROTOCOL', `Database field ${field} is invalid`)
  return result as SessionRevokeReason
}

function parseJsonArray(raw: string): unknown[] {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) throw new Error('not array')
    return parsed
  }
  catch (error) {
    throw new SecurityError('AUTH_PROTOCOL', 'Stored role scopes are invalid', { cause: error })
  }
}

function parsePermission(row: RawRow): Readonly<PermissionFlags> {
  return permissionFlags({
    view: boolean(row, 'permission_view'),
    create: boolean(row, 'permission_create'),
    edit: boolean(row, 'permission_edit'),
    delete: boolean(row, 'permission_delete'),
    export: boolean(row, 'permission_export'),
  })
}

function assertSameIdentity(row: RawRow, first: RawRow): void {
  const fields = [
    'user_uid', 'username', 'password_hash', 'display_name', 'email',
    'user_status', 'must_change_password', 'role_uid', 'role_name',
    'role_level', 'role_is_system', 'role_active', 'visibility_scopes',
  ] as const
  for (const field of fields) {
    if (value(row, field) !== value(first, field)) {
      throw new SecurityError('AUTH_PROTOCOL', 'Authentication query returned inconsistent identity rows')
    }
  }
}

function assertSameSession(row: RawRow, first: RawRow): void {
  const fields = [
    'session_uid', 'token_hash', 'session_created_at', 'last_seen_at',
    'idle_expires_at', 'expires_at', 'revoked_at', 'revoke_reason', 'user_agent_hash',
  ] as const
  for (const field of fields) {
    if (value(row, field) !== value(first, field)) {
      throw new SecurityError('AUTH_PROTOCOL', 'Authentication query returned inconsistent session rows')
    }
  }
}

function parseCredentialRows(rows: readonly RawRow[]): CredentialRecord | null {
  if (rows.length === 0) return null
  const first = rows[0]!
  const permissions = emptyPermissionRecord()
  const seen = new Set<AuthModule>()
  for (const row of rows) {
    assertSameIdentity(row, first)
    const module = text(row, 'permission_module', true)
    if (module === null) continue
    if (!isAuthModule(module) || seen.has(module)) throw new SecurityError('AUTH_PROTOCOL', 'Stored permission module is invalid or duplicated')
    seen.add(module)
    permissions[module] = parsePermission(row)
  }
  return Object.freeze({
    userUid: text(first, 'user_uid')!,
    username: text(first, 'username')!,
    passwordHash: text(first, 'password_hash')!,
    displayName: text(first, 'display_name', true),
    email: text(first, 'email', true),
    userStatus: userStatus(first, 'user_status'),
    mustChangePassword: boolean(first, 'must_change_password'),
    roleUid: text(first, 'role_uid')!,
    roleName: text(first, 'role_name')!,
    roleLevel: integer(first, 'role_level'),
    roleIsSystem: boolean(first, 'role_is_system'),
    roleActive: boolean(first, 'role_active'),
    visibilityScopes: parseVisibilityScopes(parseJsonArray(text(first, 'visibility_scopes')!)),
    permissions: Object.freeze(permissions),
  })
}

export function principalFromCredential(record: CredentialRecord, sessionUid: string): AuthenticatedPrincipal {
  return Object.freeze({
    sessionUid,
    userUid: record.userUid,
    username: record.username,
    displayName: record.displayName,
    email: record.email,
    roleUid: record.roleUid,
    roleName: record.roleName,
    roleLevel: record.roleLevel,
    roleIsSystem: record.roleIsSystem,
    visibilityScopes: record.visibilityScopes,
    permissions: record.permissions,
    mustChangePassword: record.mustChangePassword,
  })
}

const CREDENTIAL_SQL = `SELECT
  u.uid AS user_uid, u.username, u.password_hash, u.display_name, u.email,
  u.status AS user_status, u.must_change_password,
  r.uid AS role_uid, r.name AS role_name, r.level AS role_level,
  r.is_system AS role_is_system, r.is_active AS role_active, r.visibility_scopes,
  p.module AS permission_module, p.can_view AS permission_view, p.can_create AS permission_create,
  p.can_edit AS permission_edit, p.can_delete AS permission_delete, p.can_export AS permission_export
FROM auth_users u
JOIN auth_roles r ON r.uid = u.role_uid
LEFT JOIN auth_permissions p ON p.role_uid = r.uid
WHERE u.username = ? COLLATE NOCASE
ORDER BY p.sort_order ASC, p.id ASC`

const SESSION_SQL = `SELECT
  s.uid AS session_uid, s.token_hash, s.created_at AS session_created_at,
  s.last_seen_at, s.idle_expires_at, s.expires_at, s.revoked_at, s.revoke_reason, s.user_agent_hash,
  u.uid AS user_uid, u.username, u.password_hash, u.display_name, u.email,
  u.status AS user_status, u.must_change_password,
  r.uid AS role_uid, r.name AS role_name, r.level AS role_level,
  r.is_system AS role_is_system, r.is_active AS role_active, r.visibility_scopes,
  p.module AS permission_module, p.can_view AS permission_view, p.can_create AS permission_create,
  p.can_edit AS permission_edit, p.can_delete AS permission_delete, p.can_export AS permission_export
FROM auth_sessions s
JOIN auth_users u ON u.uid = s.user_uid
JOIN auth_roles r ON r.uid = u.role_uid
LEFT JOIN auth_permissions p ON p.role_uid = r.uid
WHERE s.token_hash = ?
ORDER BY p.sort_order ASC, p.id ASC`

function throttleRows(rows: readonly RawRow[]): ThrottleState[] {
  return rows.map((row) => {
    const scope = text(row, 'scope')
    if (scope !== 'account' && scope !== 'network') throw new SecurityError('AUTH_PROTOCOL', 'Stored throttle scope is invalid')
    return {
      keyHash: text(row, 'key_hash')!,
      scope,
      failures: integer(row, 'failures'),
      blockedUntil: text(row, 'blocked_until', true),
    }
  })
}

function monotonicUpdatedAt(column = 'updated_at'): string {
  return `CASE WHEN ${column} >= ? THEN strftime('%Y-%m-%dT%H:%M:%fZ', ${column}, '+0.001 seconds') ELSE ? END`
}

export class AuthStore {
  constructor(private readonly adapter: DatabaseAdapter) {}

  async loginPreflight(username: string, throttleKeys: readonly string[], now: string): Promise<LoginPreflight> {
    if (throttleKeys.length < 1 || throttleKeys.length > 2) throw new SecurityError('AUTH_INPUT', 'Invalid throttle key set')
    const placeholders = throttleKeys.map(() => '?').join(', ')
    const results = await this.adapter.batch([
      read(CREDENTIAL_SQL, [username]),
      read(`SELECT key_hash, scope, failures, blocked_until FROM auth_login_throttles WHERE key_hash IN (${placeholders}) AND expires_at > ?`, [...throttleKeys, now]),
    ])
    return {
      credential: parseCredentialRows(results[0]?.rows ?? []),
      throttleStates: throttleRows(results[1]?.rows ?? []),
    }
  }

  async findCredentialByUsername(username: string): Promise<CredentialRecord | null> {
    return parseCredentialRows((await this.adapter.execute(read(CREDENTIAL_SQL, [username]))).rows)
  }

  async registerPublicUser(input: RegisterUserInput): Promise<void> {
    const scopes = JSON.stringify(REGISTERED_USER_VISIBILITY_SCOPES)
    const registrationEnabled = `COALESCE((
      SELECT allow_public_registration FROM global_settings
      ORDER BY updated_at DESC, id DESC LIMIT 1
    ), 0) = 1`
    const registeredRoleReady = `EXISTS (
      SELECT 1 FROM auth_roles r
      WHERE r.uid = ? AND r.level = ? AND r.is_system = 1 AND r.is_active = 1
        AND r.visibility_scopes = ?
    )`
    const commands: SqlCommand[] = [
      write(`INSERT INTO auth_roles (
          uid, created_at, updated_at, name, level, description,
          visibility_scopes, is_system, is_active, sort_order
        )
        SELECT ?, ?, ?, ?, ?, 'Built-in least-privilege role for public registration', ?, 1, 1, 100
        WHERE ${registrationEnabled}
        ON CONFLICT(uid) DO NOTHING`, [
        REGISTERED_USER_ROLE_UID, input.at, input.at, REGISTERED_USER_ROLE_NAME,
        REGISTERED_USER_ROLE_LEVEL, scopes,
      ]),
      // Audit precedes the user insert but uses the same database-side setting
      // and role predicate. Any uniqueness failure in the following insert rolls
      // the complete batch back, while a disabled setting writes neither row.
      buildAuditCommand({
        ...input.audit,
        condition: {
          sql: `${registrationEnabled} AND ${registeredRoleReady}`,
          params: [REGISTERED_USER_ROLE_UID, REGISTERED_USER_ROLE_LEVEL, scopes],
        },
      }),
      write(`INSERT INTO auth_users (
          uid, created_at, updated_at, username, password_hash, display_name,
          email, role_uid, status, must_change_password, last_login_at, visibility
        )
        SELECT ?, ?, ?, ?, ?, ?, ?, r.uid, 'active', 0, NULL, 'hidden'
        FROM auth_roles r
        WHERE r.uid = ? AND r.level = ? AND r.is_system = 1 AND r.is_active = 1
          AND r.visibility_scopes = ? AND ${registrationEnabled}
        RETURNING uid`, [
        input.userUid, input.at, input.at, input.username, input.passwordHash,
        input.displayName, input.email, REGISTERED_USER_ROLE_UID,
        REGISTERED_USER_ROLE_LEVEL, scopes,
      ], true),
    ]
    try {
      const results = await this.adapter.batch(commands)
      if (results[2]?.rows.length !== 1) {
        throw new SecurityError('AUTH_CONFLICT', 'Registration setting or built-in role changed during registration', {
          publicMessage: '当前无法完成注册，请稍后重试。',
        })
      }
    }
    catch (error) {
      if (error instanceof SecurityError) throw error
      if (error instanceof DatabaseError && (error.code === 'DB_UNIQUE' || error.code === 'DB_CONFLICT')) {
        throw new SecurityError('AUTH_CONFLICT', 'Public registration identity already exists', {
          cause: error,
          publicMessage: '该用户名不可用。',
        })
      }
      throw error
    }
  }

  async changePassword(input: ChangePasswordInput): Promise<void> {
    const changed = `EXISTS (
      SELECT 1 FROM auth_users
      WHERE uid = ? AND password_hash = ? AND must_change_password = 0
    )`
    const changedParams = [input.userUid, input.replacementPasswordHash] as const
    const commands: SqlCommand[] = [
      write(`UPDATE auth_users SET
          password_hash = ?, must_change_password = 0,
          updated_at = ${monotonicUpdatedAt()}
        WHERE uid = ? AND password_hash = ? AND status = 'active'
          AND EXISTS (
            SELECT 1 FROM auth_sessions s
            WHERE s.token_hash = ? AND s.user_uid = auth_users.uid
              AND s.revoked_at IS NULL AND s.idle_expires_at > ? AND s.expires_at > ?
          )
        RETURNING uid`, [
        input.replacementPasswordHash, input.at, input.at, input.userUid,
        input.expectedPasswordHash, input.currentSessionHash, input.at, input.at,
      ], true),
      write(`UPDATE auth_sessions SET
          revoked_at = ?, revoke_reason = 'password_changed',
          updated_at = ${monotonicUpdatedAt()}
        WHERE user_uid = ? AND token_hash <> ? AND revoked_at IS NULL
          AND ${changed}`, [
        input.at, input.at, input.at, input.userUid, input.currentSessionHash,
        ...changedParams,
      ]),
      buildAuditCommand({
        ...input.audit,
        condition: { sql: changed, params: changedParams },
      }),
    ]
    const results = await this.adapter.batch(commands)
    if (results[0]?.rows.length !== 1) {
      throw new SecurityError('AUTH_CONFLICT', 'Password or active session changed concurrently', {
        publicMessage: '密码修改未完成，请刷新登录状态后重试。',
      })
    }
  }

  async resolveSessionByHash(tokenHash: string): Promise<ResolvedSessionRecord | null> {
    const rows = (await this.adapter.execute(read(SESSION_SQL, [tokenHash]))).rows
    const credential = parseCredentialRows(rows)
    if (!credential) return null
    const first = rows[0]!
    for (const row of rows) assertSameSession(row, first)
    return {
      tokenHash: text(first, 'token_hash')!,
      createdAt: text(first, 'session_created_at')!,
      lastSeenAt: text(first, 'last_seen_at')!,
      idleExpiresAt: text(first, 'idle_expires_at')!,
      expiresAt: text(first, 'expires_at')!,
      revokedAt: text(first, 'revoked_at', true),
      revokeReason: revokeReason(first, 'revoke_reason'),
      userAgentHash: text(first, 'user_agent_hash', true),
      principal: principalFromCredential(credential, text(first, 'session_uid')!),
      userStatus: credential.userStatus,
      roleActive: credential.roleActive,
    }
  }

  async persistSession(input: PersistSessionInput): Promise<void> {
    const replacement = input.replacementPasswordHash ?? null
    const rotate = input.rotateSessionHash ?? null
    const insertedSession = `EXISTS (
      SELECT 1 FROM auth_sessions
      WHERE uid = ? AND token_hash = ? AND user_uid = ? AND created_at = ?
    )`
    const insertedSessionParams = (): SqlValue[] => [
      input.sessionUid,
      input.sessionHash,
      input.userUid,
      input.at,
    ]
    const commands: SqlCommand[] = [
      write(`INSERT INTO auth_sessions (
          uid, user_uid, token_hash, created_at, updated_at, last_seen_at,
          idle_expires_at, expires_at, revoked_at, revoke_reason, user_agent_hash
        )
        SELECT ?, u.uid, ?, ?, ?, ?, ?, ?, NULL, NULL, ?
        FROM auth_users u JOIN auth_roles r ON r.uid = u.role_uid
        WHERE u.uid = ? AND u.status = 'active' AND r.is_active = 1
        RETURNING uid`, [
        input.sessionUid, input.sessionHash, input.at, input.at, input.at,
        input.idleExpiresAt, input.expiresAt, input.userAgentHash, input.userUid,
      ], true),
      write(`UPDATE auth_users SET
          last_login_at = ?,
          updated_at = ${monotonicUpdatedAt()},
          password_hash = CASE WHEN ? IS NULL THEN password_hash ELSE ? END
        WHERE uid = ? AND ${insertedSession}`, [
        input.at, input.at, input.at, replacement, replacement, input.userUid,
        ...insertedSessionParams(),
      ]),
      write(`DELETE FROM auth_login_throttles
        WHERE key_hash = ? AND ${insertedSession}`, [
        input.accountThrottleHash,
        ...insertedSessionParams(),
      ]),
    ]
    if (rotate) {
      commands.push(write(`UPDATE auth_sessions SET
          revoked_at = ?, revoke_reason = 'rotated',
          updated_at = ${monotonicUpdatedAt()}
        WHERE token_hash = ? AND token_hash <> ? AND revoked_at IS NULL
          AND ${insertedSession}`, [
        input.at, input.at, input.at, rotate, input.sessionHash,
        ...insertedSessionParams(),
      ]))
    }
    commands.push(write(`UPDATE auth_sessions SET
        revoked_at = ?, revoke_reason = 'rotated',
        updated_at = ${monotonicUpdatedAt()}
      WHERE id IN (
        SELECT id FROM auth_sessions
        WHERE user_uid = ? AND revoked_at IS NULL
        ORDER BY created_at DESC, id DESC
        LIMIT -1 OFFSET ${MAX_ACTIVE_SESSIONS}
      ) AND ${insertedSession}`, [
      input.at, input.at, input.at, input.userUid,
      ...insertedSessionParams(),
    ]))
    commands.push(buildAuditCommand({
      ...input.audit,
      condition: { sql: insertedSession, params: insertedSessionParams() },
    }))

    try {
      const results = await this.adapter.batch(commands)
      if (results[0]?.rows.length !== 1) {
        throw new SecurityError('AUTH_SESSION_INVALID', 'Account became unavailable while creating a session')
      }
    }
    catch (error) {
      if (error instanceof SecurityError) throw error
      if (error instanceof DatabaseError && (error.code === 'DB_UNIQUE' || error.code === 'DB_CONFLICT')) {
        throw new SecurityError('AUTH_CONFLICT', 'Session identifier collision', { cause: error })
      }
      throw error
    }
  }

  async touchSession(tokenHash: string, now: string, idleExpiresAt: string): Promise<boolean> {
    const result = await this.adapter.execute(write(`UPDATE auth_sessions SET
        last_seen_at = CASE WHEN last_seen_at < ? THEN ? ELSE last_seen_at END,
        idle_expires_at = CASE WHEN idle_expires_at < ? THEN ? ELSE idle_expires_at END,
        updated_at = ${monotonicUpdatedAt()}
      WHERE token_hash = ? AND revoked_at IS NULL AND idle_expires_at > ? AND expires_at > ?
        AND EXISTS (
          SELECT 1 FROM auth_users u JOIN auth_roles r ON r.uid = u.role_uid
          WHERE u.uid = auth_sessions.user_uid AND u.status = 'active' AND r.is_active = 1
        )
      RETURNING uid`, [now, now, idleExpiresAt, idleExpiresAt, now, now, tokenHash, now, now], true))
    return result.rows.length === 1
  }

  async revokeSessionByHash(tokenHash: string, at: string, reason: SessionRevokeReason, audit?: AuditEvent): Promise<boolean> {
    const update = write(`UPDATE auth_sessions SET
        revoked_at = ?, revoke_reason = ?,
        updated_at = ${monotonicUpdatedAt()}
      WHERE token_hash = ? AND revoked_at IS NULL
      RETURNING uid`, [at, reason, at, at, tokenHash], true)
    if (!audit) return (await this.adapter.execute(update)).rows.length === 1
    const activeSession = 'EXISTS (SELECT 1 FROM auth_sessions WHERE token_hash = ? AND revoked_at IS NULL)'
    const results = await this.adapter.batch([
      // Record intent only when the same atomic batch can still revoke the
      // active session. This avoids relying on connection-local change counters,
      // whose visibility is not part of the DatabaseAdapter contract.
      buildAuditCommand({
        ...audit,
        condition: { sql: activeSession, params: [tokenHash] },
      }),
      update,
    ])
    return results[1]?.rows.length === 1
  }

  async revokeAllForUser(userUid: string, at: string, reason: SessionRevokeReason): Promise<number> {
    return (await this.adapter.execute(write(`UPDATE auth_sessions SET
        revoked_at = ?, revoke_reason = ?,
        updated_at = ${monotonicUpdatedAt()}
      WHERE user_uid = ? AND revoked_at IS NULL`, [at, reason, at, at, userUid]))).changes
  }

  async revokeAllForUserWithAudit(
    userUid: string,
    at: string,
    reason: SessionRevokeReason,
    audit: AuditEvent,
  ): Promise<number> {
    const active = 'EXISTS (SELECT 1 FROM auth_sessions WHERE user_uid = ? AND revoked_at IS NULL)'
    const results = await this.adapter.batch([
      buildAuditCommand({ ...audit, condition: { sql: active, params: [userUid] } }),
      write(`UPDATE auth_sessions SET
          revoked_at = ?, revoke_reason = ?,
          updated_at = ${monotonicUpdatedAt()}
        WHERE user_uid = ? AND revoked_at IS NULL`, [at, reason, at, at, userUid]),
    ])
    return results[1]?.changes ?? 0
  }

  async bootstrapAvailable(): Promise<boolean> {
    const rows = (await this.adapter.execute(read(`SELECT
        EXISTS(SELECT 1 FROM auth_bootstrap_state WHERE id = 1) AS completed,
        EXISTS(SELECT 1 FROM auth_users) AS has_users,
        EXISTS(SELECT 1 FROM auth_roles WHERE uid = ?) AS reserved_role_exists`, [SYSTEM_ADMIN_ROLE_UID]))).rows
    const row = rows[0]
    if (!row) throw new SecurityError('AUTH_PROTOCOL', 'Bootstrap state query returned no row')
    return !boolean(row, 'completed') && !boolean(row, 'has_users') && !boolean(row, 'reserved_role_exists')
  }

  async bootstrapAdmin(input: BootstrapAdminInput): Promise<void> {
    const scopes = JSON.stringify(['public', 'authenticated', 'staff', 'owner', 'hidden'])
    const grants = systemAdministratorPermissions()
    const commands: SqlCommand[] = [
      // A plain singleton insert is intentional: duplicate state raises a
      // unique error, while an existing user/reserved role selects id=2 and
      // violates the singleton CHECK. Both failures occur inside batch().
      write(`INSERT INTO auth_bootstrap_state (id, completed_at, user_uid)
        VALUES (
          CASE WHEN NOT EXISTS (SELECT 1 FROM auth_users)
            AND NOT EXISTS (SELECT 1 FROM auth_roles WHERE uid = ?)
          THEN 1 ELSE 2 END,
          ?, ?
        )
        RETURNING user_uid`, [SYSTEM_ADMIN_ROLE_UID, input.at, input.userUid], true),
      write(`INSERT INTO auth_roles (
          uid, created_at, updated_at, name, level, description,
          visibility_scopes, is_system, is_active, sort_order
        )
        SELECT ?, ?, ?, ?, ?, 'Built-in administrator role', ?, 1, 1, 0
        WHERE EXISTS (SELECT 1 FROM auth_bootstrap_state WHERE id = 1 AND user_uid = ?)`, [
        SYSTEM_ADMIN_ROLE_UID, input.at, input.at, SYSTEM_ADMIN_ROLE_NAME,
        SYSTEM_ADMIN_ROLE_LEVEL, scopes, input.userUid,
      ]),
      write(`INSERT INTO auth_users (
          uid, created_at, updated_at, username, password_hash, display_name,
          email, role_uid, status, must_change_password, last_login_at, visibility
        )
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, 'active', 0, NULL, 'hidden'
        WHERE EXISTS (SELECT 1 FROM auth_bootstrap_state WHERE id = 1 AND user_uid = ?)
        RETURNING uid`, [
        input.userUid, input.at, input.at, input.username, input.passwordHash,
        input.displayName, input.email, SYSTEM_ADMIN_ROLE_UID, input.userUid,
      ], true),
    ]

    AUTH_MODULES.forEach((module, index) => {
      const grant = grants[module]
      commands.push(write(`INSERT INTO auth_permissions (
          uid, created_at, updated_at, role_uid, module,
          can_view, can_create, can_edit, can_delete, can_export, sort_order
        )
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        WHERE EXISTS (SELECT 1 FROM auth_bootstrap_state WHERE id = 1 AND user_uid = ?)`, [
        permissionUid(module), input.at, input.at, SYSTEM_ADMIN_ROLE_UID, module,
        grant.view ? 1 : 0, grant.create ? 1 : 0, grant.edit ? 1 : 0,
        grant.delete ? 1 : 0, grant.export ? 1 : 0, index, input.userUid,
      ]))
    })

    commands.push(buildAuditCommand({
      ...input.audit,
      condition: { sql: 'EXISTS (SELECT 1 FROM auth_users WHERE uid = ?)', params: [input.userUid] },
    }))

    try {
      const results = await this.adapter.batch(commands)
      if (results[0]?.rows.length !== 1 || results[2]?.rows.length !== 1) {
        throw new SecurityError('AUTH_CONFLICT', 'Initial administrator already exists')
      }
    }
    catch (error) {
      if (error instanceof SecurityError) throw error
      if (error instanceof DatabaseError && (error.code === 'DB_UNIQUE' || error.code === 'DB_CONFLICT')) {
        throw new SecurityError('AUTH_CONFLICT', 'Initial administrator already exists', { cause: error })
      }
      throw error
    }
  }

  async recordThrottleFailures(
    entries: readonly ThrottleEntry[],
    now: string,
    resetBefore: string,
    blockUntil: string,
    expiresAt: string,
  ): Promise<ThrottleState[]> {
    if (entries.length < 1 || entries.length > 2) throw new SecurityError('AUTH_INPUT', 'Invalid throttle failure set')
    const commands = entries.map((entry) => {
      if (!Number.isSafeInteger(entry.limit) || entry.limit < 2 || entry.limit > 1000) throw new SecurityError('AUTH_CONFIG', 'Invalid throttle limit')
      return write(`INSERT INTO auth_login_throttles (
          key_hash, scope, failures, window_started_at, blocked_until, updated_at, expires_at
        ) VALUES (?, ?, 1, ?, NULL, ?, ?)
        ON CONFLICT(key_hash) DO UPDATE SET
          scope = excluded.scope,
          failures = CASE
            WHEN auth_login_throttles.window_started_at <= ? OR auth_login_throttles.expires_at <= excluded.updated_at THEN 1
            ELSE min(auth_login_throttles.failures + 1, 1000000)
          END,
          window_started_at = CASE
            WHEN auth_login_throttles.window_started_at <= ? OR auth_login_throttles.expires_at <= excluded.updated_at THEN excluded.window_started_at
            ELSE auth_login_throttles.window_started_at
          END,
          blocked_until = CASE
            WHEN auth_login_throttles.blocked_until IS NOT NULL AND auth_login_throttles.blocked_until > excluded.updated_at THEN auth_login_throttles.blocked_until
            WHEN auth_login_throttles.window_started_at <= ? OR auth_login_throttles.expires_at <= excluded.updated_at THEN NULL
            WHEN auth_login_throttles.failures + 1 >= ? THEN ?
            ELSE NULL
          END,
          updated_at = excluded.updated_at,
          expires_at = CASE WHEN auth_login_throttles.expires_at > excluded.expires_at THEN auth_login_throttles.expires_at ELSE excluded.expires_at END
        RETURNING key_hash, scope, failures, blocked_until`, [
        entry.keyHash, entry.scope, now, now, expiresAt,
        resetBefore, resetBefore, resetBefore, entry.limit, blockUntil,
      ], true)
    })
    const results = await this.adapter.batch(commands)
    return results.map((result) => {
      if (result.rows.length !== 1) throw new SecurityError('AUTH_PROTOCOL', 'Throttle update returned no row')
      return throttleRows(result.rows)[0]!
    })
  }

  async cleanupExpiredSecurityState(now: string, revokedBefore: string): Promise<{ sessions: number; throttles: number }> {
    const results = await this.adapter.batch([
      write('DELETE FROM auth_sessions WHERE expires_at <= ?', [now]),
      write('DELETE FROM auth_sessions WHERE revoked_at IS NOT NULL AND revoked_at <= ?', [revokedBefore]),
      write('DELETE FROM auth_login_throttles WHERE expires_at <= ?', [now]),
    ])
    return {
      sessions: (results[0]?.changes ?? 0) + (results[1]?.changes ?? 0),
      throttles: results[2]?.changes ?? 0,
    }
  }
}
