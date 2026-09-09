export const PUBLICATION_METADATA_PROVIDERS = [
  'crossref', 'openalex', 'semantic-scholar', 'datacite', 'europe-pmc', 'pubmed',
] as const

export type PublicationMetadataProvider = (typeof PUBLICATION_METADATA_PROVIDERS)[number]
export const PUBLICATION_METADATA_PROVIDER_LABELS: Readonly<Record<PublicationMetadataProvider, string>> = Object.freeze({
  crossref: 'Crossref',
  openalex: 'OpenAlex',
  'semantic-scholar': 'Semantic Scholar',
  datacite: 'DataCite',
  'europe-pmc': 'Europe PMC',
  pubmed: 'PubMed',
})
export type PublicationCitationFormat = 'bibtex' | 'ieee' | 'apa' | 'gbt' | 'elsevier' | 'generic'

export interface PublicationMetadataFields {
  title?: string | undefined
  authors?: string | undefined
  venue?: string | undefined
  year?: number | undefined
  volume?: string | undefined
  issue?: string | undefined
  pages?: string | undefined
  doi?: string | undefined
  url?: string | undefined
  publication_type?: string | undefined
  corresponding_authors?: string | undefined
  abstract?: string | undefined
  keywords?: string | undefined
}

export interface PublicationCitationParseResult {
  format: PublicationCitationFormat
  confidence: number
  fields: PublicationMetadataFields
  notes: readonly string[]
}

const DOI_PATTERN = /10\.\d{4,9}\/[\w.()/:+-]+/iu
const YEAR_PATTERN = /\b(?:18|19|20|21)\d{2}\b/u

function clean(value: unknown): string {
  return String(value ?? '').normalize('NFC').replace(/\s+/gu, ' ').trim()
}

function cleanTerminal(value: unknown): string {
  return clean(value).replace(/^[\s,.;:]+|[\s,.;:]+$/gu, '').trim()
}

export function normalizePublicationDoi(value: unknown): string {
  const source = clean(value).replace(/^doi\s*:\s*/iu, '').replace(/^https?:\/\/(?:dx\.)?doi\.org\//iu, '')
  const match = source.match(DOI_PATTERN)?.[0] ?? ''
  return match.replace(/[),.;\]}]+$/gu, '').toLowerCase()
}

export function normalizePublicationTitle(value: unknown): string {
  return clean(value)
    .toLocaleLowerCase()
    .replace(/[\p{P}\p{S}\s]+/gu, '')
}

export function publicationTitleSimilarity(left: unknown, right: unknown): number {
  const a = normalizePublicationTitle(left)
  const b = normalizePublicationTitle(right)
  if (!a || !b) return 0
  if (a === b) return 1
  if (a.includes(b) || b.includes(a)) return Math.min(a.length, b.length) / Math.max(a.length, b.length)
  const pairs = (value: string): Set<string> => {
    const result = new Set<string>()
    for (let index = 0; index < value.length - 1; index += 1) result.add(value.slice(index, index + 2))
    return result
  }
  const leftPairs = pairs(a)
  const rightPairs = pairs(b)
  if (!leftPairs.size || !rightPairs.size) return 0
  let overlap = 0
  for (const pair of leftPairs) if (rightPairs.has(pair)) overlap += 1
  return (2 * overlap) / (leftPairs.size + rightPairs.size)
}

function bibtexValue(source: string, key: string): string {
  const expression = new RegExp(`(?:^|[,\\n])\\s*${key}\\s*=\\s*(?:\\{([^{}]*(?:\\{[^{}]*\\}[^{}]*)*)\\}|"([^"]*)")`, 'iu')
  return clean(expression.exec(source)?.[1] ?? expression.exec(source)?.[2] ?? '')
}

