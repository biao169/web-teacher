import type { AuthModule, PermissionAction } from '../enums/auth'
import { safeApplicationRedirect } from '../utils/redirect'
import { adminContentRoute } from './content-modules'

export const ADMIN_GROUPS = [
  { id: 'overview', label: '总览', path: '/admin', order: 10 },
  { id: 'settings', label: '网站配置', path: '/admin/settings/site', order: 20 },
  { id: 'people', label: '人员与研究', path: '/admin/profiles', order: 30 },
  { id: 'research', label: '科研成果', path: '/admin/publications', order: 40 },
  { id: 'content', label: '内容与交流', path: '/admin/news', order: 50 },
  { id: 'resources', label: '资源与语言', path: '/admin/media', order: 60 },
  { id: 'system', label: '系统管理', path: '/admin/auth', order: 70 },
] as const
export type AdminGroupId = (typeof ADMIN_GROUPS)[number]['id']

export type AdminIconName =
  | 'dashboard' | 'site' | 'settings' | 'navigation' | 'profiles' | 'research'
  | 'students' | 'publications' | 'projects' | 'patents' | 'news' | 'courses'
  | 'messages' | 'media' | 'translation' | 'auth' | 'logs' | 'backup'

export interface AdminModuleDefinition {
  readonly module: AuthModule
  readonly title: string
  readonly shortTitle: string
  readonly description: string
  readonly group: AdminGroupId
  readonly path: string
  readonly icon: AdminIconName
  readonly order: number
  readonly exact?: boolean
  readonly implemented: boolean
}

export const ADMIN_MODULES: readonly AdminModuleDefinition[] = Object.freeze([
  { module: 'dashboard', title: '控制台', shortTitle: '控制台', description: '查看运行状态、待处理事项和可用管理模块。', group: 'overview', path: '/admin', icon: 'dashboard', order: 10, exact: true, implemented: true },
  { module: 'site_settings', title: '网站设置', shortTitle: '网站设置', description: '维护站点品牌、首页、SEO 和页脚内容。', group: 'settings', path: '/admin/settings/site', icon: 'site', order: 10, implemented: true },
  { module: 'global_settings', title: '全局设置', shortTitle: '全局设置', description: '维护注册、上传、PDF、翻译和元数据服务策略。', group: 'settings', path: '/admin/settings/global', icon: 'settings', order: 20, implemented: true },
  { module: 'navigation_items', title: '导航与按钮', shortTitle: '导航与按钮', description: '维护顶部导航、首页入口、页脚及后台入口。', group: 'settings', path: '/admin/navigation', icon: 'navigation', order: 30, implemented: true },
  { module: 'profiles', title: '教师与团队', shortTitle: '教师与团队', description: '维护教师、研究人员和团队成员资料。', group: 'people', path: '/admin/profiles', icon: 'profiles', order: 10, implemented: true },
  { module: 'research_interests', title: '研究方向', shortTitle: '研究方向', description: '维护研究主题、说明、可见性和排序。', group: 'people', path: '/admin/research', icon: 'research', order: 20, implemented: true },
  { module: 'students', title: '学生', shortTitle: '学生', description: '维护学生资料、培养状态、方向和毕业去向。', group: 'people', path: '/admin/students', icon: 'students', order: 30, implemented: true },
  { module: 'student_category_displays', title: '学生分类显示', shortTitle: '学生分类', description: '维护学生分组标签、关键词和排序规则。', group: 'people', path: '/admin/student-categories', icon: 'students', order: 40, implemented: true },
  { module: 'publications', title: '论文', shortTitle: '论文', description: '维护论文元数据、引用、PDF 和展示标签。', group: 'research', path: '/admin/publications', icon: 'publications', order: 10, implemented: true },
  { module: 'projects', title: '项目', shortTitle: '项目', description: '维护科研项目、经费、角色、成员和周期。', group: 'research', path: '/admin/projects', icon: 'projects', order: 20, implemented: true },
  { module: 'patents', title: '专利与软件著作', shortTitle: '专利与软著', description: '维护申请、授权、发明人、状态和证书。', group: 'research', path: '/admin/patents', icon: 'patents', order: 30, implemented: true },
  { module: 'news', title: '新闻动态', shortTitle: '新闻动态', description: '维护动态分类、封面、正文和关联内容。', group: 'content', path: '/admin/news', icon: 'news', order: 10, implemented: true },
  { module: 'courses', title: '课程', shortTitle: '课程', description: '维护课程简介、材料、参考资料和可见性。', group: 'content', path: '/admin/courses', icon: 'courses', order: 20, implemented: true },
  { module: 'messages', title: '联系留言', shortTitle: '联系留言', description: '查看、处理和归档访客留言。', group: 'content', path: '/admin/messages', icon: 'messages', order: 30, implemented: true },
  { module: 'media_assets', title: '媒体库', shortTitle: '媒体库', description: '上传、选择、检索、回收和检查媒体资源。', group: 'resources', path: '/admin/media', icon: 'media', order: 10, implemented: true },
  { module: 'translation_cache', title: '翻译缓存与任务', shortTitle: '翻译', description: '扫描、自动翻译、人工修订和处理失效译文。', group: 'resources', path: '/admin/translation', icon: 'translation', order: 20, implemented: true },
  { module: 'auth', title: '用户、角色与权限', shortTitle: '账号权限', description: '维护用户、角色、可见范围和模块权限。', group: 'system', path: '/admin/auth', icon: 'auth', order: 10, implemented: true },
  { module: 'operation_logs', title: '操作日志', shortTitle: '操作日志', description: '查看后台关键操作及其执行结果。', group: 'system', path: '/admin/logs', icon: 'logs', order: 20, implemented: true },
  { module: 'import_export', title: '导入导出与备份', shortTitle: '导入导出', description: '导出、导入、备份和恢复网站数据。', group: 'system', path: '/admin/import-export', icon: 'backup', order: 30, implemented: true },
])

