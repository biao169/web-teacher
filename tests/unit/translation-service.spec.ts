import { DatabaseSync } from 'node:sqlite'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import type { AdminPrincipal } from '../../server/utils/complete-admin/auth'
import type { SqlAdapter, SqlOperation, SqlValue } from '../../server/utils/complete-admin/db'
import { applyMigrations, loadMigrations } from '../../scripts/db/migrations.mjs'
import { CompleteAdminTranslationService } from '../../server/services/complete-admin/translation-service'

const harness = vi.hoisted(() => ({ adapter: null as SqlAdapter | null }))
vi.mock('../../server/utils/complete-admin/db', () => ({ resolveAdminDatabase: async () => harness.adapter }))
const migrations = await loadMigrations(resolve('migrations'))
let db: DatabaseSync
let service: CompleteAdminTranslationService
const principal = { userUid: 'test:admin', username: 'test_admin', displayName: 'Test administrator' } as AdminPrincipal
const memorySuccess = () => Response.json({ responseStatus: 200, quotaFinished: false, responseData: { translatedText: 'English translation' } })
const rows = () => db.prepare('SELECT * FROM translation_cache ORDER BY id').all() as Record<string, any>[]
async function seedNews(title = '新闻一', uid = 'news:test') {
  db.prepare('INSERT INTO news (uid, title, slug, visibility) VALUES (?, ?, ?, ?)').run(uid, title, uid.replace(':', '-'), 'public')
  await service.scan(200)
  return rows().find(row => row.source_text === title)!
}
beforeEach(() => {
  db = new DatabaseSync(':memory:')
  applyMigrations({ prepare: (sql: string) => db.prepare(sql), exec: (sql: string) => db.exec(sql), get inTransaction() { return db.isTransaction } }, migrations)
  const run = (sql: string, params: readonly SqlValue[] = []) => {
    const result = db.prepare(sql).run(...params)
    return { changes: Number(result.changes) }
  }
  harness.adapter = {
    kind: 'sqlite',
    async all<T extends Record<string, unknown>>(sql: string, params: readonly SqlValue[] = []) { return db.prepare(sql).all(...params) as T[] },
    async first<T extends Record<string, unknown>>(sql: string, params: readonly SqlValue[] = []) { return db.prepare(sql).get(...params) as T ?? null },
    async run(sql, params) { return run(sql, params) },
    async batch(operations: readonly SqlOperation[]) {
      db.exec('BEGIN IMMEDIATE')
      try {
        const results = operations.map(operation => {
          const result = run(operation.sql, operation.params)
          if (typeof operation.expectChanges === 'number') expect(result.changes).toBe(operation.expectChanges)
          else if (operation.expectChanges?.min !== undefined) expect(result.changes).toBeGreaterThanOrEqual(operation.expectChanges.min)
          return result
        })
        db.exec('COMMIT'); return results
      } catch (error) { db.exec('ROLLBACK'); throw error }
    },
  }
  service = new CompleteAdminTranslationService({} as H3Event, principal)
})
afterEach(() => { db.close(); vi.unstubAllGlobals() })

