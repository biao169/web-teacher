import type { PublicMedia, PublicSiteLocale } from './public-site'

export const PUBLIC_PAGE_SIZES = [12, 24, 36] as const
export type PublicPageSize = (typeof PUBLIC_PAGE_SIZES)[number]

export type PublicModule = 'team' | 'publications' | 'projects' | 'patents' | 'students' | 'research' | 'news' | 'courses'

export type PublicBreadcrumb = {
  label: string
  href: string
}

export type PublicPageMeta = {
  title: string
  description: string
  path: string
  alternatePath: string
  breadcrumbs: PublicBreadcrumb[]
  image: PublicMedia | null
  type: 'website' | 'article' | 'profile'
}

export type PublicPagination = {
  page: number
  pageSize: PublicPageSize
  totalItems: number
  totalPages: number
  from: number
  to: number
  previousPage: number | null
  nextPage: number | null
}

export type PublicFilterOption = {
  value: string
  label: string
  count: number
  selected: boolean
}

export type PublicFilterGroup = {
  key: string
  label: string
  options: PublicFilterOption[]
}

export type PublicListQueryView = {
  search: string | null
  filters: Record<string, string>
  scope?: PublicNavigationScope
}

export type PublicNavigationScope = {
  uid: string
  label: string
  revision: string
  filters: Readonly<Record<string, string>>
  search: string | null
}

export type PublicNumberedRecord = { displayNumber: number }

export type PublicListViewModel<T> = {
  schemaVersion: 1
  locale: PublicSiteLocale
  module: PublicModule
  generatedAt: string
  /** Complete public collection, before user and featured filters. */
  totalPublic: number
  /** Locale/filter-independent content generation and public membership revision. */
  revision: string
  meta: PublicPageMeta
  query: PublicListQueryView
  filters: PublicFilterGroup[]
  pagination: PublicPagination
  items: Array<T & PublicNumberedRecord>
}

export type PublicDetailViewModel<T> = {
  schemaVersion: 1
  locale: PublicSiteLocale
  module: PublicModule
  generatedAt: string
  meta: PublicPageMeta
  item: T
}

export type PublicProfileSummary = {
  uid: string
  name: string
  role: string | null
  title: string | null
  organization: string | null
  lab: string | null
  biography: string | null
  href: string
  avatar: PublicMedia
}

export type PublicAcademicLink = {
  kind: 'orcid' | 'homepage' | 'google-scholar' | 'dblp' | 'github' | 'cnki'
  value?: string | null
  label: string
  href: string
}

export type PublicContact = {
  email: string | null
  phone: string | null
  office: string | null
}

export type PublicProfileDetail = PublicProfileSummary & {
  biography: string | null
  education: string | null
  experience: string | null
  recruiting: string | null
  contact: PublicContact | null
  links: PublicAcademicLink[]
}

export type { PublicCitation } from './public-citation'
import type { PublicCitation } from './public-citation'

export type PublicPublicationSummary = {
  uid: string
  title: string
  authors: string | null
  venue: string | null
  year: number | null
  publicationType: string | null
  authorRole: string | null
  indexTypes: string[]
  tags: string[]
  doi: string | null
  externalUrl: string | null
  featured: boolean
  href: string
  /** Only populated by the bounded selection/citation preparation endpoint. */
  citation?: PublicCitation
  pdf?: PublicMedia
}

export type PublicPublicationDetail = PublicPublicationSummary & {
  sourceCitation: string | null
  volume: string | null
  issue: string | null
  pages: string | null
  correspondingAuthors: string | null
  abstract: string | null
  keywords: string[]
  bibtex: string | null
  citations: PublicCitation[]
  pdf: PublicMedia
}

export type PublicProjectSummary = {
  amount?: string | null
  projectNumber: string | null
  uid: string
  name: string
  source: string | null
  fundName: string | null
  role: string | null
  principal: string | null
  startDate: string | null
  endDate: string | null
  periodLabel: string | null
  status: string | null
  summary: string | null
  featured: boolean
  href: string
}