const BY_MODULE = new Map<AuthModule, AdminModuleDefinition>(ADMIN_MODULES.map(item => [item.module, item]))
const GROUP_ORDER = new Map<AdminGroupId, number>(ADMIN_GROUPS.map(group => [group.id, group.order]))
const SPECIAL_PATHS = new Set(['/admin/forbidden', '/admin/not-found', '/admin/unavailable'])

const INVALID_ADMIN_PATH = '/__invalid_admin_path__'
function normalizeAdminPath(value: string): string | null {
  if (typeof value !== 'string' || value.length > 2_048) return null
  const safe = safeApplicationRedirect(value, INVALID_ADMIN_PATH)
  if (safe === INVALID_ADMIN_PATH) return null
  const path = safe.split(/[?#]/u, 1)[0] ?? ''
  if ((path !== '/admin' && !path.startsWith('/admin/')) || /[\\\u0000-\u001f\u007f]/u.test(path) || path.includes('//')) return null
  const normalized = path.length > 1 ? path.replace(/\/+$/u, '') : path
  return normalized || '/admin'
}

export function adminModule(module: AuthModule): AdminModuleDefinition {
  const result = BY_MODULE.get(module)
  if (!result) throw new TypeError(`Unknown admin module: ${module}`)
  return result
}

export function adminModuleForPath(value: string): AdminModuleDefinition | null {
  const path = normalizeAdminPath(value)
  if (!path || SPECIAL_PATHS.has(path)) return null
  const candidates = ADMIN_MODULES
    .filter(item => item.exact ? path === item.path : (path === item.path || path.startsWith(`${item.path}/`)))
    .sort((a, b) => b.path.length - a.path.length)
  return candidates[0] ?? null
}

export function isAdminSpecialPath(value: string): boolean {
  const path = normalizeAdminPath(value)
  return path !== null && SPECIAL_PATHS.has(path)
}

export interface AdminPermissionSubject {
  readonly mustChangePassword: boolean
  readonly permissions: { readonly [Module in AuthModule]?: { readonly [Action in PermissionAction]: boolean } }
}

export function hasAdminPermission(user: AdminPermissionSubject | null | undefined, module: AuthModule, action: PermissionAction = 'view'): boolean {
  return Boolean(user && !user.mustChangePassword && user.permissions[module]?.[action] === true)
}

export function visibleAdminModules(user: AdminPermissionSubject | null | undefined): AdminModuleDefinition[] {
  return ADMIN_MODULES
    .filter(item => hasAdminPermission(user, item.module, 'view'))
    .sort((a, b) => (GROUP_ORDER.get(a.group) ?? 999) - (GROUP_ORDER.get(b.group) ?? 999) || a.order - b.order)
}

export interface AdminNavigationGroup {
  readonly id: AdminGroupId
  readonly label: string
  readonly path: string
  readonly modules: readonly AdminModuleDefinition[]
}

export function visibleAdminNavigation(user: AdminPermissionSubject | null | undefined): AdminNavigationGroup[] {
  const visible = visibleAdminModules(user)
  return ADMIN_GROUPS
    .map(group => ({ ...group, modules: visible.filter(item => item.group === group.id) }))
    .filter(group => group.modules.length > 0)
}

export interface AdminBreadcrumbItem { readonly label: string; readonly to?: string }

interface AdminChildPageDefinition {
  readonly module: AuthModule
  readonly label: string
}

const ADMIN_EXACT_CHILD_PAGES: Readonly<Record<string, AdminChildPageDefinition>> = Object.freeze({
  '/admin/publications/metadata': { module: 'publications', label: '元数据工具' },
  '/admin/patents/metadata': { module: 'patents', label: '元数据工具' },
  '/admin/translation/suggestions': { module: 'translation_cache', label: '历史值建议' },
  '/admin/media/trash': { module: 'media_assets', label: '回收站' },
})

const ADMIN_STANDALONE_PAGES: Readonly<Record<string, string>> = Object.freeze({
  '/admin/system-check': '系统检查',
  '/admin/forbidden': '无权访问',
  '/admin/not-found': '页面不存在',
  '/admin/unavailable': '服务暂不可用',
})

const ADMIN_QUERY_EDITOR_LABELS: Readonly<Partial<Record<AuthModule, string>>> = Object.freeze({
  site_settings: '编辑网站设置',
  global_settings: '编辑全局设置',
  navigation_items: '编辑导航项',
  news: '编辑新闻',
  media_assets: '编辑媒体信息',
  translation_cache: '人工修订',
})

function adminChildPage(path: string): AdminChildPageDefinition | null {
  const exact = ADMIN_EXACT_CHILD_PAGES[path]
  if (exact) return exact
  if (/^\/admin\/news\/editor\/[^/]+$/u.test(path)) return { module: 'news', label: '富文本编辑' }
  return null
}

function routeQuery(value: string): URLSearchParams {
  const question = value.indexOf('?')
  if (question < 0) return new URLSearchParams()
  const hash = value.indexOf('#', question + 1)
  return new URLSearchParams(value.slice(question + 1, hash < 0 ? undefined : hash))
}

function safeRouteRecordKey(value: string | null): string | null {
  if (!value || value !== value.trim() || /[\/?#%\u0000-\u001f\u007f]/u.test(value)) return null
  return new TextEncoder().encode(value).byteLength <= 256 ? value : null
}

function queryEditorLabel(value: string, selected: AdminModuleDefinition): string | null {
  const query = routeQuery(value)
  if (selected.module === 'operation_logs') return safeRouteRecordKey(query.get('detail')) ? '日志详情' : null
  if (selected.module === 'auth') {
    if (!safeRouteRecordKey(query.get('edit'))) return null
    return query.get('tab') === 'roles' ? '编辑角色' : '编辑用户'
  }
  return safeRouteRecordKey(query.get('edit')) ? ADMIN_QUERY_EDITOR_LABELS[selected.module] ?? null : null
}

export function adminGroupLandingPath(groupId: AdminGroupId, user?: AdminPermissionSubject | null): string | null {
  const group = ADMIN_GROUPS.find(item => item.id === groupId)
  if (!group) return null
  if (!user) return group.path
  return ADMIN_MODULES
    .filter(item => item.group === groupId && hasAdminPermission(user, item.module, 'view'))
    .sort((left, right) => left.order - right.order)[0]?.path ?? null
}

export function adminBreadcrumbs(value: string, user?: AdminPermissionSubject | null): AdminBreadcrumbItem[] {
  const path = normalizeAdminPath(value)
  if (!path) return [{ label: '管理后台' }]
  const standaloneLabel = ADMIN_STANDALONE_PAGES[path]
  if (standaloneLabel) return [{ label: '管理后台', to: '/admin' }, { label: standaloneLabel }]
  const selected = adminModuleForPath(path)
  if (!selected) return [{ label: '管理后台', to: '/admin' }, { label: '页面不存在' }]
  if (selected.module === 'dashboard') return [{ label: '管理后台' }]
  const group = ADMIN_GROUPS.find(item => item.id === selected.group)
  const groupPath = adminGroupLandingPath(selected.group, user) ?? selected.path
  const base: AdminBreadcrumbItem[] = [
    { label: '管理后台', to: '/admin' },
    ...(group ? [{ label: group.label, to: groupPath }] : []),
  ]
  const child = adminChildPage(path)
  if (child?.module === selected.module) return [...base, { label: selected.title, to: selected.path }, { label: child.label }]
  const contentRoute = adminContentRoute(path)
  if (!contentRoute) {
    const editorLabel = queryEditorLabel(value, selected)
    return editorLabel
      ? [...base, { label: selected.title, to: selected.path }, { label: editorLabel }]
      : [...base, { label: selected.title }]
  }
  if (contentRoute.mode === 'list') return [...base, { label: selected.title }]
  return [
    ...base,
    { label: selected.title, to: selected.path },
    { label: contentRoute.mode === 'create' ? `新建${contentRoute.definition.singularTitle}` : `编辑${contentRoute.definition.singularTitle}` },
  ]
}