function bibtexType(source: string): string | undefined {
  const type = source.match(/^\s*@([a-z]+)/iu)?.[1]?.toLowerCase()
  if (type === 'article') return '期刊论文'
  if (type === 'inproceedings' || type === 'conference') return '会议论文'
  if (type === 'incollection' || type === 'book' || type === 'inbook') return '书籍章节'
  if (type === 'phdthesis' || type === 'mastersthesis') return '学位论文'
  return type ? '其他' : undefined
}

function parseBibtex(source: string): PublicationCitationParseResult {
  const authors = bibtexValue(source, 'author').split(/\s+and\s+/iu).map(cleanTerminal).filter(Boolean).join('; ')
  const doi = normalizePublicationDoi(bibtexValue(source, 'doi'))
  const yearText = bibtexValue(source, 'year')
  const fields: PublicationMetadataFields = {
    title: cleanTerminal(bibtexValue(source, 'title').replace(/[{}]/gu, '')),
    authors,
    venue: cleanTerminal(bibtexValue(source, 'journal') || bibtexValue(source, 'booktitle')),
    ...(YEAR_PATTERN.test(yearText) ? { year: Number(yearText.match(YEAR_PATTERN)?.[0]) } : {}),
    volume: cleanTerminal(bibtexValue(source, 'volume')),
    issue: cleanTerminal(bibtexValue(source, 'number')),
    pages: cleanTerminal(bibtexValue(source, 'pages').replace(/--/gu, '-')),
    doi,
    url: cleanTerminal(bibtexValue(source, 'url')) || (doi ? `https://doi.org/${doi}` : ''),
    publication_type: bibtexType(source),
    abstract: cleanTerminal(bibtexValue(source, 'abstract')),
    keywords: cleanTerminal(bibtexValue(source, 'keywords')),
  }
  return finishParse('bibtex', fields, ['已按 BibTeX 字段名解析。'])
}

function detectFormat(source: string): PublicationCitationFormat {
  if (/^\s*@[a-z]+\s*\{/iu.test(source)) return 'bibtex'
  if (/\[[JCMDR]\]/iu.test(source)) return 'gbt'
  if (/^\s*\[?\d+\]?\s*[.,]?\s*(?:[A-Z]\.|[A-Z][a-z-]+).+"[^"]+"/u.test(source) || /\b(?:vol\.|no\.|pp\.)\s*\d/iu.test(source)) return 'ieee'
  if (/\b\d+\s*\(\s*(?:18|19|20|21)\d{2}\s*\)\s*\d+/u.test(source)) return 'elsevier'
  if (/\(\s*(?:18|19|20|21)\d{2}[a-z]?\s*\)/iu.test(source)) return 'apa'
  if (/\b(?:18|19|20|21)\d{2}\s*[,;:]\s*\d+(?:[-–]\d+)?/u.test(source)) return 'elsevier'
  return 'generic'
}

function finishParse(format: PublicationCitationFormat, candidate: PublicationMetadataFields, notes: readonly string[] = []): PublicationCitationParseResult {
  const fields = Object.fromEntries(Object.entries(candidate).filter(([, value]) => value !== '' && value !== undefined && value !== null)) as PublicationMetadataFields
  const useful = ['title', 'authors', 'venue', 'year', 'volume', 'issue', 'pages', 'doi'].filter(key => fields[key as keyof PublicationMetadataFields] !== undefined).length
  const confidence = Math.min(0.98, Number((0.26 + useful * 0.085 + (format === 'generic' ? 0 : 0.12)).toFixed(2)))
  return { format, confidence, fields, notes }
}

function citationParts(source: string): string[] {
  return source
    .replace(/^\s*\[?\d+\]?\s*[.,]?\s*/u, '')
    .split(/(?<!\b[A-Z])\.\s+(?=[\p{Lu}\p{Lt}\p{Lo}\d"“])/gu)
    .map(cleanTerminal)
    .filter(Boolean)
}

function parseGbt(source: string, doi: string): PublicationCitationParseResult {
  const body = source.replace(/\s*(?:doi\s*:\s*)?10\.\d{4,9}\/[\w.()/:+-]+[),.;\]}]*/iu, '').trim()
  const typeMatch = body.match(/\[([JCMDR])\]/iu)
  const beforeType = typeMatch ? body.slice(0, typeMatch.index) : body
  const parts = citationParts(beforeType)
  const after = typeMatch ? body.slice((typeMatch.index ?? 0) + typeMatch[0].length).replace(/^\s*[./]\s*/u, '') : (parts.slice(2).join('. '))
  const year = Number(after.match(YEAR_PATTERN)?.[0] ?? source.match(YEAR_PATTERN)?.[0] ?? 0) || undefined
  const venue = cleanTerminal(after.split(/,\s*(?=(?:18|19|20|21)\d{2}\b)/u)[0] ?? '')
  const volumeIssue = after.match(/(?:18|19|20|21)\d{2}\s*[,;]\s*([^,;:]+?)(?:\(([^)]+)\))?\s*[:;,]/u)
  const pages = cleanTerminal(after.match(/[:;,]\s*([A-Za-z]?\d+(?:[-–]\d+)?|e\d+)\.?\s*$/iu)?.[1] ?? '')
  const type = typeMatch?.[1]?.toUpperCase()
  return finishParse('gbt', {
    authors: parts[0], title: parts[1], venue, year,
    volume: cleanTerminal(volumeIssue?.[1] ?? ''), issue: cleanTerminal(volumeIssue?.[2] ?? ''), pages, doi,
    url: doi ? `https://doi.org/${doi}` : '',
    publication_type: type === 'J' ? '期刊论文' : type === 'C' ? '会议论文' : type === 'D' ? '学位论文' : type ? '其他' : undefined,
  }, ['GB/T 引文可能包含中文全角标点，应用前请核对作者分隔。'])
}

