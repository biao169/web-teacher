import type { PublicLinkStyle, PublicNavigationLocation, PublicSiteLocale } from '../contracts/public-site'
import { normalizePublicListHref } from './public-list-link'

const encoder = new TextEncoder()
const CONTROL_OR_BACKSLASH = /[\\\u0000-\u001f\u007f]/u
const SAFE_FRAGMENT = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/u
const SAFE_ICON = /^[a-z][a-z0-9-]{0,47}$/u
const INTERNAL_DENY = ['/api', '/media', '/_nuxt', '/__cms_cache'] as const

const ROUTES: Readonly<Record<string, string>> = Object.freeze({
  home: '',
  team: '/team',
  research: '/research',
  publications: '/publications',
  featured_publications: '/publications/featured',
  projects: '/projects',
  patents: '/patents',
  students: '/students',
  news: '/news',
  courses: '/courses',
  contact: '/contact',
  login: '/admin',
  admin: '/admin',
})

export interface PublicNavigationInput {
  kind?: string | null
  urlName?: string | null
  path?: string | null
  fragment?: string | null
  location?: string | null
  style?: string | null
  icon?: string | null
}

export interface ResolvedPublicNavigation {
  href: string
  external: boolean
  location: PublicNavigationLocation
  style: PublicLinkStyle
  icon: string | null
}

function localeValue(value: unknown): PublicSiteLocale {
  if (value !== 'zh' && value !== 'en') throw new TypeError('Unsupported public locale')
  return value
}

function bounded(value: string, bytes: number): string {
  if (!value || value !== value.trim() || CONTROL_OR_BACKSLASH.test(value) || encoder.encode(value).byteLength > bytes) {
    throw new TypeError('Invalid public navigation value')
  }
  return value.normalize('NFC')
}

function safeFragment(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return null
  const selected = bounded(value, 64)
  if (!SAFE_FRAGMENT.test(selected)) throw new TypeError('Invalid public navigation fragment')
  return selected
}

function location(value: string | null | undefined): PublicNavigationLocation {
  const normalized = value?.trim().toLowerCase().replace(/[- ]/gu, '_')
  if (normalized === 'hero' || normalized === 'homepage' || normalized === 'homepage_hero' || normalized === '首页主视觉') return 'hero'
  if (normalized === 'footer' || normalized === '页脚') return 'footer'
  return 'header'
}

function style(value: string | null | undefined): PublicLinkStyle {
  const normalized = value?.trim().toLowerCase().replace(/[- ]/gu, '_')
  if (normalized === 'primary' || normalized === 'main_button' || normalized === '主按钮') return 'primary'
  if (normalized === 'secondary' || normalized === 'secondary_button' || normalized === '次按钮') return 'secondary'
  return 'default'
}

function icon(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value.trim() === '') return null
  const normalized = bounded(value.trim().toLowerCase(), 48)
  return SAFE_ICON.test(normalized) ? normalized : null
}

function rejectTraversal(pathname: string): void {
  const rawSegments = pathname.split('/')
  for (const raw of rawSegments) {
    let decoded: string
    try { decoded = decodeURIComponent(raw) }
    catch (error) { throw new TypeError('Invalid public path encoding', { cause: error }) }
    if (decoded === '.' || decoded === '..' || decoded.includes('/') || decoded.includes('\\') || CONTROL_OR_BACKSLASH.test(decoded)) {
      throw new TypeError('Public path traversal is not allowed')
    }
    if (encodeURIComponent(decoded).replace(/%2F/giu, '/') !== raw && /%(?:2e|2f|5c)/iu.test(raw)) {
      throw new TypeError('Ambiguous public path encoding is not allowed')
    }
  }
}

function appendFragment(href: string, fragment: string | null): string {
  if (!fragment) return href
  const separator = href.includes('#') ? '' : '#'
  return `${href}${separator}${fragment}`
}

function externalHref(value: string, fragment: string | null): string {
  const raw = bounded(value, 2048)
  if (raw.startsWith('//')) throw new TypeError('Protocol-relative navigation is not allowed')
  let url: URL
  try { url = new URL(raw) }
  catch (error) { throw new TypeError('Invalid external navigation URL', { cause: error }) }
  if (url.protocol !== 'https:' || url.username || url.password || CONTROL_OR_BACKSLASH.test(url.toString())) {
    throw new TypeError('External navigation must be a credential-free HTTPS URL')
  }
  if (fragment) url.hash = fragment
  return url.toString()
}

