import type { SafeUserView } from '../../shared/contracts/auth'
import {
  AUTH_MODULES,
  emptyPermissionFlags,
  isAuthModule,
  isVisibilityScope,
  type AuthModule,
  type PermissionAction,
  type PermissionFlags,
  type VisibilityScope,
} from '../../shared/enums/auth'
import { SecurityError } from './errors'

export interface AuthenticatedPrincipal {
  sessionUid: string
  userUid: string
  username: string
  displayName: string | null
  email: string | null
  roleUid: string
  roleName: string
  roleLevel: number
  roleIsSystem: boolean
  visibilityScopes: ReadonlySet<VisibilityScope>
  permissions: Readonly<Record<AuthModule, Readonly<PermissionFlags>>>
  mustChangePassword: boolean
}

export function parseVisibilityScopes(value: unknown): ReadonlySet<VisibilityScope> {
  if (!Array.isArray(value)) throw new SecurityError('AUTH_PROTOCOL', 'Stored visibility scopes are invalid')
  const scopes = new Set<VisibilityScope>(['public'])
  for (const item of value) {
    if (!isVisibilityScope(item)) throw new SecurityError('AUTH_PROTOCOL', 'Stored visibility scopes are invalid')
    scopes.add(item)
  }
  return scopes
}

export function emptyPermissionRecord(): Record<AuthModule, Readonly<PermissionFlags>> {
  const permissions = {} as Record<AuthModule, Readonly<PermissionFlags>>
  for (const module of AUTH_MODULES) permissions[module] = Object.freeze(emptyPermissionFlags())
  return permissions
}

export function permissionFlags(value: PermissionFlags): Readonly<PermissionFlags> {
  return Object.freeze({ ...value })
}

export function hasPermission(principal: AuthenticatedPrincipal | null, module: AuthModule, action: PermissionAction): boolean {
  return principal !== null
    && !principal.mustChangePassword
    && isAuthModule(module)
    && principal.permissions?.[module]?.[action] === true
}

export function requirePermission(principal: AuthenticatedPrincipal | null, module: AuthModule, action: PermissionAction): AuthenticatedPrincipal {
  if (!principal) throw new SecurityError('AUTH_REQUIRED', 'Authentication is required')
  // Password replacement is a dedicated authentication operation, not a
  // general auth-module permission. A forced-change account must never reach
  // user, role or permission administration through auth:view/auth:edit.
  if (principal.mustChangePassword) {
    throw new SecurityError('AUTH_PASSWORD_CHANGE_REQUIRED', 'Password change is required')
  }
  if (!hasPermission(principal, module, action)) throw new SecurityError('AUTH_FORBIDDEN', `Permission denied for ${module}:${action}`)
  return principal
}

/** Role hierarchy constrains role administration and never replaces module permission checks. */
export function canManageRole(
  principal: AuthenticatedPrincipal | null,
  target: { level: number; isSystem: boolean; uid: string },
): boolean {
  if (!principal || principal.mustChangePassword || !hasPermission(principal, 'auth', 'edit')) return false
  if (!Number.isSafeInteger(target.level) || target.level < 0 || target.uid === principal.roleUid) return false
  if (target.isSystem && !principal.roleIsSystem) return false
  return principal.roleLevel > target.level
}

export function toSafeUserView(principal: AuthenticatedPrincipal): SafeUserView {
  const permissions: Partial<Record<AuthModule, PermissionFlags>> = {}
  if (!principal.mustChangePassword) {
    for (const module of AUTH_MODULES) {
      const grant = principal.permissions?.[module]
      if (!grant) continue
      if (grant.view || grant.create || grant.edit || grant.delete || grant.export) permissions[module] = { ...grant }
    }
  }
  return {
    uid: principal.userUid,
    username: principal.username,
    displayName: principal.displayName,
    email: principal.email,
    role: {
      uid: principal.roleUid,
      name: principal.roleName,
      level: principal.roleLevel,
      isSystem: principal.roleIsSystem,
    },
    mustChangePassword: principal.mustChangePassword,
    visibilityScopes: [...principal.visibilityScopes],
    permissions,
  }
}