function parseApa(source: string, doi: string): PublicationCitationParseResult {
  const yearMatch = source.match(/\(\s*((?:18|19|20|21)\d{2})[a-z]?\s*\)/iu)
  const year = yearMatch ? Number(yearMatch[1]) : undefined
  const authors = cleanTerminal(yearMatch ? source.slice(0, yearMatch.index) : '')
  const rest = yearMatch ? source.slice((yearMatch.index ?? 0) + yearMatch[0].length).replace(/^\s*[.,]\s*/u, '') : source
  const parts = citationParts(rest.replace(/https?:\/\/doi\.org\/\S+|doi\s*:\s*10\.\S+/iu, ''))
  const journalPart = parts.slice(1).join('. ')
  const venue = cleanTerminal(journalPart.split(/,\s*\d+/u)[0] ?? '')
  const volumeIssue = journalPart.match(/,\s*(\d+)(?:\(([^)]+)\))?/u)
  const pages = cleanTerminal(journalPart.match(/,\s*([A-Za-z]?\d+(?:[-–]\d+)?|e\d+)\.?\s*$/iu)?.[1] ?? '')
  return finishParse('apa', {
    authors, year, title: parts[0], venue,
    volume: volumeIssue?.[1], issue: volumeIssue?.[2], pages, doi,
    url: doi ? `https://doi.org/${doi}` : '', publication_type: venue ? '期刊论文' : undefined,
  }, ['已识别 APA 的“作者—年份—题名”结构。'])
}

