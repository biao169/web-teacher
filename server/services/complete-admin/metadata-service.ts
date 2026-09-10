import { PUBLIC_CONTENT_ORDER, PUBLIC_HOME_PROFILE_BASE } from '../../../db/public-content-rules'
import type { H3Event } from 'h3'
import {
  PUBLICATION_METADATA_PROVIDERS,
  normalizePublicationDoi,
  publicationTitleSimilarity,
  type PublicationMetadataFields,
  type PublicationMetadataProvider,
} from '../../../shared/admin/publication-tools'
import { resolveAdminDatabase } from '../../utils/complete-admin/db'

type RawRecord = Record<string, unknown>
type LookupMode = 'doi' | 'title'
type AttemptStatus = 'success' | 'not_found' | 'rate_limited' | 'temporary_failure' | 'unavailable'

interface MetadataSettings extends Record<string, unknown> {
  publication_metadata_provider?: unknown
  publication_metadata_providers?: unknown
  notify_email?: unknown
  patentsview_api_key?: unknown
}

interface ProviderResult {
  provider: PublicationMetadataProvider
  matchScore: number
  fields: PublicationMetadataFields
}

interface ProviderAttempt {
  provider: PublicationMetadataProvider
  status: AttemptStatus
  message: string
}

export interface PublicationLookupResponse {
  query: { mode: LookupMode; value: string }
  requestedProvider: PublicationMetadataProvider | 'auto'
  selectedProvider: PublicationMetadataProvider | null
  availableProviders: readonly PublicationMetadataProvider[]
  attempts: readonly ProviderAttempt[]
  result: ProviderResult | null
}

export interface HomepageProfileResponse {
  profile: null | {
    uid: string
    name: string
    nameEn: string
    names: readonly string[]
  }
}

const cache = new Map<string, { expires: number; value: ProviderResult }>()
const PROVIDER_SET = new Set<string>(PUBLICATION_METADATA_PROVIDERS)

function record(value: unknown): RawRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as RawRecord : {}
}

function records(value: unknown): RawRecord[] {
  return Array.isArray(value) ? value.map(record) : []
}

function text(value: unknown): string {
  return String(value ?? '').normalize('NFC').replace(/\s+/gu, ' ').trim()
}

function firstText(value: unknown): string {
  if (!Array.isArray(value)) return text(value)
  return text(value.find(item => text(item)) ?? '')
}

function textList(value: unknown, limit = 100): string[] {
  return Array.isArray(value) ? value.map(text).filter(Boolean).slice(0, limit) : []
}

function yearValue(value: unknown): number | undefined {
  const year = Number(value)
  return Number.isSafeInteger(year) && year >= 1000 && year <= 9999 ? year : undefined
}

function containsControlCharacter(value: string): boolean {
  return [...value].some(character => {
    const code = character.codePointAt(0) ?? 0
    return code < 32 || code === 127
  })
}

function cleanAbstract(value: unknown): string {
  return text(value)
    .replace(/<[^>]+>/gu, ' ')
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&amp;/gu, '&')
    .replace(/&quot;/gu, '"')
    .replace(/&#39;/gu, "'")
    .replace(/\s+/gu, ' ')
    .trim()
}

function publicationType(value: unknown): string | undefined {
  const type = text(value).toLowerCase()
  if (!type) return undefined
  if (/(journal|article)/u.test(type)) return '期刊论文'
  if (/(proceedings|conference)/u.test(type)) return '会议论文'
  if (/(book|chapter)/u.test(type)) return '书籍章节'
  if (/(preprint|posted)/u.test(type)) return '预印本'
  if (/(thesis|dissertation)/u.test(type)) return '学位论文'
  return '其他'
}

function validProvider(value: unknown): PublicationMetadataProvider | null {
  const candidate = text(value).toLowerCase()
  return PROVIDER_SET.has(candidate) ? candidate as PublicationMetadataProvider : null
}

function configuredProviders(settings: MetadataSettings): PublicationMetadataProvider[] {
  let configured: unknown = settings.publication_metadata_providers
  if (typeof configured === 'string') {
    try { configured = JSON.parse(configured) }
    catch { configured = [] }
  }
  const providers = Array.isArray(configured)
    ? configured.map(validProvider).filter((provider): provider is PublicationMetadataProvider => provider !== null)
    : []
  const fallback = validProvider(settings.publication_metadata_provider) ?? 'crossref'
  const result = [...new Set(providers.length ? providers : PUBLICATION_METADATA_PROVIDERS)]
  return [fallback, ...result.filter(provider => provider !== fallback)]
}

