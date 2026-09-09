import { hasUnpairedSurrogate } from './unicode'

/** One catalogue for the public API and the navigation editor; values remain database values. */
export const PUBLIC_LIST_TARGETS = [
  { module: 'team', label: '教师与团队', filters: { role: '角色', organization: '单位' } },
  { module: 'publications', label: '论文', filters: { year: '年份', venue: '期刊／会议', publicationType: '论文类型', indexType: '收录类型', featured: '精选（1/0）' } },
  { module: 'publications/featured', label: '精选论文', filters: { year: '年份', venue: '期刊／会议', publicationType: '论文类型', indexType: '收录类型' } },
  { module: 'projects', label: '科研项目', filters: { year: '开始年份', source: '项目来源', fundName: '基金计划', role: '承担角色', status: '项目状态' } },
  { module: 'patents', label: '专利与软件著作', filters: { year: '年份', country: '国家', patentType: '类型', legalStatus: '法律状态' } },
  { module: 'students', label: '学生', filters: { category: '分类', degree: '学位', grade: '年级', direction: '研究方向', status: '状态' } },
  { module: 'news', label: '新闻动态', filters: { category: '分类', year: '发布年份' } },
  { module: 'courses', label: '课程', filters: { semester: '学期', audience: '授课对象' } },
  { module: 'research', label: '研究方向', filters: {} },
] as const

type Query = Readonly<Record<string, unknown>>
const encoder = new TextEncoder()
const decoder = new TextDecoder('utf-8', { fatal: true })
const ASCII = /^[\x20-\x7e]*$/u
const KEY = /^[a-z][a-zA-Z0-9]*$/u
const RESERVED = new Set(['f', 'locale', 'page', 'pageSize', 'constructor', 'prototype'])

export function publicListDefinition(path: string) {
  const module = path.replace(/^\/(?:zh|en)(?=\/)/u, '').replace(/^\//u, '').replace(/\/$/u, '')
  return PUBLIC_LIST_TARGETS.find(target => target.module === module)
}

export function publicFilterKeys(module: string): string[] {
  const target = publicListDefinition(module)
  if (!target) throw new TypeError('Unsupported public list')
  return [...Object.keys(target.filters), ...(module === 'publications/featured' ? ['featured'] : [])]
}

function pack(value: string): string {
  return btoa(Array.from(encoder.encode(value), byte => String.fromCharCode(byte)).join(''))
    .replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '')
}

/** Decode the bounded UTF-8 envelope once. Plain legacy parameters remain accepted. */
export function unpackPublicListQuery(query: Query): Record<string, unknown> {
  const plain: Record<string, unknown> = { ...query }
  const f = plain.f
  delete plain.f
  if (f === undefined) return plain
  if (typeof f !== 'string' || !f || f.length > 8192 || !/^[A-Za-z0-9_-]+$/u.test(f)) throw new TypeError('Invalid filter envelope')
  const binary = atob(f.replace(/-/gu, '+').replace(/_/gu, '/'))
  const json = decoder.decode(Uint8Array.from(binary, char => char.charCodeAt(0)))
  if (pack(json) !== f) throw new TypeError('Invalid filter encoding')
  const decoded: unknown = JSON.parse(json)
  if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) throw new TypeError('Invalid filter object')
  for (const [key, value] of Object.entries(decoded)) {
    if (!KEY.test(key) || RESERVED.has(key) || Object.hasOwn(plain, key) || typeof value !== 'string') throw new TypeError('Ambiguous filter parameter')
    plain[key] = value
  }
  return plain
}

/** Pack non-ASCII values, retaining readable ASCII years, flags and pagination. */
export function encodePublicListQuery(query: Query): string {
  const parameters = new URLSearchParams()
  const packed: Record<string, string> = {}
  for (const key of Object.keys(query).sort()) {
    const input = query[key]
    if (input === undefined || input === null || input === '') continue
    if (!KEY.test(key) || key === 'f' || key === 'constructor' || key === 'prototype' || (typeof input !== 'string' && typeof input !== 'number')) throw new TypeError('Invalid public query parameter')
    const value = String(input).trim().normalize('NFC')
    if (!value) continue
    if (hasUnpairedSurrogate(value) || /[\u0000-\u001f\u007f]/u.test(value) || encoder.encode(value).length > (key === 'q' ? 256 : 192)) throw new TypeError('Public query value is too long or invalid')
    if ((key === 'page' && value === '1') || (key === 'pageSize' && value === '12')) continue
    if (ASCII.test(value)) parameters.set(key, value)
    else {
      if (RESERVED.has(key)) throw new TypeError('Invalid public query control')
      packed[key] = value
    }
  }
  if (Object.keys(packed).length) parameters.set('f', pack(JSON.stringify(packed)))
  return parameters.toString()
}

/** Apply logical changes to a route query; all list controls and locale links share this. */
export function publicListHref(path: string, query: Query, changes: Query = {}, hash = ''): string {
  const target = publicListDefinition(path)
  if (!target) throw new TypeError('Unsupported public list path')
  const values = { ...unpackPublicListQuery(query), ...changes }
  const allowed = new Set(['q', 'page', 'pageSize', 'nav', ...publicFilterKeys(target.module)])
  for (const key of Object.keys(values)) if (!allowed.has(key)) throw new TypeError(`Unsupported public filter: ${key}`)
  if (target.module === 'publications/featured' && values.featured != null) {
    if (String(values.featured) !== '1') throw new TypeError('Featured is fixed for this route')
    delete values.featured
  }
  const search = encodePublicListQuery(values)
  return `${path}${search ? `?${search}` : ''}${hash}`
}

/** A configured filter button owns a durable scope; q remains available for a second search. */
export function scopedNavigationHref(href: string, uid: string): string {
  if (!href.startsWith('/') || href.startsWith('//')) return href
  const url = new URL(href, 'https://public.invalid')
  const definition = publicListDefinition(url.pathname)
  if (!definition) return href
  const query = unpackPublicListQuery(Object.fromEntries(url.searchParams))
  const keys = publicFilterKeys(definition.module)
  if (!query.q && !keys.some(key => query[key] != null) && definition.module !== 'publications/featured') return href
  return publicListHref(url.pathname, query, { nav: uid, q: null }, url.hash)
}

/** Normalize a full internal list URL, including old percent-encoded Chinese links. */
export function normalizePublicListHref(href: string): string {
  if (!href.startsWith('/') || href.startsWith('//')) return href
  const url = new URL(href, 'https://public.invalid')
  if (!publicListDefinition(url.pathname)) return href
  const query: Record<string, unknown> = Object.create(null)
  for (const [key, value] of url.searchParams) {
    if (Object.hasOwn(query, key)) throw new TypeError('Repeated public query parameter')
    query[key] = value
  }
  return publicListHref(url.pathname, query, {}, url.hash)
}

/** Vue Router leaves colons unescaped when rebuilding a route from its query object. */
export function publicListRedirect(href: string): string | null {
  const canonical = normalizePublicListHref(href)
  const url = new URL(href, 'https://public.invalid')
  const search = url.searchParams.toString()
  const comparable = `${url.pathname}${search ? `?${search}` : ''}${url.hash}`
  // Compare equivalent encodings, while still redirecting old Chinese filters into f.
  return canonical === comparable ? null : canonical
}
