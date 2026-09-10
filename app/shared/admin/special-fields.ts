export type AdminSpecialFieldKind = 'media' | 'suggestion' | 'relation' | 'richtext'

export interface AdminSpecialFieldSpec {
  readonly module: string
  readonly field: string
  readonly kind: AdminSpecialFieldKind
  readonly mediaCategory?: string
  readonly suggestionKey?: string
  readonly multiple?: boolean
  readonly relationModule?: string
  readonly accepts?: readonly string[]
}

export const ADMIN_SPECIAL_FIELDS: readonly AdminSpecialFieldSpec[] = Object.freeze([
  { module: 'site_settings', field: 'logo_key', kind: 'media', mediaCategory: 'brand', accepts: ['image/*'] },
  { module: 'site_settings', field: 'favicon_key', kind: 'media', mediaCategory: 'brand', accepts: ['image/*'] },
  { module: 'site_settings', field: 'og_image_key', kind: 'media', mediaCategory: 'brand', accepts: ['image/*'] },
  { module: 'site_settings', field: 'homepage_profile_uid', kind: 'relation', relationModule: 'profiles' },
  { module: 'profiles', field: 'avatar_key', kind: 'media', mediaCategory: 'avatar', accepts: ['image/*'] },
  { module: 'profiles', field: 'role', kind: 'suggestion', suggestionKey: 'profiles.role' },
  { module: 'profiles', field: 'title', kind: 'suggestion', suggestionKey: 'profiles.title' },
  { module: 'profiles', field: 'organization', kind: 'suggestion', suggestionKey: 'profiles.organization' },
  { module: 'profiles', field: 'lab', kind: 'suggestion', suggestionKey: 'profiles.lab' },
  { module: 'publications', field: 'venue', kind: 'suggestion', suggestionKey: 'publications.venue' },
  { module: 'publications', field: 'authors', kind: 'suggestion', suggestionKey: 'publications.authors', multiple: true },
  { module: 'publications', field: 'publication_type', kind: 'suggestion', suggestionKey: 'publications.publication_type', multiple: true },
  { module: 'publications', field: 'author_role', kind: 'suggestion', suggestionKey: 'publications.author_role', multiple: true },
  { module: 'publications', field: 'corresponding_authors', kind: 'suggestion', suggestionKey: 'publications.corresponding_authors', multiple: true },
  { module: 'publications', field: 'index_type', kind: 'suggestion', suggestionKey: 'publications.index_type', multiple: true },
  { module: 'publications', field: 'display_tags', kind: 'suggestion', suggestionKey: 'publications.display_tags', multiple: true },
  { module: 'publications', field: 'keywords', kind: 'suggestion', suggestionKey: 'publications.keywords', multiple: true },
  { module: 'publications', field: 'pdf_key', kind: 'media', mediaCategory: 'publication', accepts: ['application/pdf'] },
  { module: 'projects', field: 'source', kind: 'suggestion', suggestionKey: 'projects.source' },
  { module: 'projects', field: 'fund_name', kind: 'suggestion', suggestionKey: 'projects.fund_name' },
  { module: 'projects', field: 'project_role', kind: 'suggestion', suggestionKey: 'projects.project_role', multiple: true },
  { module: 'projects', field: 'principal', kind: 'suggestion', suggestionKey: 'projects.principal' },
  { module: 'projects', field: 'members', kind: 'suggestion', suggestionKey: 'projects.members', multiple: true },
  { module: 'projects', field: 'status', kind: 'suggestion', suggestionKey: 'projects.status' },
  { module: 'patents', field: 'country', kind: 'suggestion', suggestionKey: 'patents.country' },
  { module: 'patents', field: 'patent_type', kind: 'suggestion', suggestionKey: 'patents.patent_type' },
  { module: 'patents', field: 'inventors', kind: 'suggestion', suggestionKey: 'patents.inventors', multiple: true },
  { module: 'patents', field: 'owner', kind: 'suggestion', suggestionKey: 'patents.owner', multiple: true },
  { module: 'patents', field: 'legal_status', kind: 'suggestion', suggestionKey: 'patents.legal_status' },
  { module: 'patents', field: 'certificate_key', kind: 'media', mediaCategory: 'certificate', accepts: ['image/*','application/pdf'] },
  { module: 'students', field: 'avatar_key', kind: 'media', mediaCategory: 'avatar', accepts: ['image/*'] },
  { module: 'students', field: 'degree', kind: 'suggestion', suggestionKey: 'students.degree' },
  { module: 'students', field: 'category', kind: 'suggestion', suggestionKey: 'students.category', multiple: true },
  { module: 'students', field: 'grade', kind: 'suggestion', suggestionKey: 'students.grade' },
  { module: 'students', field: 'direction', kind: 'suggestion', suggestionKey: 'students.direction', multiple: true },
  { module: 'students', field: 'status', kind: 'suggestion', suggestionKey: 'students.status' },
  { module: 'news', field: 'cover_key', kind: 'media', mediaCategory: 'cover', accepts: ['image/*'] },
  { module: 'news', field: 'category', kind: 'suggestion', suggestionKey: 'news.category', multiple: true },
  { module: 'news', field: 'content', kind: 'richtext' },
  { module: 'news', field: 'related_publication_uid', kind: 'relation', relationModule: 'publications' },
  { module: 'news', field: 'related_project_uid', kind: 'relation', relationModule: 'projects' },
  { module: 'news', field: 'related_student_uid', kind: 'relation', relationModule: 'students' },
  { module: 'courses', field: 'semester', kind: 'suggestion', suggestionKey: 'courses.semester' },
  { module: 'courses', field: 'audience', kind: 'suggestion', suggestionKey: 'courses.audience', multiple: true },
  { module: 'courses', field: 'syllabus_key', kind: 'media', mediaCategory: 'course', accepts: ['application/pdf'] },
  { module: 'courses', field: 'material_key', kind: 'media', mediaCategory: 'course', accepts: ['application/pdf','application/zip'] },
  { module: 'student_category_displays', field: 'keywords', kind: 'suggestion', suggestionKey: 'student_category_displays.keywords', multiple: true },
  { module: 'media_assets', field: 'category', kind: 'suggestion', suggestionKey: 'media_assets.category', multiple: true },
])

const INDEX = new Map(ADMIN_SPECIAL_FIELDS.map((spec) => [`${spec.module}.${spec.field}`, spec]))
const MODULE_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  'site-settings': 'site_settings',
  'global-settings': 'global_settings',
  navigation: 'navigation_items',
  media: 'media_assets',
  translation: 'translation_cache',
})

export function getAdminSpecialField(module: string, field: string): AdminSpecialFieldSpec | null {
  const canonicalModule = MODULE_ALIASES[module] ?? module
  return INDEX.get(`${canonicalModule}.${field}`) ?? null
}