function normalizeLookup(input: unknown): { mode: LookupMode; value: string; requestedProvider: PublicationMetadataProvider | 'auto' } {
  const query = record(input)
  const requestedText = text(query.provider || 'auto').toLowerCase()
  const requestedProvider = requestedText === 'auto' ? 'auto' : validProvider(requestedText)
  if (!requestedProvider) throw new Error('INVALID_METADATA_PROVIDER')
  const rawDoi = text(query.doi)
  if (rawDoi) {
    const doi = normalizePublicationDoi(rawDoi)
    if (!/^10\.\d{4,9}\/\S+$/u.test(doi) || doi.length > 300) throw new Error('INVALID_DOI')
    return { mode: 'doi', value: doi, requestedProvider }
  }
  const title = text(query.title)
  if (title.length < 4 || title.length > 500 || containsControlCharacter(title)) throw new Error('INVALID_PUBLICATION_TITLE')
  return { mode: 'title', value: title, requestedProvider }
}

async function fetchJson(url: string, headers: Record<string, string> = {}): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 12_000)
  try {
    const response = await fetch(url, { headers, signal: controller.signal, redirect: 'error' })
    if (!response.ok) {
      if (response.status === 404) throw new Error('METADATA_NOT_FOUND')
      if (response.status === 429) throw new Error('METADATA_RATE_LIMITED')
      if (response.status >= 500) throw new Error('METADATA_TEMPORARY_FAILURE')
      throw new Error('METADATA_PROVIDER_UNAVAILABLE')
    }
    if (!(response.headers.get('content-type') ?? '').toLowerCase().includes('json')) throw new Error('METADATA_PROVIDER_UNAVAILABLE')
    return await response.json()
  }
  catch (failure) {
    if (failure instanceof Error && failure.name === 'AbortError') throw new Error('METADATA_TEMPORARY_FAILURE', { cause: failure })
    throw failure
  }
  finally { clearTimeout(timer) }
}

export function crossrefResult(payload: unknown, query: { mode: LookupMode; value: string }): ProviderResult {
  const root = record(payload)
  const message = record(root.message)
  const candidates = query.mode === 'doi' ? [message] : records(message.items)
  if (!candidates.length) throw new Error('METADATA_NOT_FOUND')
  const selected = query.mode === 'title'
    ? [...candidates].sort((left, right) => publicationTitleSimilarity(firstText(right.title), query.value) - publicationTitleSimilarity(firstText(left.title), query.value))[0]!
    : candidates[0]!
  const authorNames = records(selected.author).map(author => text([author.given, author.family].map(text).filter(Boolean).join(' '))).filter(Boolean)
  const issued = record(selected.issued)
  const dateParts = Array.isArray(issued['date-parts']) ? issued['date-parts'] as unknown[] : []
  const year = yearValue(Array.isArray(dateParts[0]) ? dateParts[0][0] : undefined)
  const doi = normalizePublicationDoi(selected.DOI || (query.mode === 'doi' ? query.value : ''))
  const title = firstText(selected.title)
  return {
    provider: 'crossref',
    matchScore: query.mode === 'doi' ? 1 : publicationTitleSimilarity(title, query.value),
    fields: {
      title,
      authors: authorNames.join('; '),
      venue: firstText(selected['container-title']),
      ...(year ? { year } : {}),
      volume: text(selected.volume), issue: text(selected.issue), pages: text(selected.page), doi,
      url: text(selected.URL) || (doi ? `https://doi.org/${doi}` : ''),
      publication_type: publicationType(selected.type),
      abstract: cleanAbstract(selected.abstract),
      keywords: textList(selected.subject).join('；'),
    },
  }
}

function openAlexAbstract(value: unknown): string {
  const index = record(value)
  const positioned: Array<[number, string]> = []
  for (const [word, rawPositions] of Object.entries(index)) {
    if (!Array.isArray(rawPositions)) continue
    for (const raw of rawPositions) {
      const position = Number(raw)
      if (Number.isSafeInteger(position) && position >= 0 && position < 100_000) positioned.push([position, word])
    }
  }
  return positioned.sort((left, right) => left[0] - right[0]).map(([, word]) => word).join(' ')
}

