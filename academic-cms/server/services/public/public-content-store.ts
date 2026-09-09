import { PUBLIC_PROFILE_LINK_COLUMNS, readPublicProfileLinks } from './public-profile-links'
import type { PublicAcademicLink } from '../../../shared/contracts/public-content'
import { PUBLIC_CONTENT_ORDER, PUBLIC_CONTENT_BASE, PUBLIC_PROFILE_CONTACT_SQL } from '../../../db/public-content-rules'
import { isPublicCitationStyle } from '../../../shared/contracts/public-citation'
import type { PublicCitationInput } from './public-citation'
import type { DatabaseAdapter, QueryResult, RawRow, SqlCommand, SqlValue } from '../../../db/contracts'
import type { VisibilityScope } from '../../../shared/enums/auth'
import { read } from '../../../db/query'
import { sha256Hex } from '../../view-model/serializer'
import type { PublicNumberedRecord } from '../../../shared/contracts/public-content'
import { PUBLIC_SELECTION_BATCH_SIZE } from '../../../shared/contracts/public-selection'
import { PUBLIC_PROFILE_BIOGRAPHY_MAX_BYTES } from '../../../shared/contracts/public-site'
import type { PublicListRequest } from './public-query'
import { sqlSearchPattern } from './public-query'
import { manyRows, oneRow, parseFacetRows, rowBoolean, rowCount, rowDate, rowInteger, rowOptionalText, rowRequiredText, rowTimestamp, rowVisibilityScope } from './public-store-helpers'
import type { RawFacet } from './public-page'
import { PublicSiteError } from './errors'

export type PublicListSnapshot<T> = { items: Array<T & PublicNumberedRecord>; total: number; totalPublic: number; revision: string; facets: RawFacet[] }

type FilterSpec = Readonly<Record<string, string>>
type QueryConfig = {
  from: string
  base: readonly string[]
  search: readonly string[]
  filters: FilterSpec
  baseParams?: readonly SqlValue[]
  forwardNumbers?: boolean
  members?: readonly string[]
}

function whereFor(
  request: PublicListRequest,
  config: QueryConfig,
  excludeFilter: string | null = null,
  extraClauses: readonly string[] = [],
): { sql: string; params: SqlValue[] } {
  const clauses = [...config.base, ...extraClauses]
  const params: SqlValue[] = [...(config.baseParams ?? [])]
  if (request.selectedUids) {
    if (!request.selectedUids.length || request.selectedUids.length > PUBLIC_SELECTION_BATCH_SIZE) throw new PublicSiteError('PUBLIC_LIMIT', 'Invalid selection batch')
    clauses.push(`uid IN (${request.selectedUids.map(() => '?').join(', ')})`)
    params.push(...request.selectedUids)
  }
  for (const search of [request.scope?.search, request.search]) {
    const pattern = sqlSearchPattern(search ?? null)
    if (pattern) {
      clauses.push(`(${config.search.map(field => `COALESCE(${field}, '') LIKE ? ESCAPE '\\' COLLATE NOCASE`).join(' OR ')})`)
      params.push(...config.search.map(() => pattern))
    }
  }
  for (const [key, value] of Object.entries(request.filters)) {
    if (key === excludeFilter && !Object.hasOwn(request.scope?.filters ?? {}, key)) continue
    const expression = config.filters[key]
    if (!expression) throw new PublicSiteError('PUBLIC_INPUT', `Unsupported public filter: ${key}`)
    clauses.push(config.members?.includes(key)
      ? `EXISTS (SELECT 1 FROM ${memberTable(expression, key)} AS member WHERE ${trimSql('member.value')} = ?)`
      : `${trimSql(expression)} = ?`)
    params.push(value)
  }
  return { sql: clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '', params }
}

const SQL_WHITESPACE = "' ' || char(9) || char(10) || char(13) || char(160) || char(12288)"
function trimSql(expression: string): string { return `trim(CAST(${expression} AS TEXT), ${SQL_WHITESPACE})` }
function memberTable(expression: string, key: string): string {
  let text = `replace(COALESCE(${expression}, ''), '；', ';')`
  // Existing index data also uses commas, pipes and newlines. Other fields split only semicolons.
  if (key === 'indexType') for (const separator of ["','", "'，'", "'、'", "'|'", 'char(10)']) text = `replace(${text}, ${separator}, ';')`
  return `json_each('[' || replace(json_quote(${text}), ';', '","') || ']')`
}
function facetArm(request: PublicListRequest, config: QueryConfig, key: string, expression: string) {
  const multi = config.members?.includes(key)
  const value = trimSql(multi ? 'member.value' : expression)
  const where = whereFor(request, config, key)
  const from = `${config.from}${multi ? `, ${memberTable(expression, key)} AS member` : ''}`
  return {
    sql: `SELECT '${key}' AS filter_key, ${value} AS value, COUNT(DISTINCT ${config.from}.id) AS total
      FROM ${from}${where.sql} AND ${value} <> '' AND length(CAST(${value} AS BLOB)) <= 192 GROUP BY ${value}`,
    params: where.params,
  }
}
function facetCommand(request: PublicListRequest, config: QueryConfig, columns: FilterSpec): SqlCommand {
  const arms = Object.entries(columns).map(([key, expression]) => facetArm(request, config, key, expression))
  if (!arms.length) return read(`SELECT '' AS filter_key, '' AS value, 0 AS total WHERE 0`)
  const selected = Object.entries(request.filters).filter(([key]) => Object.hasOwn(columns, key))
  return read(`WITH facet_values AS (${arms.map(arm => arm.sql).join(' UNION ALL ')}), ranked AS (
      SELECT filter_key, value, total,
        ROW_NUMBER() OVER (PARTITION BY filter_key ORDER BY CASE WHEN filter_key = 'year' THEN value END DESC, total DESC, value ASC) AS facet_rank
      FROM facet_values
    ) SELECT filter_key, value, total FROM ranked WHERE facet_rank <= 40${selected.map(() => ' OR (filter_key = ? AND value = ?)').join('')}
    ORDER BY filter_key ASC, facet_rank ASC`, [...arms.flatMap(arm => arm.params), ...selected.flat()])
}