export type PublicProjectDetail = PublicProjectSummary & {
  projectNumber: string | null
  members: string | null
  amount: string | null
}

export type PublicPatentSummary = {
  uid: string
  name: string
  country: string | null
  patentType: string | null
  applicationNumber: string | null
  grantNumber: string | null
  applicationDate: string | null
  grantDate: string | null
  inventors: string | null
  legalStatus: string | null
  featured: boolean
  href: string
}

export type PublicPatentDetail = PublicPatentSummary & {
  owner: string | null
  summary: string | null
  certificate: PublicMedia
}

export type PublicStudentSummary = {
  uid: string
  name: string
  degree: string | null
  category: string | null
  categoryKey: string | null
  grade: string | null
  direction: string | null
  status: string | null
  biography: string | null
  featured: boolean
  href: string
  avatar: PublicMedia
}

export type PublicStudentDetail = PublicStudentSummary & {
  studentId: string | null
  enrollmentDate: string | null
  graduationDate: string | null
  destination: string | null
  awards: string | null
  email: string | null
  homepage: string | null
}

export type PublicResearchItem = {
  href: string
  uid: string
  name: string
  description: string | null
}

export type PublicNewsSummary = {
  uid: string
  slug: string
  title: string
  category: string | null
  publishedAt: string
  publishedLabel: string
  featured: boolean
  href: string
  cover: PublicMedia
}

export type PublicContentBlock =
  | { type: 'heading'; level: 2 | 3; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'quote'; text: string }
  | { type: 'code'; text: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'rich'; html: string; text: string }

export type PublicRelatedLink = {
  kind: 'publication' | 'project' | 'student'
  label: string
  href: string
}

export type PublicNewsDetail = PublicNewsSummary & {
  contentFormat: 'plain' | 'html' | 'markdown'
  blocks: PublicContentBlock[]
  related: PublicRelatedLink[]
  commentsEnabled: boolean
}

export type PublicCourseSummary = {
  uid: string
  name: string
  semester: string | null
  audience: string | null
  summary: string | null
  featured: boolean
  href: string
}

export type PublicCourseDetail = PublicCourseSummary & {
  references: string | null
  syllabus: PublicMedia
  material: PublicMedia
}

export type PublicTeamListViewModel = PublicListViewModel<PublicProfileSummary>
export type PublicProfileDetailViewModel = PublicDetailViewModel<PublicProfileDetail>
export type PublicPublicationListViewModel = PublicListViewModel<PublicPublicationSummary>
export type PublicPublicationDetailViewModel = PublicDetailViewModel<PublicPublicationDetail>
export type PublicProjectListViewModel = PublicListViewModel<PublicProjectSummary>
export type PublicProjectDetailViewModel = PublicDetailViewModel<PublicProjectDetail>
export type PublicPatentListViewModel = PublicListViewModel<PublicPatentSummary>
export type PublicPatentDetailViewModel = PublicDetailViewModel<PublicPatentDetail>
export type PublicStudentListViewModel = PublicListViewModel<PublicStudentSummary> & { categories?: Array<{ key: string; label: string }> }
export type PublicStudentDetailViewModel = PublicDetailViewModel<PublicStudentDetail>
export type PublicResearchDetailViewModel = PublicDetailViewModel<PublicResearchItem>
export type PublicResearchViewModel = PublicListViewModel<PublicResearchItem> & { count: number }
export type PublicNewsListViewModel = PublicListViewModel<PublicNewsSummary>
export type PublicNewsDetailViewModel = PublicDetailViewModel<PublicNewsDetail>
export type PublicCourseListViewModel = PublicListViewModel<PublicCourseSummary>
export type PublicCourseDetailViewModel = PublicDetailViewModel<PublicCourseDetail>
