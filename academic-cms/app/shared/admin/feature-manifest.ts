export interface AdminFeatureManifestEntry {
  readonly key: string
  readonly title: string
  readonly path: string
  readonly permissionModule: string
  readonly table: string | null
  readonly kind: 'dashboard' | 'crud' | 'specialist'
}

export const ADMIN_FEATURE_MANIFEST: readonly AdminFeatureManifestEntry[] = Object.freeze([
  { key: "dashboard", title: "控制台", path: "/admin", permissionModule: "dashboard", table: null, kind: "dashboard" },
  { key: "site-settings", title: "网站设置", path: "/admin/settings/site", permissionModule: "site_settings", table: "site_settings", kind: "crud" },
  { key: "global-settings", title: "全局设置", path: "/admin/settings/global", permissionModule: "global_settings", table: "global_settings", kind: "crud" },
  { key: "navigation", title: "导航与按钮", path: "/admin/navigation", permissionModule: "navigation_items", table: "navigation_items", kind: "crud" },
  { key: "profiles", title: "教师与团队", path: "/admin/profiles", permissionModule: "profiles", table: "profiles", kind: "crud" },
  { key: "research", title: "研究方向", path: "/admin/research", permissionModule: "research_interests", table: "research_interests", kind: "crud" },
  { key: "publications", title: "论文", path: "/admin/publications", permissionModule: "publications", table: "publications", kind: "crud" },
  { key: "projects", title: "项目", path: "/admin/projects", permissionModule: "projects", table: "projects", kind: "crud" },
  { key: "patents", title: "专利与软件著作", path: "/admin/patents", permissionModule: "patents", table: "patents", kind: "crud" },
  { key: "students", title: "学生", path: "/admin/students", permissionModule: "students", table: "students", kind: "crud" },
  { key: "student-categories", title: "学生分类显示", path: "/admin/student-categories", permissionModule: "student_category_displays", table: "student_category_displays", kind: "crud" },
  { key: "news", title: "新闻动态", path: "/admin/news", permissionModule: "news", table: "news", kind: "crud" },
  { key: "courses", title: "课程", path: "/admin/courses", permissionModule: "courses", table: "courses", kind: "crud" },
  { key: "messages", title: "联系留言", path: "/admin/messages", permissionModule: "messages", table: "messages", kind: "crud" },
  { key: "media", title: "媒体库", path: "/admin/media", permissionModule: "media_assets", table: "media_assets", kind: "specialist" },
  { key: "translation", title: "翻译缓存与任务", path: "/admin/translation", permissionModule: "translation_cache", table: "translation_cache", kind: "specialist" },
  { key: "auth", title: "账号角色权限", path: "/admin/auth", permissionModule: "auth", table: "auth_users", kind: "specialist" },
  { key: "logs", title: "操作日志", path: "/admin/logs", permissionModule: "operation_logs", table: "operation_logs", kind: "specialist" },
  { key: "import-export", title: "导入导出与备份", path: "/admin/import-export", permissionModule: "import_export", table: null, kind: "specialist" },
])

export const ADMIN_FEATURE_BY_PATH = new Map(ADMIN_FEATURE_MANIFEST.map((entry) => [entry.path, entry]))