/** Only base visibility contributes to numbering; query/fixed filters run afterwards. */
function hasListFilters(request: PublicListRequest): boolean {
  return Boolean(request.selectedUids) || Boolean(request.search) || Boolean(request.scope?.search) || Object.keys(request.filters).length > 0
}

function listCommands(request: PublicListRequest, config: QueryConfig, select: string, order: string, facets: FilterSpec): SqlCommand[] {
  const where = whereFor(request, config)
  const base = { sql: ` WHERE ${config.base.join(' AND ')}`, params: [...(config.baseParams ?? [])] }
  const offset = (request.page - 1) * request.pageSize
  const filtered = hasListFilters(request)
  // The ranking CTE carries only IDs and positions, never biographies or citation bodies.
  // page_ids applies filtering and LIMIT before loading the selected page's display fields.
  const rows = filtered
    ? read(`WITH page_ids AS (
        SELECT id AS page_id FROM ${config.from}${where.sql}
        ORDER BY ${order} LIMIT ? OFFSET ?
      ), ranked_public AS (
        SELECT id AS rank_id, ROW_NUMBER() OVER (ORDER BY ${order}) AS list_position
        FROM ${config.from}${base.sql}
      ) SELECT ${select}, list_position FROM page_ids
        JOIN ranked_public ON rank_id = page_id
        JOIN ${config.from} ON ${config.from}.id = page_id ORDER BY list_position`,
    [...where.params, request.pageSize, offset, ...base.params])
    : read(`SELECT ${select} FROM ${config.from}${where.sql} ORDER BY ${order} LIMIT ? OFFSET ?`,
      [...where.params, request.pageSize, offset])
  const tag = config.from === 'profiles' ? 'public:team' : config.from === 'research_interests' ? 'public:research' : `public:${config.from}`
  // Counts and the existing mutation generation share the same atomic read as rows/facets.
  const matched = filtered ? `(SELECT COUNT(*) FROM ${config.from}${where.sql})` : 'COUNT(*)'
  const stats = read(`SELECT ${matched} AS total, COUNT(*) AS total_public,
    COALESCE((SELECT generation FROM cache_generations WHERE tag = ?), 0) AS content_generation,
    COALESCE((SELECT generation FROM cache_generations WHERE tag = 'public:translations'), 0) AS translation_generation
    FROM ${config.from}${base.sql}`, [...(filtered ? where.params : []), tag, ...base.params])
  return [rows, stats, facetCommand(request, config, request.selectedUids ? {} : facets)]
}

async function listSnapshot<T extends { uid: string }>(
  results: QueryResult[], request: PublicListRequest, config: QueryConfig,
  facets: FilterSpec, parse: (row: RawRow) => T, label: string,
): Promise<PublicListSnapshot<T>> {
  if (results.length !== 3 || results[1]?.rows.length !== 1) throw new PublicSiteError('PUBLIC_PROTOCOL', `${label} database batch is incomplete`)
  const stats = results[1]!.rows[0]!
  const total = rowCount(results[1]!, label)
  const totalPublic = rowInteger(stats, 'total_public', 0, 10_000_000)!
  const generation = rowInteger(stats, 'content_generation', 0, Number.MAX_SAFE_INTEGER)!
  const translationGeneration = rowInteger(stats, 'translation_generation', 0, Number.MAX_SAFE_INTEGER)!
  if (total > totalPublic) throw new PublicSiteError('PUBLIC_PROTOCOL', `${label} filtered count exceeds public count`)
  let position = (request.page - 1) * request.pageSize
  let previousRank = 0
  const items = manyRows(results[0]!, request.pageSize, row => {
    const rank = hasListFilters(request) ? rowInteger(row, 'list_position', 1, totalPublic)! : ++position
    if (rank <= previousRank) throw new PublicSiteError('PUBLIC_PROTOCOL', `${label} ranks are not increasing`)
    previousRank = rank
    const displayNumber = config.forwardNumbers ? rank : totalPublic - rank + 1
    if (!Number.isSafeInteger(displayNumber) || displayNumber < 1 || displayNumber > totalPublic) throw new PublicSiteError('PUBLIC_PROTOCOL', `${label} number is outside its public collection`)
    return { ...parse(row), displayNumber }
  }, label)
  const expectedRows = Math.min(request.pageSize, Math.max(0, total - (request.page - 1) * request.pageSize))
  if (items.length !== expectedRows) throw new PublicSiteError('PUBLIC_PROTOCOL', `${label} rows and counts are inconsistent`)
  const revision = await sha256Hex(`public-list-v2:${config.from}:${generation}:${translationGeneration}:${totalPublic}`)
  return { items, total, totalPublic, revision, facets: parseFacetRows(results[2]!, Object.keys(facets), 41) }
}

async function listBatch<T extends { uid: string }>(
  adapter: DatabaseAdapter, request: PublicListRequest, config: QueryConfig,
  select: string, order: string, facets: FilterSpec, parse: (row: RawRow) => T, label: string,
): Promise<PublicListSnapshot<T>> {
  return listSnapshot(await adapter.batch(listCommands(request, config, select, order, facets)), request, config, facets, parse, label)
}

