import { DatabaseSync } from 'node:sqlite'
import { createRequire } from 'node:module'
import { resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadMigrations, applyMigrations } from '../../scripts/db/migrations.mjs'

export const root = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const temporaryRoot = resolve(root, '.tmp')
const compiledRoot = process.env.STAGE4_CORE_OUTPUT
  ? resolve(process.env.STAGE4_CORE_OUTPUT)
  : resolve(temporaryRoot, 'stage4-core')
if (compiledRoot !== temporaryRoot && !compiledRoot.startsWith(`${temporaryRoot}${sep}`)) {
  throw new Error('STAGE4_CORE_OUTPUT must stay inside the project temporary directory')
}
const require = createRequire(import.meta.url)
export const load = name => require(resolve(compiledRoot, name))
export const core = {
  ...load('db/query.js'), ...load('db/contracts.js'), ...load('db/read-plans.js'),
  ...load('db/adapters/sqlite.js'), ...load('db/adapters/d1.js'),
  ...load('shared/utils/public-path.js'), ...load('shared/utils/http-etag.js'),
  ...load('server/i18n/errors.js'), ...load('server/i18n/source-ref.js'), ...load('server/i18n/fingerprint.js'),
  ...load('server/services/i18n/translation-store.js'), ...load('server/services/i18n/translation-reader.js'),
  ...load('server/cache/errors.js'), ...load('server/cache/generation-store.js'), ...load('server/cache/invalidation-map.js'),
  ...load('server/cache/value-cache.js'), ...load('server/cache/memory-adapter.js'), ...load('server/cache/public-cache.js'), ...load('server/cache/keys.js'),
  ...load('server/media/errors.js'), ...load('server/media/grants.js'),
  ...load('server/services/media/media-catalog-store.js'), ...load('server/services/media/media-service.js'),
  ...load('server/view-model/serializer.js'),
  ...load('server/services/public/errors.js'), ...load('server/services/public/public-home-store.js'),
  ...load('server/services/public/public-home-service.js'),
}
export const migrations = await loadMigrations(resolve(root, 'migrations'))

class D1ProtocolDouble {
  constructor(db) { this.db = db }
  prepare(sql) {
    const db = this.db
    const build = params => {
      const execute = () => {
        const statement = db.prepare(sql)
        const rows = statement.all(...params)
        const readOnly = /^\s*(SELECT|WITH|EXPLAIN|PRAGMA)\b/i.test(sql)
        const meta = db.prepare('SELECT changes() changes, last_insert_rowid() last_row_id').get()
        return { success: true, results: rows, meta: { changes: readOnly ? 0 : Number(meta.changes), last_row_id: Number(meta.last_row_id) } }
      }
      return { bind: (...values) => build(values), all: async () => execute(), run: async () => execute(), _execute: execute }
    }
    return build([])
  }
  async batch(statements) {
    try {
      this.db.exec('BEGIN IMMEDIATE')
      const results = statements.map(statement => statement._execute())
      this.db.exec('COMMIT')
      return results
    }
    catch (error) {
      if (this.db.isTransaction) this.db.exec('ROLLBACK')
      throw new Error(`D1_ERROR: ${error.message}`, { cause: error })
    }
  }
}

function syncConnection(db) {
  return { prepare: sql => db.prepare(sql), exec: sql => db.exec(sql), get inTransaction() { return db.isTransaction } }
}

export function createHarness(kind = 'sqlite') {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  const connection = syncConnection(db)
  applyMigrations(connection, migrations)
  const adapter = kind === 'sqlite' ? new core.SqliteAdapter(connection) : new core.D1Adapter(new D1ProtocolDouble(db))
  return { db, adapter, close() { db.close() } }
}

export function recordingAdapter(adapter) {
  const commands = []
  return {
    kind: adapter.kind,
    metrics: adapter.metrics,
    commands,
    async execute(command) { commands.push({ group: 'execute', command }); return adapter.execute(command) },
    async batch(batch) { commands.push({ group: 'batch', commands: [...batch] }); return adapter.batch(batch) },
  }
}

export function insert(db, sql, ...params) { return db.prepare(sql).run(...params) }
export function iso(ms = Date.UTC(2026, 7, 29, 0, 0, 0)) { return new Date(ms).toISOString() }