export function openAlexResult(payload: unknown, query: { mode: LookupMode; value: string }): ProviderResult {
  const root = record(payload)
  const candidates = query.mode === 'doi' ? [root] : records(root.results)
  if (!candidates.length) throw new Error('METADATA_NOT_FOUND')
  const selected = query.mode === 'title'
    ? [...candidates].sort((left, right) => publicationTitleSimilarity(right.title, query.value) - publicationTitleSimilarity(left.title, query.value))[0]!
    : candidates[0]!
  const title = text(selected.title || selected.display_name)
  const authorships = records(selected.authorships)
  const authors = authorships.map(item => text(record(item.author).display_name)).filter(Boolean)
  const correspondingAuthors = authorships
    .filter(item => item.is_corresponding === true)
    .map(item => text(record(item.author).display_name)).filter(Boolean)
  const location = record(selected.primary_location)
  const source = record(location.source)
  const biblio = record(selected.biblio)
  const doi = normalizePublicationDoi(selected.doi || (query.mode === 'doi' ? query.value : ''))
  const year = yearValue(selected.publication_year)
  return {
    provider: 'openalex',
    matchScore: query.mode === 'doi' ? 1 : publicationTitleSimilarity(title, query.value),
    fields: {
      title, authors: authors.join('; '), corresponding_authors: [...new Set(correspondingAuthors)].join('; '), venue: text(source.display_name),
      ...(year ? { year } : {}),
      volume: text(biblio.volume), issue: text(biblio.issue),
      pages: [text(biblio.first_page), text(biblio.last_page)].filter(Boolean).join('-'),
      doi, url: text(location.landing_page_url) || (doi ? `https://doi.org/${doi}` : ''),
      publication_type: publicationType(selected.type || selected.type_crossref),
      abstract: openAlexAbstract(selected.abstract_inverted_index),
      keywords: records(selected.keywords).map(item => text(item.display_name || item.keyword)).filter(Boolean).join('；'),
    },
  }
}

export function dataCiteResult(payload: unknown, query: { mode: LookupMode; value: string }): ProviderResult {
  const root = record(payload)
  const candidates = Array.isArray(root.data) ? records(root.data) : [record(root.data)]
  if (!candidates.length || !Object.keys(candidates[0] ?? {}).length) throw new Error('METADATA_NOT_FOUND')
  const candidateTitle = (candidate: RawRecord): string => text(records(record(candidate.attributes).titles)[0]?.title)
  const selected = query.mode === 'title'
    ? [...candidates].sort((left, right) => publicationTitleSimilarity(candidateTitle(right), query.value) - publicationTitleSimilarity(candidateTitle(left), query.value))[0]!
    : candidates[0]!
  const attributes = record(selected.attributes)
  const title = candidateTitle(selected)
  const creators = records(attributes.creators)
  const contributors = records(attributes.contributors)
  const corresponding = contributors.filter(item => /contactperson|projectleader|projectmanager/iu.test(text(item.contributorType)))
    .map(item => text(item.name || [item.givenName, item.familyName].map(text).filter(Boolean).join(' '))).filter(Boolean)
  const doi = normalizePublicationDoi(attributes.doi || selected.id || (query.mode === 'doi' ? query.value : ''))
  return {
    provider: 'datacite', matchScore: query.mode === 'doi' ? 1 : publicationTitleSimilarity(title, query.value),
    fields: {
      title,
      authors: creators.map(item => text(item.name || [item.givenName, item.familyName].map(text).filter(Boolean).join(' '))).filter(Boolean).join('; '),
      corresponding_authors: [...new Set(corresponding)].join('; '),
      venue: text(record(attributes.container).title || attributes.publisher),
      year: yearValue(attributes.publicationYear), doi,
      url: text(attributes.url) || (doi ? `https://doi.org/${doi}` : ''),
      publication_type: publicationType(record(attributes.types).resourceTypeGeneral || record(attributes.types).resourceType),
      abstract: cleanAbstract(records(attributes.descriptions).find(item => /abstract/iu.test(text(item.descriptionType)))?.description),
      keywords: records(attributes.subjects).map(item => text(item.subject)).filter(Boolean).join('；'),
    },
  }
}

