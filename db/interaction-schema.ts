import { sql } from 'drizzle-orm'
import { check, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

/** Stage-6 public interaction throttles. Keys are server-side HMAC digests. */
export const publicActionThrottles = sqliteTable('public_action_throttles', {
  keyHash: text('key_hash').primaryKey(),
  action: text('action').$type<'registration' | 'contact'>().notNull(),
  scope: text('scope').$type<'identity' | 'network'>().notNull(),
  attempts: integer('attempts').notNull().default(0),
  windowStartedAt: text('window_started_at').notNull(),
  blockedUntil: text('blocked_until'),
  updatedAt: text('updated_at').notNull(),
  expiresAt: text('expires_at').notNull(),
}, table => [
  check('ck_public_action_throttles_key_hash', sql.raw("length(\"key_hash\") = 64 AND \"key_hash\" NOT GLOB '*[^0-9a-f]*'")),
  check('ck_public_action_throttles_action', sql`${table.action} IN ('registration', 'contact')`),
  check('ck_public_action_throttles_scope', sql`${table.scope} IN ('identity', 'network')`),
  check('ck_public_action_throttles_attempts', sql`typeof(${table.attempts}) = 'integer' AND ${table.attempts} BETWEEN 0 AND 1000000`),
  check('ck_public_action_throttles_window_started_at', sql.raw("length(\"window_started_at\") = 24 AND COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', \"window_started_at\", '+0 seconds') = \"window_started_at\", 0)")),
  check('ck_public_action_throttles_blocked_until', sql.raw("\"blocked_until\" IS NULL OR (length(\"blocked_until\") = 24 AND COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', \"blocked_until\", '+0 seconds') = \"blocked_until\", 0))")),
  check('ck_public_action_throttles_updated_at', sql.raw("length(\"updated_at\") = 24 AND COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', \"updated_at\", '+0 seconds') = \"updated_at\", 0)")),
  check('ck_public_action_throttles_expires_at', sql.raw("length(\"expires_at\") = 24 AND COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', \"expires_at\", '+0 seconds') = \"expires_at\", 0)")),
  check('ck_public_action_throttles_time_order', sql`${table.updatedAt} >= ${table.windowStartedAt} AND ${table.expiresAt} >= ${table.updatedAt} AND (${table.blockedUntil} IS NULL OR (${table.blockedUntil} >= ${table.updatedAt} AND ${table.expiresAt} >= ${table.blockedUntil}))`),
  index('idx_public_action_throttles_expiry').on(table.expiresAt, table.keyHash),
  index('idx_public_action_throttles_action_scope').on(table.action, table.scope, table.updatedAt),
])

/** Singleton marker for the explicitly invoked development demonstration dataset. */
export const demoSeedState = sqliteTable('demo_seed_state', {
  id: integer('id').primaryKey(),
  datasetVersion: text('dataset_version').notNull(),
  seededAt: text('seeded_at').notNull(),
  seedDigest: text('seed_digest').notNull(),
}, table => [
  check('ck_demo_seed_state_singleton', sql`${table.id} = 1`),
  check('ck_demo_seed_state_dataset_version', sql`length(trim(${table.datasetVersion})) BETWEEN 1 AND 64`),
  check('ck_demo_seed_state_seeded_at', sql.raw("length(\"seeded_at\") = 24 AND COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', \"seeded_at\", '+0 seconds') = \"seeded_at\", 0)")),
  check('ck_demo_seed_state_seed_digest', sql.raw("length(\"seed_digest\") = 64 AND \"seed_digest\" NOT GLOB '*[^0-9a-f]*'")),
])

export const interactionSchema = { publicActionThrottles, demoSeedState }
