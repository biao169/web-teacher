import type { AuthModule, PermissionAction } from '../enums/auth'
export interface AdminPermissionRequirement { readonly module: AuthModule; readonly action: PermissionAction }
export interface AdminRuntimeView { readonly kind: 'node' | 'cloudflare' | 'unknown'; readonly version: string }
export interface AdminDashboardOperationView {
  readonly uid: string; readonly actorName: string | null; readonly action: string; readonly module: string
  readonly targetUid: string | null; readonly summary: string | null; readonly status: string | null; readonly createdAt: string
}
export interface AdminDashboardView {
  readonly generatedAt: string; readonly runtime: AdminRuntimeView; readonly pendingMessages: number | null
  readonly recentOperations: readonly AdminDashboardOperationView[] | null
}
export interface AdminApiErrorBody { readonly error: { readonly code: string; readonly message: string; readonly requestId: string; readonly fieldErrors?: Readonly<Record<string, string>> } }