describe('translation service with real migrated SQLite', () => {
  it('supports an entirely empty settings table, and diagnostics do not create settings', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => memorySuccess()))
    expect(await service.overview()).toMatchObject({ provider: 'mymemory', workerCount: 1 })
    expect(await service.testConfiguration()).toMatchObject({ success: true, provider: 'mymemory' })
    expect(db.prepare('SELECT COUNT(*) AS n FROM global_settings').get()!.n).toBe(0)
    await seedNews()
    expect(db.prepare('SELECT COUNT(*) AS n FROM global_settings').get()!.n).toBe(1)
    expect(await service.run()).toMatchObject({ processed: 1, completed: 1, failed: 0 })
    expect(rows()[0]).toMatchObject({ status: 'success', provider: 'mymemory', translated_text: 'English translation' })
    expect(JSON.parse(String(db.prepare('SELECT translation_job_state FROM global_settings').get()!.translation_job_state)).status).toBe('completed')
  })
  it('reads saved settings on the next request and preserves endpoint prefixes', async () => {
    const row = await seedNews()
    db.prepare('UPDATE global_settings SET translation_provider=?, translation_providers=?, libretranslate_url=?').run('libretranslate', '["libretranslate"]', 'https://translator.example/prefix')
    const fetch = vi.fn(async () => Response.json({ translatedText: ['Configured translation'] }))
    vi.stubGlobal('fetch', fetch)
    expect(await service.overview()).toMatchObject({ provider: 'libretranslate', readyProviders: ['libretranslate'] })
    expect(await service.run({ uids: [row.uid] })).toMatchObject({ completed: 1 })
    expect(String(fetch.mock.calls[0]![0])).toBe('https://translator.example/prefix/translate')
    expect(rows()[0]).toMatchObject({ provider: 'libretranslate', translated_text: 'Configured translation' })
  })
  it('persists bounded rate-limit feedback, Retry-After and retry recovery', async () => {
    const row = await seedNews()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 429, headers: { 'retry-after': '240' } })))
    const before = Date.now()
    expect(await service.run()).toMatchObject({ processed: 1, failed: 1, providerRequests: 1, failures: [{ code: 'PROVIDER_RATE_LIMITED' }] })
    const failed = rows()[0]!
    expect(failed).toMatchObject({ status: 'failed', error_message: 'PROVIDER_RATE_LIMITED' })
    const meta = JSON.parse(failed.source_refs)[0]
    expect(Date.parse(meta.retryAfter)).toBeGreaterThanOrEqual(before + 240000)
    expect(meta.leaseToken).toBeNull()
    expect(await service.run()).toMatchObject({ processed: 0, providerRequests: 0 })
    expect(await service.retry([row.uid])).toMatchObject({ retried: 1 })
    vi.stubGlobal('fetch', vi.fn(async () => memorySuccess()))
    expect(await service.run()).toMatchObject({ completed: 1, failed: 0 })
  })
  it('does not overwrite manually curated translations or lease them for a selected run', async () => {
    const row = await seedNews()
    await service.manual(row.uid, 'Human reviewed text', row.updated_at)
    const fetch = vi.fn(async () => memorySuccess()); vi.stubGlobal('fetch', fetch)
    expect(await service.run({ uids: [row.uid] })).toMatchObject({ processed: 0 })
    expect(fetch).not.toHaveBeenCalled()
    expect(rows()[0]).toMatchObject({ is_manual: 1, provider: 'manual', translated_text: 'Human reviewed text' })
  })
  it('skips protected manual selections before requiring an automatic provider', async () => {
    const row = await seedNews()
    db.prepare('UPDATE global_settings SET translation_providers=?').run('["manual"]')
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch)
    await expect(service.run({ uids: [row.uid] })).rejects.toThrow('TRANSLATION_CONFIGURATION_REQUIRED')
    await service.manual(row.uid, 'Human preserved', row.updated_at)
    expect(await service.run({ uids: [row.uid] })).toMatchObject({ processed: 0, providerRequests: 0 })
    expect(fetch).not.toHaveBeenCalled()
    expect(rows()[0]).toMatchObject({ is_manual: 1, translated_text: 'Human preserved' })
  })
  it('keeps a source edited during a provider request from receiving stale text', async () => {
    await seedNews()
    vi.stubGlobal('fetch', vi.fn(async () => {
      db.prepare('UPDATE news SET title=?').run('来源发生变化')
      return memorySuccess()
    }))
    expect(await service.run()).toMatchObject({ completed: 0, stale: 1 })
    expect(rows()[0]).toMatchObject({ is_current: 0, error_message: 'SOURCE_CHANGED_DURING_TRANSLATION' })
    expect(rows()[0]!.translated_text).not.toBe('English translation')
  })
  it('retains successful fields independently when another field fails', async () => {
    await seedNews('正常字段', 'news:good')
    await seedNews('失败字段', 'news:bad')
    db.prepare('UPDATE global_settings SET translation_provider=?, translation_providers=?, libretranslate_url=?').run('libretranslate', '["libretranslate"]', 'https://translator.example')
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      const texts = JSON.parse(String(init.body)).q
      return texts.length > 1 ? Response.json({ translatedText: [] }) : texts[0] === '失败字段' ? new Response(null, { status: 400 }) : Response.json({ translatedText: ['Good translation'] })
    }))
    expect(await service.run()).toMatchObject({ completed: 1, failed: 1 })
    expect(rows().find(row => row.source_text === '正常字段')).toMatchObject({ translated_text: 'Good translation', status: 'success' })
    expect(rows().find(row => row.source_text === '失败字段')).toMatchObject({ status: 'failed', error_message: 'PROVIDER_REQUEST_REJECTED' })
  })
})

