import type { AuthModule, PermissionFlags, VisibilityScope } from '../enums/auth'

export interface SafeRoleView {
  readonly uid: string
  readonly name: string
  readonly level: number
  readonly isSystem: boolean
}

export interface SafeUserView {
  readonly uid: string
  readonly username: string
  readonly displayName: string | null
  readonly email: string | null
  readonly role: SafeRoleView
  readonly mustChangePassword: boolean
  readonly visibilityScopes: readonly VisibilityScope[]
  readonly permissions: Readonly<Partial<Record<AuthModule, Readonly<PermissionFlags>>>>
}

export interface AuthenticatedSessionView {
  authenticated: true
  user: SafeUserView
  expiresAt: string
  idleExpiresAt: string
  csrfToken: string
}

export interface AnonymousSessionView {
  authenticated: false
}

export type SessionView = AuthenticatedSessionView | AnonymousSessionView

export interface LoginRequestBody {
  username: string
  password: string
}

export interface BootstrapRequestBody {
  username: string
  password: string
  displayName?: string | null
  email?: string | null
}

export interface BootstrapResponse {
  user: Pick<SafeUserView, 'uid' | 'username' | 'displayName' | 'email'>
}
