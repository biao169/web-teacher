import { DatabaseSync } from 'node:sqlite'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import type { AdminPrincipal } from '../../server/utils/complete-admin/auth'
import type { SqlAdapter, SqlValue } from '../../server/utils/complete-admin/db'
import { applyMigrations, loadMigrations } from '../../scripts/db/migrations.mjs'
import { SqliteAdapter } from '../../db/adapters/sqlite'
import { CompleteAdminResourceService } from '../../server/services/complete-admin/resource-service'
import { PublicContentStore } from '../../server/services/public/public-content-store'
import { resolvePublicNavigation } from '../../shared/utils/public-path'
import { normalizePublicListHref, publicFilterKeys, publicListHref } from '../../shared/utils/public-list-link'
import { parsePublicListRequest } from '../../server/services/public/public-query'

const harness = vi.hoisted(() => ({ adapter: null as SqlAdapter | null }))
vi.mock('../../server/utils/complete-admin/db', () => ({ resolveAdminDatabase: async () => harness.adapter }))
const migrations = await loadMigrations(resolve('migrations'))
let db: DatabaseSync
let service: CompleteAdminResourceService
let store: PublicContentStore
const now = '2026-09-06T00:00:00.000Z'
const navigation = (path: string) => ({ uid: 'navigation:filter-test', title: '学术报告', title_en: 'Talks', kind: 'button', url_name: null, path, location: 'hero', style: 'primary', enabled: 1, visibility: 'public', sort_order: 0 })
beforeEach(() => {
  db = new DatabaseSync(':memory:')
  const connection = { prepare: (sql: string) => db.prepare(sql), exec: (sql: string) => db.exec(sql), get inTransaction() { return db.isTransaction } }
  applyMigrations(connection, migrations)
  const run = (sql: string, params: readonly SqlValue[] = []) => ({ changes: Number(db.prepare(sql).run(...params).changes) })
  harness.adapter = {
    kind: 'sqlite',
    async all<T extends Record<string, unknown>>(sql: string, params: readonly SqlValue[] = []) { return db.prepare(sql).all(...params) as T[] },
    async first<T extends Record<string, unknown>>(sql: string, params: readonly SqlValue[] = []) { return db.prepare(sql).get(...params) as T ?? null },
    async run(sql, params) { return run(sql, params) },
    async batch(operations) {
      db.exec('BEGIN IMMEDIATE')
      try {
        const result = operations.map(operation => {
          const result = run(operation.sql, operation.params)
          if (typeof operation.expectChanges === 'number') expect(result.changes).toBe(operation.expectChanges)
          return result
        })
        db.exec('COMMIT'); return result
      } catch (error) { db.exec('ROLLBACK'); throw error }
    },
  }
  service = new CompleteAdminResourceService({} as H3Event, { userUid: 'test:admin', username: 'test_admin', displayName: 'Test administrator' } as AdminPrincipal)
  store = new PublicContentStore(new SqliteAdapter(connection))
  for (let i = 0; i < 15; i++) {
    db.prepare('INSERT INTO news (uid,title,slug,category,visibility,published_at) VALUES (?,?,?,?,?,?)')
      .run(`news:talk-${i}`, `人工智能报告 ${i}`, `talk-${i}`, '学术报告', 'public', now)
  }
  db.prepare('INSERT INTO news (uid,title,slug,category,visibility,published_at) VALUES (?,?,?,?,?,?)').run('news:other', '人工智能新闻', 'other', '通知', 'public', now)
  db.prepare('INSERT INTO news (uid,title,slug,category,visibility,published_at) VALUES (?,?,?,?,?,?)').run('news:hidden', '人工智能私密报告', 'hidden', '学术报告', 'hidden', now)
})
afterEach(() => db.close())

describe('persisted filter buttons → public SQLite listings', () => {
  it('creates and reloads a canonical button, preserving public filtering in both locales and pages', async () => {
    const path = '/news?category=学术报告&q=人工智能'
    await service.create('navigation', navigation(path))
    const record = (await service.get('navigation', 'navigation:filter-test'))!
    expect(record).toMatchObject({ kind: 'button', url_name: null, path: normalizePublicListHref(path) })
    for (const locale of ['zh', 'en'] as const) {
      const resolved = resolvePublicNavigation({ kind: String(record.kind), path: String(record.path), location: String(record.location), style: String(record.style) }, locale)!
      expect(resolved).toMatchObject({ location: 'hero', style: 'primary', external: false })
      expect(decodeURIComponent(resolved.href)).toMatch(/^[\x20-\x7e]+$/u)
      const query = Object.fromEntries(new URL(resolved.href, 'https://test.example').searchParams)
      const first = await store.news(parsePublicListRequest({ ...query, locale }, publicFilterKeys('news')), now)
      const second = await store.news(parsePublicListRequest({ ...query, locale, page: '2' }, publicFilterKeys('news')), now)
      expect(first.total).toBe(15)
      expect(first.items).toHaveLength(12)
      expect(second.items).toHaveLength(3)
      expect(new Set([...first.items, ...second.items].map(item => item.uid)).size).toBe(15)
      expect(first.items.every(item => item.category === '学术报告')).toBe(true)
    }
  })
  it('updates saved filters with concurrency protection and preserves navigation cache invalidation', async () => {
    const record = await service.create('navigation', navigation(publicListHref('/news', { category: '学术报告' })))
    const next = await service.update('navigation', record.uid, { path: '/news?category=通知', expectedUpdatedAt: record.updated_at })
    expect(next.path).toBe(normalizePublicListHref('/news?category=通知'))
    await expect(service.update('navigation', record.uid, { path: '/news', expectedUpdatedAt: record.updated_at })).rejects.toThrow()
    expect(db.prepare("SELECT COUNT(*) AS n FROM operation_logs WHERE module = 'navigation'").get()!.n).toBeGreaterThan(0)
    for (const tag of ['public:navigation', 'public:layout', 'public:home']) {
      expect(db.prepare('SELECT generation FROM cache_generations WHERE tag = ?').get(tag)!.generation).toBe(2)
    }
  })
  it.each(['/news?f=bad!', '/news?category=a&category=b', '/news?unknown=中文', '/news?category=' + '中'.repeat(65)])('rejects a malformed button without a partial write: %s', async path => {
    await expect(service.create('navigation', navigation(path))).rejects.toThrow('INVALID_NAVIGATION_PATH')
    expect(db.prepare('SELECT COUNT(*) AS n FROM navigation_items').get()!.n).toBe(0)
  })
})