export async function seedPublicHome(h, options = {}) {
  const at = options.at ?? iso()
  const later = iso(Date.parse(at) + 60_000)
  const future = iso(Date.parse(at) + 86_400_000)
  for (const [uid, key, title, mime, size] of [
    ['media:logo', 'site/logo.png', 'Site logo', 'image/png', 512],
    ['media:favicon', 'site/favicon.png', 'Favicon', 'image/png', 256],
    ['media:og', 'site/og.jpg', 'Open graph', 'image/jpeg', 4096],
    ['media:avatar', 'profiles/lead.jpg', 'Lead avatar', 'image/jpeg', 2048],
    ['media:cover', 'news/launch.jpg', 'News cover', 'image/jpeg', 4096],
  ]) {
    insert(h.db, `INSERT INTO media_assets
      (uid, created_at, updated_at, object_key, title, mime_type, size, storage_kind, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'local', 'active')`, uid, at, at, key, title, mime, size)
  }
  insert(h.db, `INSERT INTO profiles
    (uid, created_at, updated_at, name, name_en, role, title, organization, avatar_key, bio, bio_en,
     contact_visibility, visibility, is_active, is_featured, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'hidden', 'public', 1, 1, 1)`,
  'profile:lead', at, at, '张明', 'Ming Zhang', '负责人', '教授', '示例大学', 'profiles/lead.jpg',
  '研究方向聚焦可靠系统与数据方法。', 'Research on reliable systems and data methods.')
  insert(h.db, `INSERT INTO site_settings
    (uid, created_at, updated_at, is_active, site_name, site_name_en, hero_title, hero_subtitle,
     logo_key, favicon_key, og_image_key, seo_title, seo_description, seo_keywords, footer_text,
     homepage_profile_uid, homepage_publication_limit, homepage_news_limit)
    VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 6, 5)`,
  'site:main', at, at, '可靠系统实验室', 'Reliable Systems Lab', '面向真实世界的可靠智能系统',
  '连接系统方法、可信数据与开放学术合作。', 'site/logo.png', 'site/favicon.png', 'site/og.jpg',
  '可靠系统实验室', '研究方向、精选论文、科研项目与团队动态。', '可靠系统, 数据系统, 人工智能',
  '<strong>开放、严谨、可复现。</strong>', 'profile:lead')
  const nav = [
    ['nav:home', '首页', 'Home', 'route', 'home', null, null, 'header', 'default', 1],
    ['nav:research', '研究方向', 'Research', 'route', 'research', null, 'research', 'header', 'default', 2],
    ['nav:papers', '论文成果', 'Publications', 'route', 'publications', null, 'publications', 'header', 'default', 3],
    ['nav:contact', '学术合作', 'Collaborate', 'external', null, 'https://example.org/collaborate', null, 'hero', 'primary', 4],
    ['nav:footer', '课程教学', 'Teaching', 'route', 'courses', null, null, 'footer', 'default', 5],
  ]
  for (const row of nav) insert(h.db, `INSERT INTO navigation_items
    (uid, created_at, updated_at, title, title_en, kind, url_name, path, fragment, location, style, visibility, enabled, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'public', 1, ?)`, row[0], at, at, ...row.slice(1))
  insert(h.db, `INSERT INTO navigation_items
    (uid, created_at, updated_at, title, path, visibility, enabled, sort_order)
    VALUES ('nav:hidden', ?, ?, '内部', '/secret', 'hidden', 1, 99)`, at, at)

  insert(h.db, `INSERT INTO research_interests
    (uid, created_at, updated_at, name, name_en, description, sort_order, visibility)
    VALUES ('research:reliable', ?, ?, '可靠分布式系统', 'Reliable distributed systems', '从故障、并发和可验证性出发研究系统行为。', 1, 'public')`, at, at)
  insert(h.db, `INSERT INTO research_interests
    (uid, created_at, updated_at, name, description, sort_order, visibility)
    VALUES ('research:hidden', ?, ?, '内部方向', '不可见', 2, 'hidden')`, at, at)

  insert(h.db, `INSERT INTO publications
    (uid, created_at, updated_at, title, authors, venue, year, doi, url, publication_type, author_role, display_tags,
     pdf_visibility, visibility, is_featured, sort_order)
    VALUES ('publication:one', ?, ?, '边缘环境中的一致性协议', '张明; 李华', '系统学报', 2026,
      '10.1234/example.2026.1', 'https://example.org/paper', '期刊论文', '通讯作者', '边缘计算, 一致性; 可验证系统',
      'public', 'public', 1, 1)`, at, later)
  insert(h.db, `INSERT INTO publications
    (uid, created_at, updated_at, title, visibility, is_featured, sort_order)
    VALUES ('publication:not-featured', ?, ?, '普通论文', 'public', 0, 2)`, at, at)
  insert(h.db, `INSERT INTO publications
    (uid, created_at, updated_at, title, visibility, is_featured, sort_order)
    VALUES ('publication:hidden', ?, ?, '隐藏论文', 'hidden', 1, 3)`, at, at)

  insert(h.db, `INSERT INTO projects
    (uid, created_at, updated_at, name, source, fund_name, project_role, status, summary, visibility, is_featured, sort_order)
    VALUES ('project:one', ?, ?, '可信边缘计算基础', '国家自然科学基金', '重点项目', '主持', '在研',
      '研究资源受限边缘环境中的可靠计算基础。', 'public', 1, 1)`, at, at)

  insert(h.db, `INSERT INTO news
    (uid, created_at, updated_at, title, slug, category, cover_key, content_format, published_at, visibility, is_featured, sort_order)
    VALUES ('news:one', ?, ?, '实验室发布首个开放数据集', 'open-dataset', '科研动态', 'news/launch.jpg', 'plain', ?, 'public', 1, 1)`, at, at, at)
  insert(h.db, `INSERT INTO news
    (uid, created_at, updated_at, title, slug, content_format, published_at, visibility, is_featured, sort_order)
    VALUES ('news:future', ?, ?, '未来动态', 'future-news', 'plain', ?, 'public', 1, 2)`, at, at, future)
  insert(h.db, `INSERT INTO news
    (uid, created_at, updated_at, title, slug, content_format, published_at, visibility, is_featured, sort_order)
    VALUES ('news:hidden', ?, ?, '隐藏动态', 'hidden-news', 'plain', ?, 'hidden', 1, 3)`, at, at, at)

  const translations = [
    ['site_settings', 'site:main', 'hero_title', '面向真实世界的可靠智能系统', 'Reliable intelligent systems for the real world'],
    ['site_settings', 'site:main', 'hero_subtitle', '连接系统方法、可信数据与开放学术合作。', 'Connecting systems methods, trustworthy data, and open scholarship.'],
    ['research_interests', 'research:reliable', 'description', '从故障、并发和可验证性出发研究系统行为。', 'Studying system behavior through failures, concurrency, and verifiability.'],
    ['publications', 'publication:one', 'title', '边缘环境中的一致性协议', 'Consistency protocols at the edge'],
    ['projects', 'project:one', 'name', '可信边缘计算基础', 'Foundations of trustworthy edge computing'],
    ['news', 'news:one', 'title', '实验室发布首个开放数据集', 'The lab releases its first open dataset'],
  ]
  for (const [entity, uid, field, source, translated] of translations) {
    const ref = core.buildSourceRefKey({ entity, uid, field })
    const hash = await core.translationSourceHash(source)
    insert(h.db, `INSERT INTO translation_cache
      (uid, created_at, updated_at, source_hash, source_ref_key, source_text, source_lang, target_lang,
       translated_text, provider, status, is_manual, is_current, source_refs)
      VALUES (?, ?, ?, ?, ?, ?, 'zh', 'en', ?, 'fixture', 'success', 0, 1, '[]')`,
    `translation:${entity}:${field}`, at, at, hash, ref, source, translated)
  }
}

export function createHomeService(adapter, clock, options = {}) {
  const translations = new core.TranslationBatchReader(new core.TranslationStore(adapter))
  const media = new core.MediaService(
    new core.MediaCatalogStore(adapter),
    {},
    new core.MediaGrantService('m'.repeat(64), {
      publicSeconds: options.publicGrantSeconds ?? 60,
      privateSeconds: 60,
      clock: () => new Date(clock.value),
    }),
  )
  const memory = new core.MemoryCacheAdapter({
    now: () => clock.value,
    maxEntries: 64,
    maxBytes: 2_000_000,
    maxEntryBytes: 512_000,
  })
  const cache = new core.PublicCacheService(memory, new core.CacheGenerationStore(adapter), {
    now: () => new Date(clock.value),
    coordinator: core.createPublicCacheCoordinator(),
    valueCache: new core.PublicValueCache(),
  })
  return {
    service: new core.PublicHomeService(adapter, translations, media, cache, {
      defaultSiteName: options.defaultSiteName ?? 'Academic CMS',
      publicMediaGrantSeconds: options.publicGrantSeconds ?? 60,
      now: () => new Date(clock.value),
    }),
    memory,
  }
}