export type ProfileSummaryRecord = {
  uid: string; updatedAt: string; name: string; nameEn: string | null; role: string | null; title: string | null
  organization: string | null; lab: string | null; avatarKey: string | null; biography: string | null; biographyEn: string | null
}
export type ProfileDetailRecord = ProfileSummaryRecord & {
  links: PublicAcademicLink[]
  email: string | null; phone: string | null; office: string | null; education: string | null; experience: string | null
  recruiting: string | null; orcid: string | null; personalHomepage: string | null; googleScholar: string | null
  dblp: string | null; github: string | null; cnki: string | null
}

function profileSummary(row: RawRow): ProfileSummaryRecord {
  return {
    uid: rowRequiredText(row, 'uid', 128), updatedAt: rowTimestamp(row, 'updated_at')!, name: rowRequiredText(row, 'name', 1_024),
    nameEn: rowOptionalText(row, 'name_en', 1_024), role: rowOptionalText(row, 'role', 1_024), title: rowOptionalText(row, 'title', 1_024),
    organization: rowOptionalText(row, 'organization', 2_048), lab: rowOptionalText(row, 'lab', 2_048), avatarKey: rowOptionalText(row, 'avatar_key', 2_048),
    biography: rowOptionalText(row, 'bio', PUBLIC_PROFILE_BIOGRAPHY_MAX_BYTES), biographyEn: rowOptionalText(row, 'bio_en', PUBLIC_PROFILE_BIOGRAPHY_MAX_BYTES),
  }
}
function profileDetail(row: RawRow): ProfileDetailRecord {
  return {
    ...profileSummary(row), links: readPublicProfileLinks(row), email: rowOptionalText(row, 'public_email', 320), phone: rowOptionalText(row, 'public_phone', 128),
    office: rowOptionalText(row, 'public_office', 1_024), education: rowOptionalText(row, 'education', 64_000),
    experience: rowOptionalText(row, 'experience', 64_000), recruiting: rowOptionalText(row, 'recruiting', 64_000),
    orcid: rowOptionalText(row, 'orcid', 128), personalHomepage: rowOptionalText(row, 'personal_homepage', 2_048),
    googleScholar: rowOptionalText(row, 'google_scholar', 2_048), dblp: rowOptionalText(row, 'dblp', 2_048),
    github: rowOptionalText(row, 'github', 2_048), cnki: rowOptionalText(row, 'cnki', 2_048),
  }
}

export type PublicationSummaryRecord = {
  uid: string; updatedAt: string; title: string; authors: string | null; venue: string | null; year: number | null
  doi: string | null; url: string | null; publicationType: string | null; authorRole: string | null
  indexType: string | null; displayTags: string | null; featured: boolean
  citationInput?: PublicCitationInput
  pdfKey?: string | null; pdfVisibility?: VisibilityScope
}
export type PublicationDetailRecord = PublicationSummaryRecord & {
  sourceCitation: string | null; volume: string | null; issue: string | null; pages: string | null; pdfKey: string | null
  bibtex: string | null; citationGbt: string | null; citationElsevier: string | null; citationApa: string | null; citationIeee: string | null
  highlightGbt: string | null; highlightElsevier: string | null; highlightApa: string | null; highlightIeee: string | null
  correspondingAuthors: string | null; abstract: string | null; keywords: string | null; pdfVisibility: VisibilityScope
}
function publicationSummary(row: RawRow): PublicationSummaryRecord {
  return {
    uid: rowRequiredText(row, 'uid', 128), updatedAt: rowTimestamp(row, 'updated_at')!, title: rowRequiredText(row, 'title', 4_096),
    authors: rowOptionalText(row, 'authors', 8_192), venue: rowOptionalText(row, 'venue', 2_048), year: rowInteger(row, 'year', 1, 9_999, true),
    doi: rowOptionalText(row, 'doi', 1_024), url: rowOptionalText(row, 'url', 2_048), publicationType: rowOptionalText(row, 'publication_type', 1_024),
    authorRole: rowOptionalText(row, 'author_role', 1_024), indexType: rowOptionalText(row, 'index_type', 4_096),
    displayTags: rowOptionalText(row, 'display_tags', 8_192), featured: rowBoolean(row, 'is_featured'),
  }
}
function publicationDetail(row: RawRow): PublicationDetailRecord {
  return {
    ...publicationSummary(row), sourceCitation: rowOptionalText(row, 'source_citation', 32_000), volume: rowOptionalText(row, 'volume', 256),
    issue: rowOptionalText(row, 'issue', 256), pages: rowOptionalText(row, 'pages', 512), pdfKey: rowOptionalText(row, 'pdf_key', 2_048),
    bibtex: rowOptionalText(row, 'bibtex', 64_000), citationGbt: rowOptionalText(row, 'citation_gbt', 32_000),
    citationElsevier: rowOptionalText(row, 'citation_elsevier', 32_000), citationApa: rowOptionalText(row, 'citation_apa', 32_000),
    citationIeee: rowOptionalText(row, 'citation_ieee', 32_000), highlightGbt: rowOptionalText(row, 'highlight_gbt', 8_192),
    highlightElsevier: rowOptionalText(row, 'highlight_elsevier', 8_192), highlightApa: rowOptionalText(row, 'highlight_apa', 8_192),
    highlightIeee: rowOptionalText(row, 'highlight_ieee', 8_192), correspondingAuthors: rowOptionalText(row, 'corresponding_authors', 8_192),
    abstract: rowOptionalText(row, 'abstract', 128_000), keywords: rowOptionalText(row, 'keywords', 16_000),
    pdfVisibility: rowVisibilityScope(row, 'pdf_visibility'),
  }
}