export function europePmcResult(payload: unknown, query: { mode: LookupMode; value: string }): ProviderResult {
  const candidates = records(record(record(payload).resultList).result)
  if (!candidates.length) throw new Error('METADATA_NOT_FOUND')
  const selected = query.mode === 'title'
    ? [...candidates].sort((left, right) => publicationTitleSimilarity(right.title, query.value) - publicationTitleSimilarity(left.title, query.value))[0]!
    : candidates[0]!
  const title = text(selected.title)
  const authors = records(record(selected.authorList).author).map(item => text(item.fullName || [item.firstName, item.lastName].map(text).filter(Boolean).join(' '))).filter(Boolean)
  const doi = normalizePublicationDoi(selected.doi || (query.mode === 'doi' ? query.value : ''))
  return {
    provider: 'europe-pmc', matchScore: query.mode === 'doi' ? 1 : publicationTitleSimilarity(title, query.value),
    fields: {
      title, authors: authors.length ? authors.join('; ') : text(selected.authorString).replace(/,\s*/gu, '; '),
      venue: text(selected.journalTitle), year: yearValue(selected.pubYear), volume: text(selected.journalVolume),
      issue: text(selected.issue), pages: text(selected.pageInfo), doi,
      url: doi ? `https://doi.org/${doi}` : text(selected.fullTextUrlList),
      publication_type: publicationType(selected.pubType),
    },
  }
}

export function pubmedSummaryResult(payload: unknown, query: { mode: LookupMode; value: string }): ProviderResult {
  const result = record(record(payload).result)
  const uids = textList(result.uids, 10)
  const candidates = uids.map(uid => record(result[uid])).filter(item => Object.keys(item).length)
  if (!candidates.length) throw new Error('METADATA_NOT_FOUND')
  const selected = query.mode === 'title'
    ? [...candidates].sort((left, right) => publicationTitleSimilarity(right.title, query.value) - publicationTitleSimilarity(left.title, query.value))[0]!
    : candidates[0]!
  const title = text(selected.title).replace(/\.$/u, '')
  const articleIds = records(selected.articleids)
  const doi = normalizePublicationDoi(articleIds.find(item => text(item.idtype).toLowerCase() === 'doi')?.value || (query.mode === 'doi' ? query.value : ''))
  const source = text(selected.fulljournalname || selected.source)
  return {
    provider: 'pubmed', matchScore: query.mode === 'doi' ? 1 : publicationTitleSimilarity(title, query.value),
    fields: {
      title, authors: records(selected.authors).map(item => text(item.name)).filter(Boolean).join('; '), venue: source,
      year: yearValue(text(selected.pubdate).match(/\b\d{4}\b/u)?.[0]), volume: text(selected.volume), issue: text(selected.issue), pages: text(selected.pages),
      doi, url: text(selected.uid) ? `https://pubmed.ncbi.nlm.nih.gov/${encodeURIComponent(text(selected.uid))}/` : (doi ? `https://doi.org/${doi}` : ''),
      publication_type: source ? '期刊论文' : undefined,
    },
  }
}

export function semanticScholarResult(payload: unknown, query: { mode: LookupMode; value: string }): ProviderResult {
  const root = record(payload)
  const candidates = query.mode === 'doi' ? [root] : records(root.data)
  if (!candidates.length) throw new Error('METADATA_NOT_FOUND')
  const selected = query.mode === 'title'
    ? [...candidates].sort((left, right) => publicationTitleSimilarity(right.title, query.value) - publicationTitleSimilarity(left.title, query.value))[0]!
    : candidates[0]!
  const title = text(selected.title)
  const externalIds = record(selected.externalIds)
  const journal = record(selected.journal)
  const doi = normalizePublicationDoi(externalIds.DOI || (query.mode === 'doi' ? query.value : ''))
  const venue = text(selected.venue || journal.name)
  const year = yearValue(selected.year)
  return {
    provider: 'semantic-scholar',
    matchScore: query.mode === 'doi' ? 1 : publicationTitleSimilarity(title, query.value),
    fields: {
      title,
      authors: records(selected.authors).map(author => text(author.name)).filter(Boolean).join('; '),
      venue, ...(year ? { year } : {}),
      volume: text(journal.volume), pages: text(journal.pages), doi,
      url: text(selected.url) || (doi ? `https://doi.org/${doi}` : ''),
      publication_type: venue ? '期刊论文' : undefined,
      abstract: cleanAbstract(selected.abstract),
      keywords: textList(selected.fieldsOfStudy).join('；'),
    },
  }
}