it('advances bounded scan cursors across fields, rows and tables without restarting', async () => {
  const insert = db.prepare('INSERT INTO news (uid, title, slug, content, visibility) VALUES (?, ?, ?, ?, ?)')
  for (let index = 0; index < 1100; index++) insert.run(`news:cursor-${index}`, `标题${index}`, `cursor-${index}`, `正文${index}`, 'public')
  let cursor: unknown, passes = 0
  do {
    const result = await service.scan(200, cursor)
    expect(Number(result.visited)).toBeLessThanOrEqual(200)
    expect(result.nextCursor).not.toEqual(cursor)
    cursor = result.nextCursor; passes++
    expect(passes).toBeLessThan(40)
  } while (cursor)
  expect(rows().filter(row => row.is_current === 1)).toHaveLength(2200)
  expect(rows().some(row => row.source_text === '正文1099')).toBe(true)
  const before = rows().length
  await service.scan(200)
  expect(rows()).toHaveLength(before)
  await expect(service.scan(200, { entity: -1 })).rejects.toThrow('INVALID_SCAN_CURSOR')
})
it('does not let exhausted failures at the head of the queue starve pending records', async () => {
  for (let index = 0; index < 45; index++) db.prepare('INSERT INTO news (uid, title, slug, visibility) VALUES (?, ?, ?, ?)').run(`news:q-${index}`, `标题${index}`, `q-${index}`, 'public')
  await service.scan(500)
  const all = rows()
  for (const row of all.slice(0, 44)) {
    const metadata = JSON.parse(row.source_refs); metadata[0].attemptCount = 3
    db.prepare("UPDATE translation_cache SET status = 'failed', source_refs = ? WHERE uid = ?").run(JSON.stringify(metadata), row.uid)
  }
  vi.stubGlobal('fetch', vi.fn(async () => memorySuccess()))
  expect(await service.run()).toMatchObject({ processed: 1, completed: 1, continuation: { remaining: 0, nextRunAt: null } })
})
it('returns a retry deadline and preserves a pause made during an in-flight batch', async () => {
  await seedNews()
  vi.stubGlobal('fetch', vi.fn(async () => {
    const settings = db.prepare('SELECT translation_job_state FROM global_settings').get()!
    db.prepare('UPDATE global_settings SET translation_job_state = ?').run(JSON.stringify({ ...JSON.parse(String(settings.translation_job_state)), status: 'paused' }))
    return new Response(null, { status: 429, headers: { 'retry-after': '240' } })
  }))
  const result = await service.run()
  expect(result.status).toBe('paused')
  const continuation = result.continuation as { remaining: number; nextRunAt: string }
  expect(continuation.remaining).toBe(1)
  expect(Date.parse(continuation.nextRunAt)).toBeGreaterThan(Date.now())
})

describe('pending text deduplication without historical reuse', () => {
  it('translates duplicates beyond a batch and database page once and fans out to every row', async () => {
    for (let i = 0; i < 115; i++) db.prepare('INSERT INTO news(uid,title,slug,visibility) VALUES(?,?,?,?)').run(`news:dup${i}`, '同一句原文', `dup-${i}`, 'public')
    await service.scan(2000)
    db.prepare('UPDATE global_settings SET translation_batch_size = 1').run()
    const fetch = vi.fn(async () => memorySuccess()); vi.stubGlobal('fetch', fetch)
    expect(await service.overview()).toMatchObject({ deduplication: { records: 115, uniqueTexts: 1 } })
    expect(await service.run()).toMatchObject({ completed: 115, uniqueTexts: 1, duplicateTexts: 114, providerRequests: 1 })
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(rows().every(row => row.status === 'success')).toBe(true)
    expect(await service.run()).toMatchObject({ processed: 0 })
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('does not copy historical manual or machine results and respects explicit selections', async () => {
    const first = await seedNews('相同原文', 'news:first')
    vi.stubGlobal('fetch', vi.fn(async () => memorySuccess()))
    await service.run()
    await service.manual(first.uid, 'Historical human text', rows()[0]!.updated_at)
    await seedNews('相同原文', 'news:second')
    await seedNews('相同原文', 'news:third')
    const pending = rows().filter(row => row.status === 'pending')
    const fetch = vi.fn(async () => memorySuccess()); vi.stubGlobal('fetch', fetch)
    expect(await service.run({ uids: [pending[0]!.uid] })).toMatchObject({ completed: 1 })
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(rows().find(row => row.uid === pending[1]!.uid)?.status).toBe('pending')
    expect(rows()[0]).toMatchObject({ is_manual: 1, translated_text: 'Historical human text' })
    expect(await service.run()).toMatchObject({ completed: 1 })
    expect(fetch).toHaveBeenCalledTimes(2)
  })
  it('shares failure and preserves per-row source checks while translating duplicates', async () => {
    await seedNews('重复原文', 'news:first'); await seedNews('重复原文', 'news:second')
    const fetch = vi.fn(async () => new Response(null, { status: 429 })); vi.stubGlobal('fetch', fetch)
    expect(await service.run()).toMatchObject({ failed: 2, providerRequests: 1 })
    expect(fetch).toHaveBeenCalledTimes(1)
    await service.retry(rows().map(row => row.uid))
    vi.stubGlobal('fetch', vi.fn(async () => {
      db.prepare("UPDATE news SET title = '已经修改' WHERE uid = 'news:second'").run()
      return memorySuccess()
    }))
    expect(await service.run()).toMatchObject({ completed: 1, stale: 1, providerRequests: 1 })
  })
  it('prevents overlapping requests from claiming different rows of the same text', async () => {
    await seedNews('并发原文', 'news:first'); await seedNews('并发原文', 'news:second')
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    let entered!: () => void
    const started = new Promise<void>(resolve => { entered = resolve })
    const fetch = vi.fn(async () => { entered(); await gate; return memorySuccess() }); vi.stubGlobal('fetch', fetch)
    const first = service.run({ uids: [rows()[0]!.uid] })
    await started
    const second = await service.run({ uids: [rows()[1]!.uid] })
    expect(second.processed).toBe(0)
    release(); await first
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