export type ProjectSummaryRecord = {
  amount: string | null
  uid: string; updatedAt: string; name: string; source: string | null; fundName: string | null; projectRole: string | null
  projectNumber: string | null; principal: string | null; startDate: string | null; endDate: string | null; status: string | null; summary: string | null; featured: boolean
}
export type ProjectDetailRecord = ProjectSummaryRecord & { projectNumber: string | null; members: string | null; amount: string | null }
function projectSummary(row: RawRow): ProjectSummaryRecord {
  return {
    amount: rowOptionalText(row, 'amount', 128),
    uid: rowRequiredText(row, 'uid', 128), updatedAt: rowTimestamp(row, 'updated_at')!, name: rowRequiredText(row, 'name', 4_096),
    source: rowOptionalText(row, 'source', 2_048), fundName: rowOptionalText(row, 'fund_name', 2_048), projectRole: rowOptionalText(row, 'project_role', 2_048),
    projectNumber: rowOptionalText(row, 'project_number', 1_024), principal: rowOptionalText(row, 'principal', 8_192), startDate: rowDate(row, 'start_date'), endDate: rowDate(row, 'end_date'),
    status: rowOptionalText(row, 'status', 1_024), summary: rowOptionalText(row, 'summary', 64_000), featured: rowBoolean(row, 'is_featured'),
  }
}
function projectDetail(row: RawRow): ProjectDetailRecord {
  return {
    ...projectSummary(row), projectNumber: rowOptionalText(row, 'project_number', 1_024), members: rowOptionalText(row, 'members', 16_000),
    amount: rowOptionalText(row, 'amount', 128),
  }
}

export type PatentSummaryRecord = {
  uid: string; updatedAt: string; name: string; country: string | null; patentType: string | null; applicationNumber: string | null
  grantNumber: string | null; applicationDate: string | null; grantDate: string | null; inventors: string | null; legalStatus: string | null; featured: boolean
}
export type PatentDetailRecord = PatentSummaryRecord & { owner: string | null; summary: string | null; certificateKey: string | null }
function patentSummary(row: RawRow): PatentSummaryRecord {
  return {
    uid: rowRequiredText(row, 'uid', 128), updatedAt: rowTimestamp(row, 'updated_at')!, name: rowRequiredText(row, 'name', 4_096),
    country: rowOptionalText(row, 'country', 1_024), patentType: rowOptionalText(row, 'patent_type', 1_024), applicationNumber: rowOptionalText(row, 'application_number', 1_024),
    grantNumber: rowOptionalText(row, 'grant_number', 1_024), applicationDate: rowDate(row, 'application_date'), grantDate: rowDate(row, 'grant_date'),
    inventors: rowOptionalText(row, 'inventors', 16_000), legalStatus: rowOptionalText(row, 'legal_status', 2_048), featured: rowBoolean(row, 'is_featured'),
  }
}
function patentDetail(row: RawRow): PatentDetailRecord {
  return { ...patentSummary(row), owner: rowOptionalText(row, 'owner', 8_192), summary: rowOptionalText(row, 'summary', 64_000), certificateKey: rowOptionalText(row, 'certificate_key', 2_048) }
}

export type StudentSummaryRecord = {
  uid: string; updatedAt: string; name: string; nameEn: string | null; avatarKey: string | null; degree: string | null; category: string | null
  grade: string | null; direction: string | null; status: string | null; biography: string | null; featured: boolean
}
export type StudentDetailRecord = StudentSummaryRecord & {
  studentId: string | null; publicEmail: string | null; homepage: string | null; enrollmentDate: string | null; graduationDate: string | null
  destination: string | null; awards: string | null
}
export type StudentCategoryRecord = { uid: string; key: string; label: string; labelEn: string | null; keywords: string | null; displayOrder: number }
function studentSummary(row: RawRow): StudentSummaryRecord {
  return {
    uid: rowRequiredText(row, 'uid', 128), updatedAt: rowTimestamp(row, 'updated_at')!, name: rowRequiredText(row, 'name', 1_024),
    nameEn: rowOptionalText(row, 'name_en', 1_024), avatarKey: rowOptionalText(row, 'avatar_key', 2_048), degree: rowOptionalText(row, 'degree', 1_024),
    category: rowOptionalText(row, 'category', 1_024), grade: rowOptionalText(row, 'grade', 1_024), direction: rowOptionalText(row, 'direction', 2_048),
    status: rowOptionalText(row, 'status', 1_024), biography: rowOptionalText(row, 'bio', 64_000), featured: rowBoolean(row, 'is_featured'),
  }
}
function studentDetail(row: RawRow): StudentDetailRecord {
  return {
    ...studentSummary(row), studentId: rowOptionalText(row, 'student_id', 1_024), publicEmail: rowOptionalText(row, 'public_email', 320),
    homepage: rowOptionalText(row, 'homepage', 2_048), enrollmentDate: rowDate(row, 'enrollment_date'), graduationDate: rowDate(row, 'graduation_date'),
    destination: rowOptionalText(row, 'destination', 32_000), awards: rowOptionalText(row, 'awards', 64_000),
  }
}
function studentCategory(row: RawRow): StudentCategoryRecord {
  return {
    uid: rowRequiredText(row, 'uid', 128), key: rowRequiredText(row, 'key', 512), label: rowRequiredText(row, 'label', 1_024),
    labelEn: rowOptionalText(row, 'label_en', 1_024), keywords: rowOptionalText(row, 'keywords', 8_192), displayOrder: rowInteger(row, 'display_order', -1_000_000, 1_000_000)!,
  }
}

export type ResearchRecord = { uid: string; updatedAt: string; name: string; nameEn: string | null; description: string | null }
function research(row: RawRow): ResearchRecord {
  return { uid: rowRequiredText(row, 'uid', 128), updatedAt: rowTimestamp(row, 'updated_at')!, name: rowRequiredText(row, 'name', 1_024), nameEn: rowOptionalText(row, 'name_en', 1_024), description: rowOptionalText(row, 'description', 64_000) }
}

