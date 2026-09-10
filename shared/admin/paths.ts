import { safeApplicationRedirect } from '../utils/redirect'

export function safeAdminReturnPath(value: unknown, fallback = '/admin'): string {
  const safeFallback = fallback === '/admin' || fallback.startsWith('/admin/') ? fallback : '/admin'
  const candidate = safeApplicationRedirect(value, safeFallback)
  return candidate === '/admin' || candidate.startsWith('/admin/') ? candidate : safeFallback
}
