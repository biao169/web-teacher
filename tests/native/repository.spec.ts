import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { eq } from 'drizzle-orm'
import { getTableConfig } from 'drizzle-orm/sqlite-core'
import { afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { fileURLToPath } from 'node:url'
import { loadMigrations, applyMigrations } from '../../scripts/db/migrations.mjs'
import { SqliteAdapter } from '../../db/adapters/sqlite'
import { Repository } from '../../db/repository'
import { schema, profiles, globalSettings } from '../../db/schema'
import { catalog } from '../../db/catalog'
import { contractCases } from '../contracts/repository-contract'
import type { TableSpec } from '../../db/schema-types'

type Migration = { name: string; sha256: string; sql: string }
let migrations: Migration[]
let connection: Database.Database
let adapter: SqliteAdapter
beforeAll(async () => { migrations = await loadMigrations(fileURLToPath(new URL('../../migrations', import.meta.url))) })
beforeEach(() => {
  connection = new Database(':memory:')
  applyMigrations(connection, migrations)
  adapter = new SqliteAdapter(connection)
})
afterEach(() => { connection?.close() })

describe('production better-sqlite3 Repository contract', () => {
  for (const item of contractCases) test(item.name, () => item.run({ adapter }))
})

test('all Drizzle table metadata matches the migrated SQLite schema', () => {
  expect(Object.keys(schema)).toHaveLength(19)
  for (const table of Object.values(schema)) {
    const config = getTableConfig(table)
    const spec = (catalog as Record<string, TableSpec>)[config.name]!
    const actual = connection.prepare(`PRAGMA table_info("${config.name}")`).all() as { name: string; type: string; notnull: number; pk: number }[]
    expect(config.columns.map(column => column.name)).toEqual(actual.map(column => column.name))
    for (const column of config.columns) {
      const info = actual.find(value => value.name === column.name)!
      expect(column.getSQLType().toUpperCase()).toBe(info.type)
      expect(column.notNull).toBe(info.notnull === 1 || info.pk === 1)
      expect(column.primary).toBe(info.pk === 1)
    }
    expect(config.indexes.map(index => index.config.name).sort()).toEqual(spec.indexes.map(index => index.name).sort())
    expect(config.foreignKeys.length).toBe(Object.values(spec.columns).filter(column => column.references).length)
    const tableSql = (connection.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(config.name) as { sql: string }).sql
    for (const check of config.checks) expect(tableSql).toContain(`CONSTRAINT "${check.name}"`)
  }
})

test('Drizzle and Repository agree on booleans, JSON, defaults and RETURNING', async () => {
  const orm = drizzle(connection), repo = new Repository(adapter)
  const profile = orm.insert(profiles).values({ uid: 'drizzle-profile', name: 'Drizzle', is_active: true }).returning().get()
  expect(profile.is_active).toBe(true)
  expect((await repo.findByUid('profiles', profile.uid))?.is_active).toBe(true)
  const settings = await repo.create('global_settings', { translation_providers: ['libretranslate'], translation_job_state: { cursor: 7 } })
  const result = orm.select().from(globalSettings).where(eq(globalSettings.uid, settings.uid)).get()!
  expect(result.translation_providers).toEqual(['libretranslate'])
  expect(result.translation_job_state).toEqual({ cursor: 7 })
  expect(result.allow_public_registration).toBe(false)
})