export type NewsSummaryRecord = {
  uid: string; updatedAt: string; title: string; slug: string; category: string | null; coverKey: string | null
  publishedAt: string; featured: boolean
}
export type NewsDetailRecord = NewsSummaryRecord & {
  content: string | null; contentFormat: 'plain' | 'html' | 'markdown'; allowComments: boolean
  relatedPublicationUid: string | null; relatedPublicationTitle: string | null
  relatedProjectUid: string | null; relatedProjectName: string | null
  relatedStudentUid: string | null; relatedStudentName: string | null; relatedStudentNameEn: string | null
}
function newsSummary(row: RawRow): NewsSummaryRecord {
  return {
    uid: rowRequiredText(row, 'uid', 128), updatedAt: rowTimestamp(row, 'updated_at')!, title: rowRequiredText(row, 'title', 4_096),
    slug: rowRequiredText(row, 'slug', 512), category: rowOptionalText(row, 'category', 2_048), coverKey: rowOptionalText(row, 'cover_key', 2_048),
    publishedAt: rowTimestamp(row, 'published_at')!, featured: rowBoolean(row, 'is_featured'),
  }
}
function newsDetail(row: RawRow): NewsDetailRecord {
  const format = rowRequiredText(row, 'content_format', 32)
  if (format !== 'plain' && format !== 'html' && format !== 'markdown') throw new PublicSiteError('PUBLIC_PROTOCOL', 'Invalid public news content format')
  return {
    ...newsSummary(row), content: rowOptionalText(row, 'content', 512_000), contentFormat: format, allowComments: rowBoolean(row, 'allow_comments'),
    relatedPublicationUid: rowOptionalText(row, 'related_publication_uid', 128), relatedPublicationTitle: rowOptionalText(row, 'related_publication_title', 4_096),
    relatedProjectUid: rowOptionalText(row, 'related_project_uid', 128), relatedProjectName: rowOptionalText(row, 'related_project_name', 4_096),
    relatedStudentUid: rowOptionalText(row, 'related_student_uid', 128), relatedStudentName: rowOptionalText(row, 'related_student_name', 1_024),
    relatedStudentNameEn: rowOptionalText(row, 'related_student_name_en', 1_024),
  }
}

export type CourseSummaryRecord = { uid: string; updatedAt: string; name: string; semester: string | null; audience: string | null; summary: string | null; featured: boolean }
export type CourseDetailRecord = CourseSummaryRecord & { syllabusKey: string | null; materialKey: string | null; materialVisibility: VisibilityScope; referencesText: string | null }
function courseSummary(row: RawRow): CourseSummaryRecord {
  return {
    uid: rowRequiredText(row, 'uid', 128), updatedAt: rowTimestamp(row, 'updated_at')!, name: rowRequiredText(row, 'name', 4_096),
    semester: rowOptionalText(row, 'semester', 1_024), audience: rowOptionalText(row, 'audience', 2_048), summary: rowOptionalText(row, 'summary', 64_000),
    featured: rowBoolean(row, 'is_featured'),
  }
}
function courseDetail(row: RawRow): CourseDetailRecord {
  return {
    ...courseSummary(row), syllabusKey: rowOptionalText(row, 'syllabus_key', 2_048), materialKey: rowOptionalText(row, 'material_key', 2_048),
    materialVisibility: rowVisibilityScope(row, 'material_visibility'), referencesText: rowOptionalText(row, 'references_text', 128_000),
  }
}

const PROFILE_CONFIG: QueryConfig = {
  from: 'profiles', forwardNumbers: true, base: PUBLIC_CONTENT_BASE.profiles,
  search: ['name', 'name_en', 'organization', 'title'], filters: { role: 'role', organization: 'organization' },
}
const PUBLICATION_CONFIG: QueryConfig = {
  from: 'publications', members: ['publicationType', 'indexType'], base: PUBLIC_CONTENT_BASE.publications, search: ['title', 'authors', 'venue', 'doi'],
  filters: { year: 'CAST(year AS TEXT)', venue: 'venue', publicationType: 'publication_type', indexType: 'index_type', featured: 'CAST(is_featured AS TEXT)' },
}
const PROJECT_CONFIG: QueryConfig = {
  from: 'projects', base: PUBLIC_CONTENT_BASE.projects, search: ['name', 'project_number', 'principal', 'members', 'source', 'fund_name'], filters: { year: 'substr(start_date, 1, 4)', source: 'source', fundName: 'fund_name', role: 'project_role', status: 'status' },
}
const PATENT_CONFIG: QueryConfig = {
  from: 'patents', base: ["visibility = 'public'"], search: ['name', 'application_number', 'grant_number', 'inventors'],
  filters: { year: 'substr(COALESCE(grant_date, application_date), 1, 4)', country: 'country', patentType: 'patent_type', legalStatus: 'legal_status' },
}
const STUDENT_CONFIG: QueryConfig = {
  from: 'students', members: ['category', 'direction'], base: ["visibility = 'public'"], search: ['name', 'name_en', 'degree', 'direction'],
  filters: { category: 'category', degree: 'degree', grade: 'grade', direction: 'direction', status: 'status' },
}
const RESEARCH_CONFIG: QueryConfig = {
  from: 'research_interests', base: PUBLIC_CONTENT_BASE.research_interests, search: ['name', 'name_en', 'description'], filters: {},
}
const NEWS_CONFIG: QueryConfig = {
  from: 'news', members: ['category'], base: PUBLIC_CONTENT_BASE.news, search: ['title', 'category', 'content'], filters: { category: 'category', year: 'substr(published_at, 1, 4)' },
}
const COURSE_CONFIG: QueryConfig = {
  from: 'courses', base: ["visibility = 'public'"], search: ['name', 'semester', 'audience', 'summary'], filters: { semester: 'semester', audience: 'audience' },
}