async function providerLookup(provider: PublicationMetadataProvider, query: { mode: LookupMode; value: string }, settings: MetadataSettings): Promise<ProviderResult> {
  const key = `${provider}:${query.mode}:${query.value.toLowerCase()}`
  const cached = cache.get(key)
  if (cached && cached.expires > Date.now()) return cached.value
  let result: ProviderResult
  if (provider === 'crossref') {
    const headers: Record<string, string> = { accept: 'application/json' }
    const notifyEmail = text(settings.notify_email)
    if (notifyEmail) headers['user-agent'] = `AcademicCMS/1.0 (mailto:${notifyEmail})`
    const url = query.mode === 'doi'
      ? `https://api.crossref.org/works/${encodeURIComponent(query.value)}`
      : `https://api.crossref.org/works?query.title=${encodeURIComponent(query.value)}&rows=5`
    result = crossrefResult(await fetchJson(url, headers), query)
  }
  else if (provider === 'openalex') {
    const contact = text(settings.notify_email)
    const mailto = contact ? `&mailto=${encodeURIComponent(contact)}` : ''
    const url = query.mode === 'doi'
      ? `https://api.openalex.org/works/https://doi.org/${encodeURIComponent(query.value)}?select=id,doi,title,display_name,publication_year,type,type_crossref,authorships,primary_location,biblio,abstract_inverted_index,keywords${mailto}`
      : `https://api.openalex.org/works?search=${encodeURIComponent(query.value)}&per-page=5${mailto}`
    result = openAlexResult(await fetchJson(url), query)
  }
  else if (provider === 'semantic-scholar') {
    const fields = 'title,authors,venue,year,journal,externalIds,url,abstract,fieldsOfStudy'
    const url = query.mode === 'doi'
      ? `https://api.semanticscholar.org/graph/v1/paper/DOI:${encodeURIComponent(query.value)}?fields=${fields}`
      : `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query.value)}&limit=5&fields=${fields}`
    result = semanticScholarResult(await fetchJson(url), query)
  }
  else if (provider === 'datacite') {
    const url = query.mode === 'doi'
      ? `https://api.datacite.org/dois/${encodeURIComponent(query.value)}`
      : `https://api.datacite.org/dois?query=titles.title:${encodeURIComponent(`"${query.value}"`)}&page[size]=5`
    result = dataCiteResult(await fetchJson(url, { accept: 'application/vnd.api+json' }), query)
  }
  else if (provider === 'europe-pmc') {
    const expression = query.mode === 'doi' ? `DOI:${query.value}` : `TITLE:"${query.value.replaceAll('"', '')}"`
    const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(expression)}&format=json&pageSize=5&resultType=core`
    result = europePmcResult(await fetchJson(url), query)
  }
  else {
    const term = query.mode === 'doi' ? `${query.value}[doi]` : `${query.value}[title]`
    const identity = `tool=${encodeURIComponent('academic-cms')}${text(settings.notify_email) ? `&email=${encodeURIComponent(text(settings.notify_email))}` : ''}`
    const search = record(await fetchJson(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmode=json&retmax=5&term=${encodeURIComponent(term)}&${identity}`))
    const ids = textList(record(search.esearchresult).idlist, 5)
    if (!ids.length) throw new Error('METADATA_NOT_FOUND')
    const payload = await fetchJson(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&retmode=json&id=${encodeURIComponent(ids.join(','))}&${identity}`)
    result = pubmedSummaryResult(payload, query)
  }
  cache.set(key, { expires: Date.now() + 600_000, value: result })
  if (cache.size > 500) cache.delete(cache.keys().next().value!)
  return result
}

function attemptFailure(provider: PublicationMetadataProvider, failure: unknown): ProviderAttempt {
  const code = failure instanceof Error ? failure.message : 'METADATA_TEMPORARY_FAILURE'
  if (code === 'METADATA_NOT_FOUND') return { provider, status: 'not_found', message: '该来源未找到匹配论文。' }
  if (code === 'METADATA_RATE_LIMITED') return { provider, status: 'rate_limited', message: '该来源当前限流，请稍后重试或切换来源。' }
  if (code === 'METADATA_PROVIDER_UNAVAILABLE') return { provider, status: 'unavailable', message: '该来源拒绝访问或响应格式异常。' }
  return { provider, status: 'temporary_failure', message: '该来源暂时不可用或查询超时。' }
}

function normalizePatent(value: unknown): string {
  const normalized = text(value).normalize('NFKC').toUpperCase().replace(/[^A-Z0-9]/gu, '')
  if (normalized.length < 5 || normalized.length > 40) throw new Error('INVALID_PATENT_NUMBER')
  return normalized
}

export class CompleteAdminMetadataService {
  constructor(private readonly event: H3Event) {}

  private async settings(): Promise<MetadataSettings> {
    const db = await resolveAdminDatabase(this.event)
    return await db.first<MetadataSettings>(`SELECT publication_metadata_provider, publication_metadata_providers, notify_email, patentsview_api_key FROM global_settings ORDER BY updated_at DESC,id DESC LIMIT 1`) ?? {}
  }

  async publication(input: unknown): Promise<PublicationLookupResponse> {
    const query = normalizeLookup(input)
    const settings = await this.settings()
    const availableProviders = configuredProviders(settings)
    const candidates = query.requestedProvider === 'auto' ? availableProviders : [query.requestedProvider]
    const attempts: ProviderAttempt[] = []
    for (const provider of candidates) {
      try {
        const result = await providerLookup(provider, { mode: query.mode, value: query.value }, settings)
        attempts.push({ provider, status: 'success', message: '查询成功。' })
        return {
          query: { mode: query.mode, value: query.value }, requestedProvider: query.requestedProvider,
          selectedProvider: provider, availableProviders, attempts, result,
        }
      }
      catch (failure) { attempts.push(attemptFailure(provider, failure)) }
    }
    return {
      query: { mode: query.mode, value: query.value }, requestedProvider: query.requestedProvider,
      selectedProvider: null, availableProviders, attempts, result: null,
    }
  }

  async homepageProfile(): Promise<HomepageProfileResponse> {
    const db = await resolveAdminDatabase(this.event)
    const row = await db.first<{ uid?: unknown; name?: unknown; name_en?: unknown }>(`
      SELECT uid, name, name_en FROM profiles
      WHERE ${PUBLIC_HOME_PROFILE_BASE.join(' AND ')}
      ORDER BY ${PUBLIC_CONTENT_ORDER.profiles}
      LIMIT 1
    `)
    if (!row) return { profile: null }
    const name = text(row.name)
    const nameEn = text(row.name_en)
    return {
      profile: {
        uid: text(row.uid),
        name,
        nameEn,
        names: [...new Set([name, nameEn].filter(Boolean))],
      },
    }
  }

  async doi(input: unknown): Promise<Record<string, unknown>> {
    const response = await this.publication({ doi: input, provider: 'auto' })
    if (!response.result) throw new Error(response.attempts.some(attempt => attempt.status === 'rate_limited') ? 'METADATA_RATE_LIMITED' : 'METADATA_NOT_FOUND')
    return { provider: response.result.provider, ...response.result.fields }
  }

  async patent(input: unknown): Promise<Record<string, unknown>> {
    const number = normalizePatent(input)
    const settings = await this.settings()
    const headers: Record<string, string> = { accept: 'application/json' }
    if (text(settings.patentsview_api_key)) headers['x-api-key'] = text(settings.patentsview_api_key)
    const fields = ['patent_id', 'patent_title', 'patent_date', 'patent_type', 'inventor_name_first', 'inventor_name_last', 'assignee_organization']
    const payload = record(await fetchJson(`https://search.patentsview.org/api/v1/patent/?q=${encodeURIComponent(JSON.stringify({ _or: [{ patent_id: number }, { patent_number: number }] }))}&f=${encodeURIComponent(JSON.stringify(fields))}`, headers))
    const row = records(payload.patents)[0] ?? records(payload.data)[0] ?? {}
    return {
      provider: 'patentsview', number, name: text(row.patent_title), patentType: text(row.patent_type),
      grantNumber: text(row.patent_id) || number, grantDate: text(row.patent_date) || null,
      inventors: records(row.inventors).map(item => [text(item.inventor_name_first), text(item.inventor_name_last)].filter(Boolean).join(' ')).filter(Boolean),
      owner: text(records(row.assignees)[0]?.assignee_organization),
    }
  }
}
