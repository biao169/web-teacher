import { DatabaseSync } from 'node:sqlite'
import { resolve } from 'node:path'
import { Window } from 'happy-dom'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SqliteAdapter } from '../../db/adapters/sqlite'
import { applyMigrations, loadMigrations } from '../../scripts/db/migrations.mjs'
import { PublicContentStore } from '../../server/services/public/public-content-store'
import { parsePublicListRequest } from '../../server/services/public/public-query'
import { parseSitemapRequest, publicSitemap } from '../../server/services/public/public-sitemap'

const migrations = await loadMigrations(resolve('migrations'))
const now = '2026-09-06T00:00:00.000Z'
const origin = 'https://site.example'
let db: DatabaseSync
let adapter: SqliteAdapter
const domWindow = new Window()
afterAll(() => domWindow.close())
const document = (source: string) => new domWindow.DOMParser().parseFromString(source, 'application/xml')
const locations = (source: string) => Array.from(document(source).querySelectorAll('loc'), node => node.textContent)
beforeEach(() => {
  db = new DatabaseSync(':memory:')
  const connection = { prepare: (sql: string) => db.prepare(sql), exec: (sql: string) => db.exec(sql), get inTransaction() { return db.isTransaction } }
  applyMigrations(connection, migrations)
  adapter = new SqliteAdapter(connection)
})
afterEach(() => db.close())

describe('dynamic sitemap on the migrated database', () => {
  it('covers the eleven public entry pages in both languages and reciprocal hreflang', async () => {
    const source = await publicSitemap(adapter, origin, parseSitemapRequest({ section: 'static' }), now)
    const parsed = document(source)
    expect(parsed.querySelectorAll('url')).toHaveLength(22)
    expect(parsed.querySelectorAll('parsererror')).toHaveLength(0)
    const urls = locations(source)
    expect(urls).toContain(`${origin}/en/publications/featured`)
    expect(urls).toContain(`${origin}/zh/contact`)
    expect(urls.some(url => /admin|account|login|setup|register|media|\?/u.test(url))).toBe(false)
    for (const entry of parsed.querySelectorAll('url')) expect(entry.getElementsByTagName('xhtml:link')).toHaveLength(3)
    expect(adapter.metrics.calls).toBe(0)
    expect(source).not.toContain('<lastmod>')
  })
  it.each([
    ['team', 'profiles', 'name'], ['publications', 'publications', 'title'], ['projects', 'projects', 'name'],
    ['research', 'research_interests', 'name'], ['patents', 'patents', 'name'], ['students', 'students', 'name'], ['courses', 'courses', 'name'],
  ])('%s includes only public records and exposes no private fields', async (module, table, field) => {
    for (const visibility of ['public', 'authenticated', 'staff', 'owner', 'hidden']) {
      db.prepare(`INSERT INTO ${table} (uid, ${field}, visibility) VALUES (?, ?, ?)`).run(`${module}:${visibility}`, 'PRIVATE_TITLE_MUST_NOT_LEAK', visibility)
    }
    if (table === 'profiles') db.prepare('UPDATE profiles SET is_active = 1').run()
    const source = await publicSitemap(adapter, origin, parseSitemapRequest({ section: module, page: '1' }), now)
    expect(locations(source)).toEqual([`${origin}/zh/${module}/${module}%3Apublic`, `${origin}/en/${module}/${module}%3Apublic`])
    expect(source).not.toContain('PRIVATE_TITLE')
    const shards = await new PublicContentStore(adapter).sitemapShards(now)
    expect(shards).toEqual([{ module, page: 1 }])
  })
  it('excludes inactive teachers and immediately reflects visibility changes', async () => {
    db.prepare("INSERT INTO profiles (uid,name,is_active,visibility) VALUES ('profile:one','One',0,'public')").run()
    expect(await new PublicContentStore(adapter).sitemapShards(now)).toEqual([])
    db.prepare("UPDATE profiles SET is_active = 1 WHERE uid = 'profile:one'").run()
    expect(await new PublicContentStore(adapter).sitemapShards(now)).toEqual([{ module: 'team', page: 1 }])
    db.prepare("UPDATE profiles SET visibility = 'hidden' WHERE uid = 'profile:one'").run()
    await expect(publicSitemap(adapter, origin, parseSitemapRequest({ section: 'team', page: '1' }), now)).rejects.toMatchObject({ code: 'PUBLIC_NOT_FOUND' })
  })
  it('matches news list visibility and publication boundaries, using slug instead of UID', async () => {
    for (const [slug, publishedAt, visibility] of [
      ['past', '2026-01-01T00:00:00.000Z', 'public'], ['now', now, 'public'],
      ['draft', null, 'public'], ['scheduled', '2026-09-07T00:00:00.000Z', 'public'], ['hidden', now, 'hidden'],
    ]) db.prepare('INSERT INTO news (uid,title,slug,published_at,visibility) VALUES (?,?,?,?,?)').run(`news:${slug}`, 'Title', slug, publishedAt, visibility)
    const source = await publicSitemap(adapter, origin, parseSitemapRequest({ section: 'news', page: '1' }), now)
    expect(locations(source)).toEqual(['past', 'now'].flatMap(slug => [`${origin}/zh/news/${slug}`, `${origin}/en/news/${slug}`]))
    const list = await new PublicContentStore(adapter).news(parsePublicListRequest({ locale: 'zh' }, ['category']), now)
    expect(list.items.map(item => item.slug).sort()).toEqual(['now', 'past'])
    const later = await publicSitemap(adapter, origin, parseSitemapRequest({ section: 'news', page: '1' }), '2026-09-07T00:00:00.000Z')
    expect(locations(later)).toContain(`${origin}/zh/news/scheduled`)
  })
  it('splits over 1000 records into stable primary-key windows without loss after deletion', async () => {
    db.exec('BEGIN')
    const insert = db.prepare('INSERT INTO publications (uid,title,visibility) VALUES (?,?,?)')
    for (let i = 1; i <= 1001; i++) insert.run(`paper:${i}`, 'Paper', 'public')
    db.exec('COMMIT')
    const index = await publicSitemap(adapter, origin, parseSitemapRequest({}), now)
    expect(index).toContain('section=publications&amp;page=2')
    expect(locations(index)).toEqual([`${origin}/sitemap.xml?section=static`, `${origin}/sitemap.xml?section=publications&page=1`, `${origin}/sitemap.xml?section=publications&page=2`])
    const first = locations(await publicSitemap(adapter, origin, parseSitemapRequest({ section: 'publications', page: '1' }), now))
    const second = locations(await publicSitemap(adapter, origin, parseSitemapRequest({ section: 'publications', page: '2' }), now))
    expect(first).toHaveLength(2000)
    expect(second).toHaveLength(2)
    expect(new Set([...first, ...second]).size).toBe(2002)
    db.prepare('DELETE FROM publications WHERE id = 1').run()
    expect(locations(await publicSitemap(adapter, origin, parseSitemapRequest({ section: 'publications', page: '2' }), now))).toEqual(second)
  })
})