const SITEMAP_CONFIGS = {
  team: PROFILE_CONFIG, publications: PUBLICATION_CONFIG, projects: PROJECT_CONFIG,
  patents: PATENT_CONFIG, students: STUDENT_CONFIG, news: NEWS_CONFIG, courses: COURSE_CONFIG, research: RESEARCH_CONFIG,
} as const
export type PublicSitemapModule = keyof typeof SITEMAP_CONFIGS
export const PUBLIC_SITEMAP_PAGE_SIZE = 1_000
export const PUBLIC_SITEMAP_MAX_PAGE = Math.floor(Number.MAX_SAFE_INTEGER / PUBLIC_SITEMAP_PAGE_SIZE)
export type PublicSitemapShard = { module: PublicSitemapModule; page: number }
export function isPublicSitemapModule(value: unknown): value is PublicSitemapModule {
  return typeof value === 'string' && Object.hasOwn(SITEMAP_CONFIGS, value)
}

function timedConfig(config: QueryConfig, now: string): QueryConfig {
  if (config !== NEWS_CONFIG) return config
  // Every list, count, and facet arm binds the same immutable request cutoff.
  // Internal timestamps never enter SQL source text.
  return { ...config, baseParams: [now] }
}

export class PublicContentStore {
  constructor(private readonly adapter: DatabaseAdapter) {}

  /** Bounded, searchable candidate pages, using the same visibility and cross-filter predicates. */
  async filterOptions(module: string, request: PublicListRequest, key: string, search: string | null, page: number, now: string) {
    const name = module === 'publications/featured' ? 'publications' : module
    if (!isPublicSitemapModule(name) || !Number.isInteger(page) || page < 1 || page > 501) throw new PublicSiteError('PUBLIC_INPUT', 'Invalid candidate request')
    const config = timedConfig(SITEMAP_CONFIGS[name], now)
    const expression = config.filters[key]
    if (!expression || Object.hasOwn(request.scope?.filters ?? {}, key) || (module === 'publications/featured' && key === 'featured')) throw new PublicSiteError('PUBLIC_INPUT', 'Invalid candidate field')
    const arm = facetArm(request, config, key, expression)
    const pattern = sqlSearchPattern(search)
    const rows = await this.adapter.execute(read(`WITH candidates AS (${arm.sql})
      SELECT filter_key, value, total FROM candidates${pattern ? " WHERE value LIKE ? ESCAPE '\\' COLLATE NOCASE" : ''}
      ORDER BY ${key === 'year' ? 'value DESC' : 'total DESC, value ASC'} LIMIT 21 OFFSET ?`,
      [...arm.params, ...(pattern ? [pattern] : []), (page - 1) * 20]))
    return { options: parseFacetRows({ ...rows, rows: rows.rows.slice(0, 20) }, [key], 20).map(item => ({
      value: item.value, label: item.value, count: item.count, selected: request.filters[key] === item.value,
    })), page, hasMore: rows.rows.length > 20 }
  }

  /** Reuse the list visibility rules, including active teachers and the news cutoff. */
  async sitemapShards(now: string): Promise<PublicSitemapShard[]> {
    const params: SqlValue[] = []
    const arms = Object.entries(SITEMAP_CONFIGS).map(([module, config]) => {
      const timed = timedConfig(config, now)
      params.push(...(timed.baseParams ?? []))
      return `SELECT '${module}' AS module, CAST((id - 1) / ${PUBLIC_SITEMAP_PAGE_SIZE} AS INTEGER) + 1 AS page
        FROM ${timed.from} WHERE ${timed.base.join(' AND ')} GROUP BY page`
    })
    const result = await this.adapter.execute(read(`SELECT module, page FROM (${arms.join(' UNION ALL ')})
      ORDER BY module, page LIMIT 50000`, params))
    // Reserve one index entry for static pages; never silently truncate an index.
    if (result.rows.length >= 50_000) throw new PublicSiteError('PUBLIC_UNAVAILABLE', 'Sitemap index capacity exceeded')
    return result.rows.map(row => {
      const module = rowRequiredText(row, 'module', 32)
      if (!isPublicSitemapModule(module)) throw new PublicSiteError('PUBLIC_PROTOCOL', 'Invalid sitemap module')
      return { module, page: rowInteger(row, 'page', 1, PUBLIC_SITEMAP_MAX_PAGE)! }
    })
  }

  /** Stable ID windows avoid large OFFSET scans and shifting pages after deletion. */
  async sitemapRecords(module: PublicSitemapModule, page: number, now: string) {
    if (!isPublicSitemapModule(module) || !Number.isSafeInteger(page) || page < 1 || page > PUBLIC_SITEMAP_MAX_PAGE) {
      throw new PublicSiteError('PUBLIC_INPUT', 'Invalid sitemap shard')
    }
    const config = timedConfig(SITEMAP_CONFIGS[module], now)
    const result = await this.adapter.execute(read(`SELECT uid, ${module === 'news' ? 'slug' : 'uid'} AS identifier
      FROM ${config.from} WHERE ${config.base.join(' AND ')} AND id > ? AND id <= ?
      ORDER BY id LIMIT ${PUBLIC_SITEMAP_PAGE_SIZE}`,
    [...(config.baseParams ?? []), (page - 1) * PUBLIC_SITEMAP_PAGE_SIZE, page * PUBLIC_SITEMAP_PAGE_SIZE]))
    return manyRows(result, PUBLIC_SITEMAP_PAGE_SIZE, row => ({
      uid: rowRequiredText(row, 'uid', 128), identifier: rowRequiredText(row, 'identifier', 256),
    }), 'Sitemap')
  }

