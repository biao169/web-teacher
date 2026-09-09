import type { H3Event } from 'h3'
import { createError, getCookie, getHeader, getMethod, getRequestURL, setHeader } from 'h3'
import { CSRF_HEADER } from '../../security/cookies'
import { isSecurityError } from '../../security/errors'
import { protectUnsafeRequest } from '../../security/request-protection'
import { useAuthRuntime } from '../auth-runtime'

export type AdminAction = 'view' | 'create' | 'edit' | 'delete' | 'export'
export interface AdminPrincipal {
  userUid: string
  username: string
  displayName: string
  roleUid: string
  roleLevel: number
  roleIsSystem?: boolean
  permissions: unknown
  raw: Record<string, unknown>
}

function safeRequestId(event: H3Event): string {
  const value = getHeader(event, 'x-request-id')?.trim()
  return value && /^[A-Za-z0-9._:-]{1,128}$/u.test(value) ? value : crypto.randomUUID()
}

function fail(event: H3Event, statusCode: number, code: string, message: string): never {
  const requestId = safeRequestId(event)
  setHeader(event, 'x-request-id', requestId)
  throw createError({ statusCode, message, data: { error: { code, message, requestId } } })
}

function permissionBoolean(entry: Record<string, unknown>, action: AdminAction): boolean {
  const keys = [`can_${action}`, `can${action[0]?.toUpperCase()}${action.slice(1)}`, action]
  return keys.some(key => entry[key] === true || entry[key] === 1)
}

function hasPermissionShape(permissions: unknown, modules: readonly string[], action: AdminAction): boolean {
  const normalized = new Set(modules.map(item => item.toLowerCase()))
  if (Array.isArray(permissions)) {
    return permissions.some(value => {
      if (typeof value === 'string') {
        const lower = value.toLowerCase()
        return modules.some(module => lower === `${module}:${action}`.toLowerCase() || lower === `${module}.*`.toLowerCase() || lower === '*:*')
      }
      if (!value || typeof value !== 'object') return false
      const entry = value as Record<string, unknown>
      const module = String(entry.module ?? entry.key ?? '').toLowerCase()
      return (normalized.has(module) || module === '*') && permissionBoolean(entry, action)
    })
  }
  if (permissions && typeof permissions === 'object') {
    const object = permissions as Record<string, unknown>
    for (const module of modules) {
      const candidate = object[module] ?? object[module.toLowerCase()]
      if (candidate === true || candidate === '*') return true
      if (candidate && typeof candidate === 'object' && permissionBoolean(candidate as Record<string, unknown>, action)) return true
      if (Array.isArray(candidate) && candidate.includes(action)) return true
    }
    return object['*'] === true
  }
  return false
}

function extractPrincipal(payload: unknown): AdminPrincipal | null {
  if (!payload || typeof payload !== 'object') return null
  const root = payload as Record<string, any>
  const session = root.session ?? root.data?.session ?? root.data ?? root
  const user = session.user ?? root.user ?? session.account ?? null
  const role = session.role ?? user?.role ?? root.role ?? null
  if (!user || typeof user !== 'object') return null
  const userUid = String(user.uid ?? user.userUid ?? '').trim()
  if (!userUid) return null
  return {
    userUid,
    username: String(user.username ?? ''),
    displayName: String(user.displayName ?? user.display_name ?? user.username ?? ''),
    roleUid: String(role?.uid ?? user.roleUid ?? user.role_uid ?? ''),
    roleLevel: Number(role?.level ?? user.roleLevel ?? 0),
    roleIsSystem: Boolean(role?.isSystem ?? role?.is_system ?? user.roleIsSystem ?? user.role_is_system),
    permissions: session.permissions ?? user.permissions ?? root.permissions ?? [],
    raw: root
  }
}

async function fetchSession(event: H3Event): Promise<AdminPrincipal | null> {
  const cookie = getHeader(event, 'cookie') ?? ''
  const requestId = safeRequestId(event)
  const localFetch = (event as unknown as { $fetch?: typeof $fetch }).$fetch ?? $fetch
  try {
    const payload = await localFetch('/api/v1/auth/session', { headers: { cookie, 'x-request-id': requestId } })
    return extractPrincipal(payload)
  } catch (error: any) {
    const status = Number(error?.statusCode ?? error?.status ?? error?.response?.status ?? 500)
    if (status === 401 || status === 403) return null
    throw error
  }
}

async function assertWriteRequest(event: H3Event, binary = false): Promise<void> {
  const contentType = getHeader(event, 'content-type')?.toLowerCase() ?? ''
  const method = getMethod(event).toUpperCase()
  const bodyless = ['DELETE'].includes(method) && !getHeader(event, 'content-length')
  const binaryAllowed = binary && /^(?:image\/(?:png|jpeg|gif|webp)|application\/(?:pdf|zip|x-zip-compressed|octet-stream))(?:;|$)/u.test(contentType)
  if (!bodyless && !contentType.startsWith('application/json') && !binaryAllowed) fail(event, 415, 'UNSUPPORTED_MEDIA_TYPE', '请求格式不受支持')
  const encoding = getHeader(event, 'content-encoding')?.trim().toLowerCase()
  if (encoding && encoding !== 'identity') fail(event, 415, 'COMPRESSED_BODY_REJECTED', '不接受压缩请求体')
  const runtime = useAuthRuntime(event)
  try {
    await protectUnsafeRequest({
      method,
      contentType,
      origin: getHeader(event, 'origin') ?? null,
      secFetchSite: getHeader(event, 'sec-fetch-site') ?? null,
      requestUrl: runtime.config.trustedOrigins[0] ?? getRequestURL(event).toString(),
      trustedOrigins: runtime.config.trustedOrigins,
      cookieAuthenticated: true,
      sessionToken: getCookie(event, runtime.cookies.sessionName) ?? null,
      csrfHeader: getHeader(event, CSRF_HEADER) ?? null,
      csrfCookie: getCookie(event, runtime.cookies.csrfName) ?? null,
      requireJson: !(bodyless || binaryAllowed),
      tokens: runtime.tokens,
    })
  }
  catch (error) {
    if (isSecurityError(error)) fail(event, error.statusCode, error.code, error.publicMessage)
    throw error
  }
}

export async function requireAdmin(event: H3Event, modules: readonly string[], action: AdminAction, options: { write?: boolean; binary?: boolean } = {}): Promise<AdminPrincipal> {
  setHeader(event, 'cache-control', 'private, no-store')
  setHeader(event, 'x-robots-tag', 'noindex, nofollow')
  if (options.write) await assertWriteRequest(event, options.binary === true)
  const principal = await fetchSession(event)
  if (!principal) fail(event, 401, 'AUTHENTICATION_REQUIRED', '登录状态已失效')
  const raw = principal.raw as Record<string, any>
  const user = raw.user ?? raw.session?.user ?? raw.data?.user ?? raw.data?.session?.user
  if (user?.mustChangePassword === true || user?.must_change_password === 1) fail(event, 403, 'PASSWORD_CHANGE_REQUIRED', '请先修改密码')
  if (!hasPermissionShape(principal.permissions, modules, action)) fail(event, 403, 'PERMISSION_DENIED', '没有执行此操作的权限')
  return principal
}
