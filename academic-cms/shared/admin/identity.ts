import type { AuthModule } from '../enums/auth'

export const ADMIN_UID_MAX_LENGTH = 128
export const ADMIN_UID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:._-]{0,127}$/u

export const ADMIN_IDENTITY_RESOURCES = {
  profiles: { prefix: 'profiles', module: 'profiles', path: '/admin/profiles', route: 'record' },
  research_interests: { prefix: 'research_interests', module: 'research_interests', path: '/admin/research', route: 'record' },
  publications: { prefix: 'publications', module: 'publications', path: '/admin/publications', route: 'record' },
  projects: { prefix: 'projects', module: 'projects', path: '/admin/projects', route: 'record' },
  patents: { prefix: 'patents', module: 'patents', path: '/admin/patents', route: 'record' },
  students: { prefix: 'students', module: 'students', path: '/admin/students', route: 'record' },
  student_category_displays: { prefix: 'student_category_displays', module: 'student_category_displays', path: '/admin/student-categories', route: 'record' },
  courses: { prefix: 'courses', module: 'courses', path: '/admin/courses', route: 'record' },
  messages: { prefix: 'messages', module: 'messages', path: '/admin/messages', route: 'record' },
  'site-settings': { prefix: 'site-settings', module: 'site_settings', path: '/admin/settings/site', route: 'query' },
  'global-settings': { prefix: 'global-settings', module: 'global_settings', path: '/admin/settings/global', route: 'query' },
  navigation: { prefix: 'navigation', module: 'navigation_items', path: '/admin/navigation', route: 'query' },
  news: { prefix: 'news', module: 'news', path: '/admin/news', route: 'query' },
  media: { prefix: 'media', module: 'media_assets', path: '/admin/media', route: 'query' },
  translation: { prefix: 'translation', module: 'translation_cache', path: '/admin/translation', route: 'query' },
  'auth-users': { prefix: 'user', module: 'auth', path: '/admin/auth', route: 'auth-users' },
  'auth-roles': { prefix: 'role', module: 'auth', path: '/admin/auth', route: 'auth-roles' },
} as const satisfies Record<string, {
  readonly prefix: string
  readonly module: AuthModule
  readonly path: string
  readonly route: 'record' | 'query' | 'auth-users' | 'auth-roles'
}>

export type AdminIdentityResource = keyof typeof ADMIN_IDENTITY_RESOURCES
export type AdminDuplicateMode = 'hard' | 'warning'

export interface AdminDuplicateRule {
  readonly resource: AdminIdentityResource
  readonly field: string
  readonly label: string
  readonly mode: AdminDuplicateMode
}

export interface AdminDuplicateMatch {
  readonly uid: string
  readonly title: string
  readonly adminPath: string
}

export interface AdminDuplicateCheckResult {
  readonly resource: AdminIdentityResource
  readonly field: string
  readonly mode: AdminDuplicateMode
  readonly matches: readonly AdminDuplicateMatch[]
  readonly truncated: boolean
}

const BUSINESS_DUPLICATE_RULES = Object.freeze([
  { resource: 'profiles', field: 'name', label: '中文姓名', mode: 'warning' },
  { resource: 'profiles', field: 'orcid', label: 'ORCID', mode: 'warning' },
  { resource: 'research_interests', field: 'name', label: '中文名称', mode: 'warning' },
  { resource: 'publications', field: 'doi', label: 'DOI', mode: 'warning' },
  { resource: 'publications', field: 'title', label: '论文题名', mode: 'warning' },
  { resource: 'projects', field: 'project_number', label: '项目编号', mode: 'warning' },
  { resource: 'projects', field: 'name', label: '项目名称', mode: 'warning' },
  { resource: 'patents', field: 'application_number', label: '申请号', mode: 'warning' },
  { resource: 'patents', field: 'grant_number', label: '授权号', mode: 'warning' },
  { resource: 'patents', field: 'name', label: '名称', mode: 'warning' },
  { resource: 'students', field: 'student_id', label: '学号', mode: 'warning' },
  { resource: 'students', field: 'name', label: '中文姓名', mode: 'warning' },
  { resource: 'student_category_displays', field: 'key', label: '分类 Key', mode: 'hard' },
  { resource: 'courses', field: 'name', label: '课程名称', mode: 'warning' },
  { resource: 'site-settings', field: 'site_name', label: '中文站点名称', mode: 'warning' },
  { resource: 'navigation', field: 'title', label: '中文文本', mode: 'warning' },
  { resource: 'navigation', field: 'path', label: '链接路径', mode: 'warning' },
  { resource: 'news', field: 'slug', label: 'Slug', mode: 'hard' },
  { resource: 'news', field: 'title', label: '标题', mode: 'warning' },
  { resource: 'auth-users', field: 'username', label: '用户名', mode: 'hard' },
  { resource: 'auth-roles', field: 'name', label: '角色名称', mode: 'hard' },
] as const satisfies readonly AdminDuplicateRule[])

const resourceSet = new Set<string>(Object.keys(ADMIN_IDENTITY_RESOURCES))

export function isAdminIdentityResource(value: unknown): value is AdminIdentityResource {
  return typeof value === 'string' && resourceSet.has(value)
}

export function normalizeAdminUid(value: unknown): string {
  const normalized = String(value ?? '').normalize('NFC').trim()
  if (!ADMIN_UID_PATTERN.test(normalized)) throw new Error('INVALID_UID')
  return normalized
}

export function suggestedAdminUid(resource: AdminIdentityResource, randomUid?: string): string {
  const random = randomUid ?? crypto.randomUUID()
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(random)) throw new Error('INVALID_UID_RANDOM_PART')
  return normalizeAdminUid(`${ADMIN_IDENTITY_RESOURCES[resource].prefix}:${random}`)
}

export function adminDuplicateRule(resource: AdminIdentityResource, field: string): AdminDuplicateRule | null {
  if (field === 'uid') return Object.freeze({ resource, field, label: '数据库 UID', mode: 'hard' })
  return BUSINESS_DUPLICATE_RULES.find(rule => rule.resource === resource && rule.field === field) ?? null
}

export function adminIdentityEditPath(resource: AdminIdentityResource, uidValue: unknown): string {
  const uid = normalizeAdminUid(uidValue)
  const definition = ADMIN_IDENTITY_RESOURCES[resource]
  const encoded = encodeURIComponent(uid)
  if (definition.route === 'record') return `${definition.path}/${encoded}`
  if (definition.route === 'auth-users') return `${definition.path}?tab=users&edit=${encoded}`
  if (definition.route === 'auth-roles') return `${definition.path}?tab=roles&edit=${encoded}`
  return `${definition.path}?edit=${encoded}`
}