  teamList(request: PublicListRequest): Promise<PublicListSnapshot<ProfileSummaryRecord>> {
    return listBatch(this.adapter, request, PROFILE_CONFIG,
      'uid, updated_at, name, name_en, role, title, organization, lab, avatar_key, bio, bio_en',
      PUBLIC_CONTENT_ORDER.profiles, { role: 'role', organization: 'organization' }, profileSummary, 'Team')
  }

  async profile(uid: string): Promise<ProfileDetailRecord | null> {
    const result = await this.adapter.execute(read(`SELECT uid, updated_at, name, name_en, role, title, organization, lab, avatar_key, bio, bio_en,
      ${PUBLIC_PROFILE_CONTACT_SQL},
      education, experience, recruiting, ${PUBLIC_PROFILE_LINK_COLUMNS}
      FROM profiles WHERE uid = ? AND visibility = 'public' AND is_active = 1 LIMIT 1`, [uid]))
    return oneRow(result, profileDetail, 'Profile')
  }

  publications(request: PublicListRequest): Promise<PublicListSnapshot<PublicationSummaryRecord>> {
    const style = request.citationStyle ?? 'gbt'
    if (!isPublicCitationStyle(style)) throw new PublicSiteError('PUBLIC_INPUT', 'Invalid citation style')
    const selected = Boolean(request.selectedUids)
    // The style identifier is a closed enum; only this format's body is loaded after page IDs are bounded.
    const citationColumns = selected ? `, volume, issue, pages, citation_${style} AS citation_text, highlight_${style} AS citation_highlights, pdf_key, pdf_visibility` : ''
    return listBatch(this.adapter, request, PUBLICATION_CONFIG,
      'uid, updated_at, title, authors, venue, year, doi, url, publication_type, author_role, index_type, display_tags, is_featured' + citationColumns,
      PUBLIC_CONTENT_ORDER.publications,
      { year: 'CAST(year AS TEXT)', venue: 'venue', publicationType: 'publication_type', indexType: 'index_type', featured: 'CAST(is_featured AS TEXT)' },
      row => {
        const summary = publicationSummary(row)
        if (selected) {
          summary.citationInput = {
            ...summary, volume: rowOptionalText(row, 'volume', 256), issue: rowOptionalText(row, 'issue', 256), pages: rowOptionalText(row, 'pages', 512),
            text: rowOptionalText(row, 'citation_text', 32_000), highlights: rowOptionalText(row, 'citation_highlights', 8_192),
          }
          summary.pdfKey = rowOptionalText(row, 'pdf_key', 2_048)
          summary.pdfVisibility = rowVisibilityScope(row, 'pdf_visibility')
        }
        return summary
      }, 'Publications')
  }

  async publication(uid: string): Promise<PublicationDetailRecord | null> {
    const result = await this.adapter.execute(read(`SELECT uid, updated_at, title, source_citation, authors, venue, year, volume, issue, pages,
      doi, url, pdf_key, bibtex, citation_gbt, citation_elsevier, citation_apa, citation_ieee,
      highlight_gbt, highlight_elsevier, highlight_apa, highlight_ieee, publication_type, author_role,
      corresponding_authors, index_type, display_tags, abstract, keywords, pdf_visibility, is_featured
      FROM publications WHERE uid = ? AND visibility = 'public' LIMIT 1`, [uid]))
    return oneRow(result, publicationDetail, 'Publication')
  }

  projects(request: PublicListRequest): Promise<PublicListSnapshot<ProjectSummaryRecord>> {
    return listBatch(this.adapter, request, PROJECT_CONFIG,
      'uid, updated_at, name, source, fund_name, project_number, project_role, principal, start_date, end_date, status, amount, NULL AS summary, is_featured',
      PUBLIC_CONTENT_ORDER.projects, { year: 'substr(start_date, 1, 4)', source: 'source', fundName: 'fund_name', role: 'project_role', status: 'status' }, projectSummary, 'Projects')
  }

  async project(uid: string): Promise<ProjectDetailRecord | null> {
    const result = await this.adapter.execute(read(`SELECT uid, updated_at, name, source, fund_name, project_number, project_role, principal,
      members, start_date, end_date, status, amount, summary, is_featured
      FROM projects WHERE uid = ? AND visibility = 'public' LIMIT 1`, [uid]))
    return oneRow(result, projectDetail, 'Project')
  }

  patents(request: PublicListRequest): Promise<PublicListSnapshot<PatentSummaryRecord>> {
    return listBatch(this.adapter, request, PATENT_CONFIG,
      'uid, updated_at, name, country, patent_type, application_number, grant_number, application_date, grant_date, inventors, legal_status, is_featured',
      "COALESCE(grant_date, application_date, '0000-00-00') DESC, sort_order ASC, id ASC",
      { year: 'substr(COALESCE(grant_date, application_date), 1, 4)', country: 'country', patentType: 'patent_type', legalStatus: 'legal_status' }, patentSummary, 'Patents')
  }

  async patent(uid: string): Promise<PatentDetailRecord | null> {
    const result = await this.adapter.execute(read(`SELECT uid, updated_at, name, country, patent_type, application_number, grant_number,
      application_date, grant_date, inventors, owner, legal_status, summary, certificate_key, is_featured
      FROM patents WHERE uid = ? AND visibility = 'public' LIMIT 1`, [uid]))
    return oneRow(result, patentDetail, 'Patent')
  }