function parseIeee(source: string, doi: string): PublicationCitationParseResult {
  const body = source.replace(/^\s*\[?\d+\]?\s*[.,]?\s*/u, '')
  const quoted = body.match(/["“]([^"”]+)["”]/u)
  const title = cleanTerminal(quoted?.[1] ?? '')
  const authors = cleanTerminal(quoted ? body.slice(0, quoted.index) : citationParts(body)[0])
  const rest = quoted ? body.slice((quoted.index ?? 0) + quoted[0].length) : citationParts(body).slice(2).join('. ')
  const venue = cleanTerminal(rest
    .replace(/^\s*,?\s*(?:in\s+)?/iu, '')
    .split(/,\s*(?=(?:vol\.|no\.|pp\.|(?:18|19|20|21)\d{2}\b))/iu)[0] ?? '')
  const year = Number(rest.match(YEAR_PATTERN)?.[0] ?? 0) || undefined
  return finishParse('ieee', {
    authors, title, venue, year,
    volume: cleanTerminal(rest.match(/\bvol\.\s*([^,]+)/iu)?.[1] ?? ''),
    issue: cleanTerminal(rest.match(/\bno\.\s*([^,]+)/iu)?.[1] ?? ''),
    pages: cleanTerminal(rest.match(/\bpp?\.\s*([^,]+)/iu)?.[1] ?? ''),
    doi, url: doi ? `https://doi.org/${doi}` : '', publication_type: /\b(?:conference|proceedings)\b/iu.test(rest) ? '会议论文' : venue ? '期刊论文' : undefined,
  }, ['已识别 IEEE 的引号题名及 vol./no./pp. 字段。'])
}

function parseElsevierOrGeneric(source: string, doi: string, format: 'elsevier' | 'generic'): PublicationCitationParseResult {
  const withoutDoi = source.replace(/(?:https?:\/\/doi\.org\/|doi\s*:\s*)?10\.\d{4,9}\/[\w.()/:+-]+[),.;\]}]*/iu, '').trim()
  const parts = citationParts(withoutDoi)
  const yearText = source.match(YEAR_PATTERN)?.[0]
  const year = yearText ? Number(yearText) : undefined
  const tail = parts.slice(2).join('. ')
  const venue = cleanTerminal((tail || parts[2] || '').split(/,\s*(?=\d+|(?:18|19|20|21)\d{2})/u)[0] ?? '')
  const volumeIssue = (tail || source).match(/\b(\d+)\s*(?:\((\d+)\))?\s*[,;:]\s*(?:pp?\.\s*)?([A-Za-z]?\d+(?:[-–]\d+)?|e\d+)/iu)
  const elsevierVolume = (tail || source).match(/,\s*(\d+)\s*\(\s*(?:18|19|20|21)\d{2}\s*\)\s*([A-Za-z]?\d+(?:[-–]\d+)?|e\d+)/iu)
  return finishParse(format, {
    authors: parts[0], title: parts[1], venue, year,
    volume: elsevierVolume?.[1] ?? volumeIssue?.[1], issue: volumeIssue?.[2], pages: elsevierVolume?.[2] ?? volumeIssue?.[3], doi,
    url: doi ? `https://doi.org/${doi}` : '', publication_type: venue ? '期刊论文' : undefined,
  }, format === 'generic' ? ['未发现明确引文样式，已按通用“作者—题名—出版物”结构解析，请重点核对。'] : ['已按 Elsevier 常见顺序解析。'])
}

export function parsePublicationCitation(value: unknown): PublicationCitationParseResult {
  const source = clean(value)
  if (!source) return { format: 'generic', confidence: 0, fields: {}, notes: ['请先粘贴完整引文。'] }
  const format = detectFormat(source)
  if (format === 'bibtex') return parseBibtex(source)
  const doi = normalizePublicationDoi(source)
  if (format === 'gbt') return parseGbt(source, doi)
  if (format === 'apa') return parseApa(source, doi)
  if (format === 'ieee') return parseIeee(source, doi)
  return parseElsevierOrGeneric(source, doi, format)
}

export type PublicationCitationStyle = 'gbt' | 'elsevier' | 'apa' | 'ieee'

export interface PublicationCitationSource {
  uid?: string | undefined
  title?: string | undefined
  authors?: string | undefined
  venue?: string | undefined
  year?: number | string | undefined
  volume?: string | undefined
  issue?: string | undefined
  pages?: string | undefined
  doi?: string | undefined
  url?: string | undefined
  publication_type?: string | undefined
}

