import { PUBLIC_PROFILE_LINK_COLUMNS, PUBLIC_CONTENT_ORDER, PUBLIC_CONTENT_BASE, PUBLIC_HOME_PROFILE_BASE, PUBLIC_PROFILE_CONTACT_SQL } from './public-content-rules'
import { decodeRow, timestamp } from './codec'
import { DATABASE_LIMITS, type DatabaseAdapter, type SqlCommand } from './contracts'
import { DatabaseError } from './errors'
import type { Row } from './models'
import { read } from './query'

export const PUBLIC_HOME_BATCH_SIZE = 8
export const PUBLIC_NAVIGATION_LIMIT = 200

/** Read one extra row so stores reject overflow instead of silently losing links. */
export function publicNavigationRead(): SqlCommand {
  return read(`SELECT uid, updated_at, title, title_en, kind, url_name, path, fragment,
    icon, style, location FROM navigation_items
    WHERE visibility = 'public' AND enabled = 1 AND location IN ('header', 'hero', 'footer')
    ORDER BY sort_order, id LIMIT ${PUBLIC_NAVIGATION_LIMIT + 1}`)
}

/** Rank IDs before selecting featured records; never rank long bodies. */
function homeRows(table: Exclude<keyof typeof PUBLIC_CONTENT_ORDER, 'profiles'>, select: string, limit: string, now: string, featured = true): SqlCommand {
  const timed = table === 'news'
  return read(`WITH ranked AS (
    SELECT id AS ranked_id, ROW_NUMBER() OVER (ORDER BY ${PUBLIC_CONTENT_ORDER[table]}) AS position,
      COUNT(*) OVER () AS total_public FROM ${table} WHERE ${PUBLIC_CONTENT_BASE[table].join(' AND ')}
    ), chosen AS (
      SELECT ranked_id, position, total_public FROM ranked JOIN ${table} ON id = ranked_id
      ${featured ? 'WHERE is_featured = 1' : ''} ORDER BY position LIMIT ${limit}
    ) SELECT ${select}, total_public - position + 1 AS display_number
      FROM chosen JOIN ${table} ON id = ranked_id ORDER BY position`, timed ? [now] : [])
}

/** One atomic batch: bounded public rows, permission-projected contact fields and true totals. */
export function buildHomeReadPlan(now = new Date().toISOString()): SqlCommand[] {
  timestamp(now)
  return [
    read(`SELECT uid, updated_at, site_name, site_name_en, hero_title, hero_subtitle,
      logo_key, favicon_key, og_image_key, seo_title, seo_description, seo_keywords,
      footer_text, homepage_profile_uid, homepage_publication_limit, homepage_news_limit
      FROM site_settings WHERE is_active = 1 ORDER BY updated_at DESC, id DESC LIMIT 1`),
    publicNavigationRead(),
    read(`SELECT uid, updated_at, name, name_en, role, title, organization, lab, avatar_key, bio, bio_en, ${PUBLIC_PROFILE_LINK_COLUMNS},
      ${PUBLIC_PROFILE_CONTACT_SQL} FROM profiles WHERE ${PUBLIC_HOME_PROFILE_BASE.join(' AND ')}
      ORDER BY ${PUBLIC_CONTENT_ORDER.profiles} LIMIT 1`),
    homeRows('research_interests', 'uid, updated_at, name, name_en, description', '20', now, false),
    homeRows('publications', 'uid, updated_at, title, authors, venue, year, doi, url, publication_type, author_role, index_type, display_tags',
      `MIN(20, MAX(0, COALESCE((SELECT homepage_publication_limit FROM site_settings WHERE is_active = 1 ORDER BY updated_at DESC, id DESC LIMIT 1), 6)))`, now),
    homeRows('projects', 'uid, updated_at, name, source, fund_name, project_number, principal, start_date, end_date, project_role, status, amount', '6', now),
    homeRows('news', 'uid, updated_at, title, slug, category, cover_key, published_at',
      `MIN(20, MAX(0, COALESCE((SELECT homepage_news_limit FROM site_settings WHERE is_active = 1 ORDER BY updated_at DESC, id DESC LIMIT 1), 5)))`, now),
    read(`SELECT
      (SELECT COUNT(*) FROM research_interests WHERE ${PUBLIC_CONTENT_BASE.research_interests.join(' AND ')}) AS research,
      (SELECT COUNT(*) FROM publications WHERE ${PUBLIC_CONTENT_BASE.publications.join(' AND ')}) AS publications,
      (SELECT COUNT(*) FROM projects WHERE ${PUBLIC_CONTENT_BASE.projects.join(' AND ')}) AS projects,
      (SELECT COUNT(*) FROM news WHERE ${PUBLIC_CONTENT_BASE.news.join(' AND ')}) AS news,
      COALESCE((SELECT generation FROM cache_generations WHERE tag = 'public:publications'), 0) AS publication_generation,
      COALESCE((SELECT generation FROM cache_generations WHERE tag = 'public:translations'), 0) AS translation_generation`, [now]),
  ]
}
export interface TranslationReference { sourceRefKey: string; sourceHash: string }
export function buildTranslationReadPlan(references: readonly TranslationReference[], targetLang: string): SqlCommand[] {
  if (references.length > DATABASE_LIMITS.bulkKeys) throw new DatabaseError('DB_LIMIT', 'Too many translation references')
  if (!/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,2}$/.test(targetLang)) throw new DatabaseError('DB_INPUT', 'Invalid target language')
  const unique = new Map<string, TranslationReference>()
  for (const ref of references) {
    if (typeof ref.sourceRefKey !== 'string' || !ref.sourceRefKey.trim() || ref.sourceRefKey.length > 512 || !/^[a-f0-9]{64}$/.test(ref.sourceHash)) throw new DatabaseError('DB_INPUT', 'Invalid translation reference')
    if (unique.has(ref.sourceRefKey) && unique.get(ref.sourceRefKey)!.sourceHash !== ref.sourceHash) throw new DatabaseError('DB_INPUT', 'Conflicting hashes for one source reference')
    unique.set(ref.sourceRefKey, ref)
  }
  const refs = [...unique.values()], commands: SqlCommand[] = []
  for (let offset = 0; offset < refs.length; offset += 45) {
    const chunk = refs.slice(offset, offset + 45)
    commands.push(read(`WITH wanted(source_ref_key, source_hash) AS (VALUES ${chunk.map(() => '(?, ?)').join(', ')}) SELECT c.* FROM wanted w JOIN translation_cache c ON c.source_ref_key = w.source_ref_key AND c.source_hash = w.source_hash WHERE c.target_lang = ? AND c.is_current = 1 AND c.status = 'success'`, [...chunk.flatMap(ref => [ref.sourceRefKey, ref.sourceHash]), targetLang]))
  }
  return commands
}
export async function readCurrentTranslations(adapter: DatabaseAdapter, references: readonly TranslationReference[], targetLang: string): Promise<Map<string, Row<'translation_cache'>>> {
  const commands = buildTranslationReadPlan(references, targetLang)
  if (!commands.length) return new Map()
  const results = await adapter.batch(commands)
  const rows = results.flatMap(result => result.rows).map(row => decodeRow('translation_cache', row))
  return new Map(rows.map(row => [row.source_ref_key, row]))
}