function localizePath(pathname: string, locale: PublicSiteLocale): string {
  if (pathname === '/admin' || pathname.startsWith('/admin/')) return pathname
  const denied = INTERNAL_DENY.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`))
  if (denied) throw new TypeError('Internal application paths are not public navigation targets')
  if (pathname === '/zh' || pathname === '/en') return `/${locale}`
  if (pathname.startsWith('/zh/')) return `/${locale}${pathname.slice(3)}`
  if (pathname.startsWith('/en/')) return `/${locale}${pathname.slice(3)}`
  return pathname === '/' ? `/${locale}` : `/${locale}${pathname}`
}

function internalHref(value: string, locale: PublicSiteLocale, fragment: string | null): string {
  const raw = bounded(value, 2048)
  if (!raw.startsWith('/') || raw.startsWith('//')) throw new TypeError('Internal navigation must use an absolute application path')
  rejectTraversal(raw.split(/[?#]/u, 1)[0]!)
  const url = new URL(raw, 'https://public.invalid')
  if (url.origin !== 'https://public.invalid' || url.username || url.password) throw new TypeError('Invalid internal navigation URL')
  rejectTraversal(url.pathname)
  const localized = localizePath(url.pathname.replace(/\/{2,}/gu, '/'), locale)
  const query = url.search
  const hash = fragment ? `#${fragment}` : url.hash
  if (hash && !SAFE_FRAGMENT.test(hash.slice(1))) throw new TypeError('Invalid public navigation fragment')
  return normalizePublicListHref(`${localized}${query}${hash}`)
}

export function resolvePublicNavigation(input: PublicNavigationInput, localeInput: PublicSiteLocale): ResolvedPublicNavigation | null {
  if (!input || typeof input !== 'object') throw new TypeError('Public navigation input is required')
  const locale = localeValue(localeInput)
  const fragment = safeFragment(input.fragment)
  const kind = input.kind?.trim().toLowerCase() ?? ''
  const route = input.urlName?.trim() ? ROUTES[input.urlName.trim().toLowerCase()] : undefined
  const path = input.path?.trim() || null

  let href: string
  let external = false
  if (kind === 'external' || kind === '外链' || path?.startsWith('https://')) {
    if (!path) return null
    href = externalHref(path, fragment)
    external = true
  }
  else if (route !== undefined) {
    href = internalHref(route === '' ? '/' : route, locale, fragment)
  }
  else if (kind === 'anchor' || kind === '锚点') {
    if (!fragment) return null
    href = `/${locale}#${fragment}`
  }
  else if (path) {
    href = internalHref(path, locale, fragment)
  }
  else if (fragment) {
    href = `/${locale}#${fragment}`
  }
  else {
    return null
  }

  return {
    href,
    external,
    location: location(input.location),
    style: style(input.style),
    icon: icon(input.icon),
  }
}

export function publicRecordPath(localeInput: PublicSiteLocale, module: 'profiles' | 'publications' | 'projects' | 'patents' | 'students' | 'news' | 'courses' | 'research', value: string): string {
  const locale = localeValue(localeInput)
  const selected = bounded(value, 256)
  if (selected === '.' || selected === '..' || selected.includes('/')) {
    throw new TypeError('Public record identifier must be one unambiguous path segment')
  }
  const segment = encodeURIComponent(selected)
  const base = module === 'profiles' ? 'team' : module
  return `/${locale}/${base}/${segment}`
}

export function switchPublicLocalePath(path: string, targetLocale: PublicSiteLocale): string {
  const locale = localeValue(targetLocale)
  if (typeof path !== 'string' || !path.startsWith('/') || CONTROL_OR_BACKSLASH.test(path) || path.startsWith('//')) return `/${locale}`
  const raw = path.split(/[?#]/u, 1)[0]!
  if (raw === '/zh' || raw === '/en') return `/${locale}`
  if (raw.startsWith('/zh/')) return `/${locale}${raw.slice(3)}`
  if (raw.startsWith('/en/')) return `/${locale}${raw.slice(3)}`
  return `/${locale}`
}