export interface PublicationGeneratedFields {
  citation_gbt: string
  highlight_gbt: string
  citation_elsevier: string
  highlight_elsevier: string
  citation_apa: string
  highlight_apa: string
  citation_ieee: string
  highlight_ieee: string
  bibtex: string
}

export interface PublicationCitationGenerationResult {
  fields: PublicationGeneratedFields
  matchedProfileNames: readonly string[]
  warnings: readonly string[]
}

function splitPublicationAuthors(value: unknown): string[] {
  const source = clean(value)
  if (!source) return []
  const primary = source.split(/\s*(?:;|；|\band\b|&)\s*/iu).map(cleanTerminal).filter(Boolean)
  return primary.flatMap(author => /\p{Script=Han}/u.test(author)
    ? author.split(/\s*[,，、]\s*/u).map(cleanTerminal).filter(Boolean)
    : [author])
}

function authorIdentity(value: unknown): string {
  return clean(value).toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')
}

function latinAuthorTokens(value: unknown): string[] {
  return clean(value).toLocaleLowerCase().match(/[a-z]+/gu)?.filter(Boolean) ?? []
}

function authorMatches(candidate: string, profileName: string): boolean {
  const candidateId = authorIdentity(candidate)
  const profileId = authorIdentity(profileName)
  if (!candidateId || !profileId) return false
  if (candidateId === profileId) return true
  const candidateTokens = latinAuthorTokens(candidate)
  const profileTokens = latinAuthorTokens(profileName)
  if (candidateTokens.length < 2 || profileTokens.length < 2) return false
  const sortedCandidate = [...candidateTokens].sort().join('|')
  const sortedProfile = [...profileTokens].sort().join('|')
  if (sortedCandidate === sortedProfile) return true
  const profileFamily = profileTokens.at(-1) ?? ''
  const profileGiven = profileTokens[0] ?? ''
  return candidateTokens.includes(profileFamily) && candidateTokens.some(token => token === profileGiven || token[0] === profileGiven[0])
}

interface CitationAuthorName {
  literal: string
  family: string
  given: string[]
  han: boolean
}

function citationAuthorName(value: string): CitationAuthorName {
  const literal = cleanTerminal(value)
  const han = /\p{Script=Han}/u.test(literal)
  if (han) return { literal, family: literal, given: [], han }
  const commaParts = literal.split(',').map(cleanTerminal).filter(Boolean)
  if (commaParts.length > 1) {
    return { literal, family: commaParts[0] ?? '', given: clean(commaParts.slice(1).join(' ')).split(/\s+/u).filter(Boolean), han }
  }
  const tokens = literal.split(/\s+/u).filter(Boolean)
  const family = tokens.pop() ?? ''
  return { literal, family, given: tokens, han }
}

function initials(parts: readonly string[], spaced = true): string {
  return parts.flatMap(part => part.split(/[-‐‑‒–—]/u).filter(Boolean))
    .map(part => part.match(/\p{L}/u)?.[0]?.toLocaleUpperCase() ?? '')
    .filter(Boolean).map(initial => initial + '.').join(spaced ? ' ' : '')
}

function apaAuthor(value: string): string {
  const author = citationAuthorName(value)
  if (author.han) return author.literal
  return [author.family, initials(author.given)].filter(Boolean).join(', ')
}

function ieeeAuthor(value: string): string {
  const author = citationAuthorName(value)
  if (author.han) return author.literal
  return [initials(author.given), author.family].filter(Boolean).join(' ')
}

function elsevierAuthor(value: string): string {
  const author = citationAuthorName(value)
  if (author.han) return author.literal
  return [author.family, initials(author.given, false)].filter(Boolean).join(', ')
}

function gbtAuthors(authors: readonly string[]): string {
  if (authors.length <= 3) return authors.join(', ')
  return authors.slice(0, 3).join(', ') + (authors.some(author => /\p{Script=Han}/u.test(author)) ? ', 等' : ', et al.')
}