  async students(request: PublicListRequest): Promise<PublicListSnapshot<StudentSummaryRecord> & { categories: StudentCategoryRecord[] }> {
    const facets = { category: 'category', degree: 'degree', grade: 'grade', direction: 'direction', status: 'status' }
    const order = `COALESCE(enrollment_date, CASE WHEN substr(trim(grade), 1, 4) GLOB '[12][0-9][0-9][0-9]'
      THEN substr(trim(grade), 1, 4) || '-01-01' END) DESC, sort_order ASC, id ASC`
    const commands = [
      ...listCommands(request, STUDENT_CONFIG,
        'uid, updated_at, name, name_en, avatar_key, degree, category, grade, direction, status, bio, is_featured', order, facets),
      read(`SELECT uid, key, label, label_en, keywords, display_order FROM student_category_displays
        WHERE enabled = 1 ORDER BY display_order ASC, id ASC LIMIT 100`),
    ]
    const results = await this.adapter.batch(commands)
    if (results.length !== commands.length) throw new PublicSiteError('PUBLIC_PROTOCOL', 'Students database batch is incomplete')
    return {
      ...await listSnapshot(results.slice(0, 3), request, STUDENT_CONFIG, facets, studentSummary, 'Students'),
      categories: manyRows(results[3]!, 100, studentCategory, 'Student categories'),
    }
  }

  async student(uid: string): Promise<{ item: StudentDetailRecord | null; categories: StudentCategoryRecord[] }> {
    const commands = [
      read(`SELECT uid, updated_at, name, name_en, avatar_key, student_id, degree, category, grade, direction, status,
        CASE WHEN contact_visibility = 'public' THEN email ELSE NULL END AS public_email,
        homepage, enrollment_date, graduation_date, destination, awards, bio, is_featured
        FROM students WHERE uid = ? AND visibility = 'public' LIMIT 1`, [uid]),
      read(`SELECT uid, key, label, label_en, keywords, display_order FROM student_category_displays
        WHERE enabled = 1 ORDER BY display_order ASC, id ASC LIMIT 100`),
    ]
    const results = await this.adapter.batch(commands)
    if (results.length !== commands.length) throw new PublicSiteError('PUBLIC_PROTOCOL', 'Student database batch is incomplete')
    return { item: oneRow(results[0]!, studentDetail, 'Student'), categories: manyRows(results[1]!, 100, studentCategory, 'Student categories') }
  }

  async researchDetail(uid: string): Promise<ResearchRecord | null> {
    const result = await this.adapter.execute(read(`SELECT uid, updated_at, name, name_en, description FROM research_interests WHERE uid = ? AND visibility = 'public' LIMIT 1`, [uid]))
    return oneRow(result, research, 'Research detail')
  }

  research(request: PublicListRequest = { locale: 'zh', page: 1, pageSize: 12, search: null, filters: {} }): Promise<PublicListSnapshot<ResearchRecord>> {
    return listBatch(this.adapter, request, RESEARCH_CONFIG, 'uid, updated_at, name, name_en, description',
      PUBLIC_CONTENT_ORDER.research_interests, {}, research, 'Research interests')
  }

  news(request: PublicListRequest, now: string): Promise<PublicListSnapshot<NewsSummaryRecord>> {
    const config = timedConfig(NEWS_CONFIG, now)
    return listBatch(this.adapter, request, config,
      'uid, updated_at, title, slug, category, cover_key, published_at, is_featured',
      PUBLIC_CONTENT_ORDER.news, NEWS_CONFIG.filters, newsSummary, 'News')
  }

  async newsDetail(slug: string, now: string): Promise<NewsDetailRecord | null> {
    const result = await this.adapter.execute(read(`SELECT n.uid, n.updated_at, n.title, n.slug, n.category, n.cover_key, n.content, n.content_format,
      n.allow_comments, n.published_at, n.is_featured,
      CASE WHEN p.visibility = 'public' THEN p.uid ELSE NULL END AS related_publication_uid,
      CASE WHEN p.visibility = 'public' THEN p.title ELSE NULL END AS related_publication_title,
      CASE WHEN pr.visibility = 'public' THEN pr.uid ELSE NULL END AS related_project_uid,
      CASE WHEN pr.visibility = 'public' THEN pr.name ELSE NULL END AS related_project_name,
      CASE WHEN s.visibility = 'public' THEN s.uid ELSE NULL END AS related_student_uid,
      CASE WHEN s.visibility = 'public' THEN s.name ELSE NULL END AS related_student_name,
      CASE WHEN s.visibility = 'public' THEN s.name_en ELSE NULL END AS related_student_name_en
      FROM news n
      LEFT JOIN publications p ON p.uid = n.related_publication_uid
      LEFT JOIN projects pr ON pr.uid = n.related_project_uid
      LEFT JOIN students s ON s.uid = n.related_student_uid
      WHERE n.slug = ? AND n.visibility = 'public' AND n.published_at IS NOT NULL AND n.published_at <= ? LIMIT 1`, [slug, now]))
    return oneRow(result, newsDetail, 'News detail')
  }

  courses(request: PublicListRequest): Promise<PublicListSnapshot<CourseSummaryRecord>> {
    return listBatch(this.adapter, request, COURSE_CONFIG,
      'uid, updated_at, name, semester, audience, summary, is_featured',
      'semester DESC, sort_order ASC, id ASC', { semester: 'semester', audience: 'audience' }, courseSummary, 'Courses')
  }

  async course(uid: string): Promise<CourseDetailRecord | null> {
    const result = await this.adapter.execute(read(`SELECT uid, updated_at, name, semester, audience, summary, syllabus_key, material_key,
      material_visibility, references_text, is_featured FROM courses WHERE uid = ? AND visibility = 'public' LIMIT 1`, [uid]))
    return oneRow(result, courseDetail, 'Course')
  }
}
