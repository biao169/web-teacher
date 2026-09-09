import { PUBLIC_LOCALE_DEFAULTS, publicCountryCode } from '../../../shared/utils/public-locale'
import { parseBoundedJsonStream } from '../../security/body'

/** URL's IPv6 parser is available in Node and Workers, without a GeoIP database dependency. */
export function normalizeVisitorIp(input: unknown): string | null {
  if (typeof input !== 'string' || !input || input.length > 64 || /[^0-9a-f:.]/iu.test(input)) return null
  if (!input.includes(':')) {
    const parts = input.split('.')
    return parts.length === 4 && parts.every(part => /^(?:0|[1-9]\d{0,2})$/u.test(part) && Number(part) <= 255) ? parts.join('.') : null
  }
  try {
    const address = new URL(`http://[${input}]/`).hostname.slice(1, -1)
    const mapped = /^::ffff:([0-9a-f]+):([0-9a-f]+)$/u.exec(address)
    if (mapped) {
      const high = parseInt(mapped[1]!, 16), low = parseInt(mapped[2]!, 16)
      return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`
    }
    return address
  } catch { return null }
}

export function publicVisitorIp(input: unknown): string | null {
  const ip = normalizeVisitorIp(input)
  if (!ip) return null
  if (ip.includes(':')) {
    const first = parseInt(ip.split(':')[0]!, 16)
    return first >= 0x2000 && first <= 0x3fff && !/^2001:(?:db8|2|1[0-9a-f]|2[0-9a-f])(?=:)/u.test(ip) ? ip : null
  }
  const [a, b, c] = ip.split('.').map(Number) as [number, number, number, number]
  if (a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || (b === 0 && (c === 0 || c === 2)))) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) || (a === 203 && b === 0 && c === 113)) return null
  return ip
}

function lookupBase(value: unknown): string | null {
  const raw = typeof value === 'string' && value.trim() ? value.trim() : PUBLIC_LOCALE_DEFAULTS.geoIpUrl
  try {
    const url = new URL(raw)
    const localHttp = url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    if ((!localHttp && url.protocol !== 'https:') || url.username || url.password || url.search || url.hash || raw.length > 2048) return null
    return url.toString().replace(/\/+$/u, '')
  } catch { return null }
}

/** Bounded per-process cache, same-IP coalescing, and a small request budget for the free service. */
export function createVisitorCountryLookup(fetcher: typeof fetch = (...args) => fetch(...args), clock = Date.now) {
  const cache = new Map<string, { country: string | null; expires: number }>()
  const pending = new Map<string, Promise<string | null>>()
  let recent: number[] = []
  let coolingUntil = 0
  return async (input: unknown, options: { enabled?: unknown; url?: unknown; timeoutMs?: unknown } = {}): Promise<string | null> => {
    if (options.enabled === false || options.enabled === 'false' || options.enabled === '0') return null
    const ip = publicVisitorIp(input), base = lookupBase(options.url)
    if (!ip || !base) return null
    const key = `${base}|${ip}`, now = clock()
    const cached = cache.get(key)
    if (cached && cached.expires > now) return cached.country
    cache.delete(key)
    if (pending.has(key)) return pending.get(key)!
    recent = recent.filter(time => time > now - 1000)
    if (pending.size >= 4 || recent.length >= 8 || coolingUntil > now) return null
    recent.push(now)
    const task = Promise.resolve().then(async () => {
      let country: string | null = null
      const configured = Number(options.timeoutMs)
      const timeout = Number.isInteger(configured) && configured >= 200 && configured <= 3000 ? configured : PUBLIC_LOCALE_DEFAULTS.geoIpTimeoutMs
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeout)
      try {
        const response = await fetcher(`${base}/${encodeURIComponent(ip)}`, { signal: controller.signal, redirect: 'error', headers: { accept: 'application/json' } })
        if (response.status === 429) {
          const seconds = Number(response.headers.get('retry-after'))
          coolingUntil = clock() + (Number.isFinite(seconds) && seconds > 0 ? Math.min(900, seconds) : 60) * 1000
        }
        if (!response.ok) { await response.body?.cancel(); return null }
        const data = await parseBoundedJsonStream(response.body, null, 4096)
        if (data && typeof data === 'object' && !Array.isArray(data)) {
          const value = data as Record<string, unknown>
          if (normalizeVisitorIp(value.ip) === ip) country = publicCountryCode(value.country)
        }
        return country
      } catch { return null }
      finally {
        clearTimeout(timer)
        cache.set(key, { country, expires: clock() + (country ? 6 * 3600_000 : 60_000) })
        while (cache.size > 512) cache.delete(cache.keys().next().value!)
        pending.delete(key)
      }
    })
    pending.set(key, task)
    return task
  }
}