function apaAuthors(authors: readonly string[]): string {
  const values = authors.map(apaAuthor)
  const displayed = values.length > 20 ? [...values.slice(0, 19), '…', values.at(-1)!] : values
  if (displayed.length === 1) return displayed[0] ?? ''
  return displayed.slice(0, -1).join(', ') + ', & ' + displayed.at(-1)
}

function joinCitationAuthors(authors: readonly string[], style: PublicationCitationStyle): string {
  if (!authors.length) return ''
  if (style === 'apa') return apaAuthors(authors)
  if (style === 'gbt') return gbtAuthors(authors)
  const values = authors.map(author => style === 'ieee' ? ieeeAuthor(author) : elsevierAuthor(author))
  if (style === 'ieee') return values.length === 1 ? values[0] ?? '' : values.slice(0, -1).join(', ') + ', and ' + values.at(-1)
  return values.join(', ')
}

function citationTypeMark(value: unknown): string {
  const type = clean(value).toLocaleLowerCase()
  if (/(会议|conference|proceedings)/u.test(type)) return 'C'
  if (/(书|book|chapter)/u.test(type)) return 'M'
  if (/(学位|thesis|dissertation)/u.test(type)) return 'D'
  if (/(报告|report)/u.test(type)) return 'R'
  return 'J'
}

function bibtexEntryType(value: unknown): string {
  const mark = citationTypeMark(value)
  if (mark === 'C') return 'inproceedings'
  if (mark === 'M') return 'incollection'
  if (mark === 'D') return 'phdthesis'
  if (mark === 'R') return 'techreport'
  return 'article'
}

function bibtexEscape(value: unknown): string {
  return clean(value).replace(/\\/gu, '\\\\').replace(/([{}])/gu, '\\$1')
}

function bibtexKey(source: PublicationCitationSource, authors: readonly string[]): string {
  const explicit = clean(source.uid).replace(/[^\p{L}\p{N}_:-]+/gu, '-')
  if (explicit) return explicit.slice(0, 96)
  const family = (latinAuthorTokens(authors[0]).at(-1) ?? authorIdentity(authors[0]) ?? 'publication').slice(0, 32)
  const year = clean(source.year) || 'nd'
  const titleWord = latinAuthorTokens(source.title)[0] ?? 'work'
  return (family + year + titleWord).replace(/[^a-z0-9_-]+/giu, '').slice(0, 96) || 'publication'
}

function matchedAuthors(authors: readonly string[], profileNames: readonly string[]): string[] {
  return authors.filter(author => profileNames.some(name => authorMatches(author, name)))
}

function citationHighlights(authors: readonly string[], style: PublicationCitationStyle): string {
  return authors.map(author => style === 'apa' ? apaAuthor(author) : style === 'ieee' ? ieeeAuthor(author) : style === 'elsevier' ? elsevierAuthor(author) : author).filter(Boolean).join('；')
}

function compactSentence(parts: readonly string[]): string {
  return parts.map(clean).filter(Boolean).join(' ')
}

function endWithPeriod(value: string): string {
  return value ? value.replace(/[.。]+$/u, '') + '.' : ''
}

