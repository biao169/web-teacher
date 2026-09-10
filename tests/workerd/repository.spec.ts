import { env } from 'cloudflare:workers'
import { applyD1Migrations } from 'cloudflare:test'
import type { D1Database } from '@cloudflare/workers-types'
import { beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { eq } from 'drizzle-orm'
import { catalog } from '../../db/catalog'
import { D1Adapter } from '../../db/adapters/d1'
import { openCloudflareDatabase } from '../../db/runtime/cloudflare'
import { globalSettings, profiles } from '../../db/schema'
import { contractCases } from '../contracts/repository-contract'

type TestBindings = { DB: D1Database; TEST_MIGRATIONS: Parameters<typeof applyD1Migrations>[1] }
const bindings = env as unknown as TestBindings
let adapter: D1Adapter

beforeAll(async () => { await applyD1Migrations(bindings.DB, bindings.TEST_MIGRATIONS) })
beforeEach(async () => {
  // Reverse FK order; only the ephemeral DB declared in vitest.workerd.config.ts is used.
  await bindings.DB.batch(Object.keys(catalog).reverse().map(name => bindings.DB.prepare(`DELETE FROM "${name}"`)))
  adapter = new D1Adapter(bindings.DB)
})

describe('real local workerd D1 Repository contract', () => {
  for (const item of contractCases) test(item.name, () => item.run({ adapter }))
})

test('official migration application is repeatable without losing business rows', async () => {
  const context = openCloudflareDatabase(bindings.DB)
  await context.repository.create('profiles', { uid: 'keep-after-migration', name: 'Keep' })
  await applyD1Migrations(bindings.DB, bindings.TEST_MIGRATIONS)
  expect((await context.repository.findByUid('profiles', 'keep-after-migration'))?.name).toBe('Keep')
  const check = await bindings.DB.prepare('PRAGMA foreign_key_check').all()
  expect(check.results).toEqual([])
})

test('D1 Drizzle driver and Repository share JSON/boolean encoding', async () => {
  const context = openCloudflareDatabase(bindings.DB)
  const rows = await context.orm.insert(profiles).values({ uid: 'from-drizzle', name: 'D1 Drizzle', is_active: true }).returning()
  expect(rows[0]?.is_active).toBe(true)
  expect((await context.repository.findByUid('profiles', 'from-drizzle'))?.is_active).toBe(true)
  const settings = await context.repository.create('global_settings', { translation_job_state: { cursor: 3 } })
  const data = await context.orm.select().from(globalSettings).where(eq(globalSettings.uid, settings.uid))
  expect(data[0]?.translation_job_state).toEqual({ cursor: 3 })
  expect(data[0]?.allow_public_registration).toBe(false)
})
