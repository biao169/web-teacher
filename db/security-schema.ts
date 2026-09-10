import { sql } from 'drizzle-orm'
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { authUsers } from './schema'

export const authBootstrapState = sqliteTable('auth_bootstrap_state', {
  id: integer('id').primaryKey(),
  completedAt: text('completed_at').notNull(),
  userUid: text('user_uid').notNull(),
}, table => [
  check('ck_auth_bootstrap_state_singleton', sql`${table.id} = 1`),
])

export const authSessions = sqliteTable('auth_sessions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  uid: text('uid').notNull().unique(),
  userUid: text('user_uid').notNull().references(() => authUsers.uid, { onDelete: 'cascade', onUpdate: 'restrict' }),
  tokenHash: text('token_hash').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  lastSeenAt: text('last_seen_at').notNull(),
  idleExpiresAt: text('idle_expires_at').notNull(),
  expiresAt: text('expires_at').notNull(),
  revokedAt: text('revoked_at'),
  revokeReason: text('revoke_reason').$type<'logout' | 'expired' | 'rotated' | 'user_disabled' | 'role_disabled' | 'password_changed' | 'admin_revoked' | 'security_policy'>(),
  userAgentHash: text('user_agent_hash'),
}, table => [
  uniqueIndex('idx_auth_sessions_token_hash').on(table.tokenHash),
  index('idx_auth_sessions_user_active').on(table.userUid, table.revokedAt, table.createdAt, table.id),
  index('idx_auth_sessions_expiry').on(table.expiresAt, table.idleExpiresAt, table.id),
  index('idx_auth_sessions_revoked').on(table.revokedAt, table.id),
])

export const authLoginThrottles = sqliteTable('auth_login_throttles', {
  keyHash: text('key_hash').primaryKey(),
  scope: text('scope').$type<'account' | 'network'>().notNull(),
  failures: integer('failures').notNull().default(0),
  windowStartedAt: text('window_started_at').notNull(),
  blockedUntil: text('blocked_until'),
  updatedAt: text('updated_at').notNull(),
  expiresAt: text('expires_at').notNull(),
}, table => [
  index('idx_auth_login_throttles_expiry').on(table.expiresAt, table.keyHash),
])

export const securitySchema = { authBootstrapState, authSessions, authLoginThrottles }