export function generatePublicationCitations(source: PublicationCitationSource, profileNames: readonly string[] = []): PublicationCitationGenerationResult {
  const title = cleanTerminal(source.title)
  const authors = splitPublicationAuthors(source.authors)
  const venue = cleanTerminal(source.venue)
  const year = cleanTerminal(source.year)
  const volume = cleanTerminal(source.volume)
  const issue = cleanTerminal(source.issue)
  const pages = cleanTerminal(source.pages).replace(/--/gu, '-')
  const doi = normalizePublicationDoi(source.doi)
  const url = cleanTerminal(source.url) || (doi ? 'https://doi.org/' + doi : '')
  const normalizedProfiles = [...new Set(profileNames.map(clean).filter(Boolean))]
  const matches = matchedAuthors(authors, normalizedProfiles)
  const gbtAuthors = joinCitationAuthors(authors, 'gbt')
  const elsevierAuthors = joinCitationAuthors(authors, 'elsevier')
  const apaAuthors = joinCitationAuthors(authors, 'apa')
  const ieeeAuthors = joinCitationAuthors(authors, 'ieee')
  const mark = citationTypeMark(source.publication_type)

  const gbtTail = [venue, [year, volume + (issue ? '(' + issue + ')' : '')].filter(Boolean).join(', ')].filter(Boolean).join(', ')
    + (pages ? ': ' + pages : '')
  const citationGbt = compactSentence([
    endWithPeriod(gbtAuthors),
    title ? title + '[' + mark + '].' : '',
    gbtTail ? gbtTail + '.' : '',
    doi ? 'DOI: ' + doi + '.' : '',
  ])

  const elsevierVolume = [volume, year ? '(' + year + ')' : ''].filter(Boolean).join(' ')
  const citationElsevier = compactSentence([
    endWithPeriod(elsevierAuthors),
    title ? title + '.' : '',
    [venue, elsevierVolume, pages].filter(Boolean).join(', ') + ([venue, elsevierVolume, pages].some(Boolean) ? '.' : ''),
    doi ? 'https://doi.org/' + doi : url,
  ])

  const apaJournal = venue
    ? venue + (volume ? ', ' + volume : '') + (issue ? '(' + issue + ')' : '') + (pages ? ', ' + pages : '') + '.'
    : ''
  const citationApa = compactSentence([
    apaAuthors ? apaAuthors + (year ? ' (' + year + ').' : '.') : (year ? '(' + year + ').' : ''),
    title ? title + '.' : '',
    apaJournal,
    doi ? 'https://doi.org/' + doi : url,
  ])

  const ieeePublication = [
    venue,
    volume ? 'vol. ' + volume : '',
    issue ? 'no. ' + issue : '',
    pages ? 'pp. ' + pages : '',
    year,
  ].filter(Boolean).join(', ')
  const citationIeee = compactSentence([
    ieeeAuthors ? ieeeAuthors + ',' : '',
    title ? '“' + title + ',”' : '',
    ieeePublication ? ieeePublication + '.' : '',
    doi ? 'doi: ' + doi + '.' : '',
  ])

  const bibtexFields: Array<[string, string]> = [
    ['title', title],
    ['author', authors.join(' and ')],
    [mark === 'C' ? 'booktitle' : mark === 'M' ? 'booktitle' : 'journal', venue],
    ['year', year],
    ['volume', volume],
    ['number', issue],
    ['pages', pages.replace(/-/gu, '--')],
    ['doi', doi],
    ['url', url],
  ]
  const bibtexBody = bibtexFields.filter(([, value]) => Boolean(value)).map(([key, value]) => '  ' + key + ' = {' + bibtexEscape(value) + '}').join(',\n')
  const bibtex = '@' + bibtexEntryType(source.publication_type) + '{' + bibtexKey(source, authors) + ',\n' + bibtexBody + '\n}'

  const warnings: string[] = []
  if (!title) warnings.push('缺少论文标题，生成结果不完整。')
  if (!authors.length) warnings.push('缺少作者，无法生成作者段和教师姓名高亮。')
  if (!venue) warnings.push('缺少期刊或会议名称。')
  if (!year) warnings.push('缺少发表年份。')
  if (normalizedProfiles.length && !matches.length) warnings.push('当前作者列表中未匹配到主页教师的中英文姓名，请核对作者写法。')

  return {
    fields: {
      citation_gbt: citationGbt,
      highlight_gbt: citationHighlights(matches, 'gbt'),
      citation_elsevier: citationElsevier,
      highlight_elsevier: citationHighlights(matches, 'elsevier'),
      citation_apa: citationApa,
      highlight_apa: citationHighlights(matches, 'apa'),
      citation_ieee: citationIeee,
      highlight_ieee: citationHighlights(matches, 'ieee'),
      bibtex,
    },
    matchedProfileNames: matches,
    warnings,
  }
}
