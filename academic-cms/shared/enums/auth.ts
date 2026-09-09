export const AUTH_MODULES = [
  'dashboard',
  'site_settings',
  'global_settings',
  'navigation_items',
  'profiles',
  'research_interests',
  'publications',
  'projects',
  'patents',
  'students',
  'student_category_displays',
  'news',
  'courses',
  'messages',
  'media_assets',
  'translation_cache',
  'operation_logs',
  'auth',
  'import_export',
] as const

export type AuthModule = (typeof AUTH_MODULES)[number]

export const PERMISSION_ACTIONS = ['view', 'create', 'edit', 'delete', 'export'] as const
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number]

export interface PermissionFlags {
  view: boolean
  create: boolean
  edit: boolean
  delete: boolean
  export: boolean
}

export const VISIBILITY_SCOPES = ['public', 'authenticated', 'staff', 'owner', 'hidden'] as const
export type VisibilityScope = (typeof VISIBILITY_SCOPES)[number]

const moduleSet = new Set<string>(AUTH_MODULES)
const visibilitySet = new Set<string>(VISIBILITY_SCOPES)

export function isAuthModule(value: unknown): value is AuthModule {
  return typeof value === 'string' && moduleSet.has(value)
}

export function isVisibilityScope(value: unknown): value is VisibilityScope {
  return typeof value === 'string' && visibilitySet.has(value)
}

export function emptyPermissionFlags(): PermissionFlags {
  return { view: false, create: false, edit: false, delete: false, export: false }
}

export const SYSTEM_ADMIN_ROLE_UID = 'role:system-administrator'
export const SYSTEM_ADMIN_ROLE_NAME = 'System Administrator'
export const SYSTEM_ADMIN_ROLE_LEVEL = 1000

/** Built-in least-privilege role used only for explicitly enabled public registration. */
export const REGISTERED_USER_ROLE_UID = 'role:registered-user'
export const REGISTERED_USER_ROLE_NAME = 'Registered User'
export const REGISTERED_USER_ROLE_LEVEL = 10
export const REGISTERED_USER_VISIBILITY_SCOPES = Object.freeze(['public', 'authenticated', 'owner'] as const)

export function permissionUid(module: AuthModule): string {
  return `permission:system-administrator:${module}`
}

/**
 * The built-in role can operate every module. Deletion of protected system
 * records remains a separate domain invariant and is never granted merely by
 * this flag set.
 */
export function systemAdministratorPermissions(): Readonly<Record<AuthModule, PermissionFlags>> {
  const result = {} as Record<AuthModule, PermissionFlags>
  for (const module of AUTH_MODULES) {
    result[module] = {
      view: true,
      create: !['dashboard', 'operation_logs'].includes(module),
      edit: !['dashboard', 'operation_logs'].includes(module),
      delete: !['dashboard', 'site_settings', 'global_settings', 'operation_logs', 'auth', 'import_export'].includes(module),
      export: module !== 'dashboard',
    }
  }
  return result
}
