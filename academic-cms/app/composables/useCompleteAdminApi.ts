import type { FetchOptions } from 'ofetch'
import { adminErrorDetails } from '../admin/errors'
import { showAdminPermissionDenied } from '../admin/permission-feedback'

const adminFetch = $fetch as unknown as <Response>(path: string, options: FetchOptions) => Promise<Response>

function readCsrfCookie(): string {
  if (!import.meta.client) return ''
  const values = document.cookie.split(';').map(value => value.trim()).filter(Boolean)
  const preferred = ['academic-cms-csrf', '__Host-academic-cms-csrf']
  for (const name of preferred) {
    const item = values.find(value => value.startsWith(`${name}=`))
    if (item) return decodeURIComponent(item.slice(name.length + 1))
  }
  const fallback = values.find(value => /csrf/iu.test(value.split('=')[0] ?? ''))
  return fallback ? decodeURIComponent(fallback.slice(fallback.indexOf('=') + 1)) : ''
}

export function useCompleteAdminApi() {
  const route = useRoute()
  const auth = useAuthSession()

  async function csrfTokenForWrite(): Promise<string> {
    let csrf = readCsrfCookie()
    if (csrf || !auth.session.value.authenticated) return csrf

    // A server-rendered navigation can restore the session before the browser
    // has received a readable CSRF cookie. Refreshing the session reissues the
    // cookie without extending the session and makes the first write reliable.
    await auth.load(true)
    csrf = readCsrfCookie()
    return csrf
  }

  async function request<T>(path: string, options: FetchOptions = {}): Promise<T> {
    const method = String(options.method ?? 'GET').toUpperCase()
    const write = !['GET', 'HEAD', 'OPTIONS'].includes(method)
    const headers = new Headers(options.headers as HeadersInit | undefined)
    if (write) {
      const csrf = await csrfTokenForWrite()
      if (!csrf) throw new Error('安全令牌缺失，请刷新页面后重试。')
      headers.set('x-csrf-token', csrf)
      if (!headers.has('content-type') && options.body !== undefined) headers.set('content-type', 'application/json')
    }
    try {
      return await adminFetch<T>(path, { ...options, headers, credentials: 'include', retry: 0 })
    } catch (error: unknown) {
      const detail = adminErrorDetails(error)
      const status = detail.status
      if (status === 401 && import.meta.client) {
        const next = route.fullPath.startsWith('/admin') ? route.fullPath : '/admin'
        await navigateTo(`/zh/login?next=${encodeURIComponent(next)}`, { external: true })
      }
      if (status === 403) void showAdminPermissionDenied(error, detail.message)
      throw error
    }
  }
  return { request, readCsrfCookie, csrfTokenForWrite }
}
