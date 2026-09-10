export const PUBLIC_PROFILE_LINK_COLUMNS = 'orcid, personal_homepage, google_scholar, dblp, github, cnki, orcid_value, personal_homepage_value, google_scholar_value, dblp_value, github_value, cnki_value'
export const PUBLIC_CONTENT_ORDER = Object.freeze({
  profiles: 'sort_order ASC, id ASC',
  publications: 'year DESC, sort_order ASC, id ASC',
  projects: 'start_date DESC, sort_order ASC, id ASC',
  research_interests: 'created_at DESC, sort_order ASC, id ASC',
  news: 'published_at DESC, sort_order ASC, id ASC',
})
export const PUBLIC_CONTENT_BASE = Object.freeze({
  profiles: ["visibility = 'public'", 'is_active = 1'],
  publications: ["visibility = 'public'"], projects: ["visibility = 'public'"], research_interests: ["visibility = 'public'"],
  news: ["visibility = 'public'", 'published_at IS NOT NULL', 'published_at <= ?'],
})
export const PUBLIC_PROFILE_CONTACT_SQL = `CASE WHEN contact_visibility = 'public' THEN email ELSE NULL END AS public_email,
  CASE WHEN contact_visibility = 'public' THEN phone ELSE NULL END AS public_phone,
  CASE WHEN contact_visibility = 'public' THEN office ELSE NULL END AS public_office`

/** The homepage and its author helpers select the first public, active, featured teacher. */
export const PUBLIC_HOME_PROFILE_BASE = Object.freeze([...PUBLIC_CONTENT_BASE.profiles, 'is_featured = 1'])
