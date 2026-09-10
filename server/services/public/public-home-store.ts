import { readPublicProfileLinks } from './public-profile-links'
import type { PublicAcademicLink } from '../../../shared/contracts/public-content'
import { sha256Hex } from '../../view-model/serializer'
import { PUBLIC_PROFILE_BIOGRAPHY_MAX_BYTES } from '../../../shared/contracts/public-site'
import { buildHomeReadPlan, PUBLIC_HOME_BATCH_SIZE, PUBLIC_NAVIGATION_LIMIT } from '../../../db/read-plans'
import type { DatabaseAdapter, RawRow } from '../../../db/contracts'
import { PublicSiteError } from './errors'
import { manyRows, oneRow, rowInteger, rowOptionalText, rowRequiredText, rowTimestamp } from './public-row'

const LIMITS = Object.freeze({ navigation: PUBLIC_NAVIGATION_LIMIT, research: 20, publications: 20, projects: 6, news: 20 })

export type HomeSiteRecord = {
  uid: string
  updatedAt: string
  siteName: string
  siteNameEn: string | null
  heroTitle: string | null
  heroSubtitle: string | null
  logoKey: string | null
  faviconKey: string | null
  openGraphImageKey: string | null
  seoTitle: string | null
  seoDescription: string | null
  seoKeywords: string | null
  footerText: string | null
  homepageProfileUid: string | null
  publicationLimit: number
  newsLimit: number
}

export type HomeNavigationRecord = {
  uid: string
  updatedAt: string
  title: string
  titleEn: string | null
  kind: string | null
  urlName: string | null
  path: string | null
  fragment: string | null
  icon: string | null
  style: string | null
  location: string | null
}

export type HomeProfileRecord = {
  links: PublicAcademicLink[]
  lab: string | null; email: string | null; phone: string | null; office: string | null
  uid: string
  updatedAt: string
  name: string
  nameEn: string | null
  role: string | null
  title: string | null
  organization: string | null
  avatarKey: string | null
  biography: string | null
  biographyEn: string | null
}

export type HomeResearchRecord = {
  displayNumber: number
  uid: string
  updatedAt: string
  name: string
  nameEn: string | null
  description: string | null
}

export type HomePublicationRecord = {
  displayNumber: number
  uid: string
  updatedAt: string
  title: string
  authors: string | null
  venue: string | null
  year: number | null
  doi: string | null
  url: string | null
  publicationType: string | null
  authorRole: string | null
  indexType: string | null
  displayTags: string | null
}

export type HomeProjectRecord = {
  amount: string | null
  displayNumber: number
  projectNumber: string | null; principal: string | null; startDate: string | null; endDate: string | null
  uid: string
  updatedAt: string
  name: string
  source: string | null
  fundName: string | null
  projectRole: string | null
  status: string | null
}

export type HomeNewsRecord = {
  displayNumber: number
  uid: string
  updatedAt: string
  title: string
  slug: string
  category: string | null
  coverKey: string | null
  publishedAt: string
}

export type PublicHomeSnapshot = {
  counts: { research: number; publications: number; projects: number; news: number }
  publicationRevision: string
  site: HomeSiteRecord | null
  navigation: HomeNavigationRecord[]
  profile: HomeProfileRecord | null
  research: HomeResearchRecord[]
  publications: HomePublicationRecord[]
  projects: HomeProjectRecord[]
  news: HomeNewsRecord[]
}

function requiredTimestamp(row: RawRow, field: string): string {
  return rowTimestamp(row, field)!
}

function site(row: RawRow): HomeSiteRecord {
  return {
    uid: rowRequiredText(row, 'uid', 128),
    updatedAt: requiredTimestamp(row, 'updated_at'),
    siteName: rowRequiredText(row, 'site_name', 1_024),
    siteNameEn: rowOptionalText(row, 'site_name_en', 1_024),
    heroTitle: rowOptionalText(row, 'hero_title', 2_048),
    heroSubtitle: rowOptionalText(row, 'hero_subtitle', 8_192),
    logoKey: rowOptionalText(row, 'logo_key', 2_048),
    faviconKey: rowOptionalText(row, 'favicon_key', 2_048),
    openGraphImageKey: rowOptionalText(row, 'og_image_key', 2_048),
    seoTitle: rowOptionalText(row, 'seo_title', 2_048),
    seoDescription: rowOptionalText(row, 'seo_description', 8_192),
    seoKeywords: rowOptionalText(row, 'seo_keywords', 8_192),
    footerText: rowOptionalText(row, 'footer_text', 32_768),
    homepageProfileUid: rowOptionalText(row, 'homepage_profile_uid', 128),
    publicationLimit: rowInteger(row, 'homepage_publication_limit', 0, LIMITS.publications)!,
    newsLimit: rowInteger(row, 'homepage_news_limit', 0, LIMITS.news)!,
  }
}

function navigation(row: RawRow): HomeNavigationRecord {
  return {
    uid: rowRequiredText(row, 'uid', 128), updatedAt: requiredTimestamp(row, 'updated_at'),
    title: rowRequiredText(row, 'title', 1_024), titleEn: rowOptionalText(row, 'title_en', 1_024),
    kind: rowOptionalText(row, 'kind', 128), urlName: rowOptionalText(row, 'url_name', 128),
    path: rowOptionalText(row, 'path', 2_048), fragment: rowOptionalText(row, 'fragment', 128),
    icon: rowOptionalText(row, 'icon', 128), style: rowOptionalText(row, 'style', 128), location: rowOptionalText(row, 'location', 128),
  }
}

function profile(row: RawRow): HomeProfileRecord {
  return {
    links: readPublicProfileLinks(row),
    lab: rowOptionalText(row, 'lab', 2048), email: rowOptionalText(row, 'public_email', 320), phone: rowOptionalText(row, 'public_phone', 128), office: rowOptionalText(row, 'public_office', 1024),
    uid: rowRequiredText(row, 'uid', 128), updatedAt: requiredTimestamp(row, 'updated_at'),
    name: rowRequiredText(row, 'name', 1_024), nameEn: rowOptionalText(row, 'name_en', 1_024),
    role: rowOptionalText(row, 'role', 1_024), title: rowOptionalText(row, 'title', 1_024),
    organization: rowOptionalText(row, 'organization', 2_048), avatarKey: rowOptionalText(row, 'avatar_key', 2_048),
    biography: rowOptionalText(row, 'bio', PUBLIC_PROFILE_BIOGRAPHY_MAX_BYTES), biographyEn: rowOptionalText(row, 'bio_en', PUBLIC_PROFILE_BIOGRAPHY_MAX_BYTES),
  }
}

function research(row: RawRow): HomeResearchRecord {
  return {
    displayNumber: rowInteger(row, 'display_number', 1, 10_000_000)!,
    uid: rowRequiredText(row, 'uid', 128), updatedAt: requiredTimestamp(row, 'updated_at'),
    name: rowRequiredText(row, 'name', 1_024), nameEn: rowOptionalText(row, 'name_en', 1_024),
    description: rowOptionalText(row, 'description', 64_000),
  }
}

function publication(row: RawRow): HomePublicationRecord {
  return {
    displayNumber: rowInteger(row, 'display_number', 1, 10_000_000)!,
    uid: rowRequiredText(row, 'uid', 128), updatedAt: requiredTimestamp(row, 'updated_at'),
    title: rowRequiredText(row, 'title', 4_096), authors: rowOptionalText(row, 'authors', 8_192),
    venue: rowOptionalText(row, 'venue', 2_048), year: rowInteger(row, 'year', 1, 9_999, true),
    doi: rowOptionalText(row, 'doi', 1_024), url: rowOptionalText(row, 'url', 2_048),
    publicationType: rowOptionalText(row, 'publication_type', 1_024), authorRole: rowOptionalText(row, 'author_role', 1_024),
    displayTags: rowOptionalText(row, 'display_tags', 8_192), indexType: rowOptionalText(row, 'index_type', 8192),
  }
}

function project(row: RawRow): HomeProjectRecord {
  return {
    amount: rowOptionalText(row, 'amount', 128),
    displayNumber: rowInteger(row, 'display_number', 1, 10_000_000)!,
    uid: rowRequiredText(row, 'uid', 128), updatedAt: requiredTimestamp(row, 'updated_at'),
    name: rowRequiredText(row, 'name', 4_096), source: rowOptionalText(row, 'source', 2_048),
    fundName: rowOptionalText(row, 'fund_name', 2_048), projectRole: rowOptionalText(row, 'project_role', 2_048),
    status: rowOptionalText(row, 'status', 1_024),
    projectNumber: rowOptionalText(row, 'project_number', 1024), principal: rowOptionalText(row, 'principal', 2048), startDate: rowOptionalText(row, 'start_date', 32), endDate: rowOptionalText(row, 'end_date', 32),
  }
}

function news(row: RawRow): HomeNewsRecord {
  return {
    displayNumber: rowInteger(row, 'display_number', 1, 10_000_000)!,
    uid: rowRequiredText(row, 'uid', 128), updatedAt: requiredTimestamp(row, 'updated_at'),
    title: rowRequiredText(row, 'title', 4_096), slug: rowRequiredText(row, 'slug', 512),
    category: rowOptionalText(row, 'category', 2_048), coverKey: rowOptionalText(row, 'cover_key', 2_048),
    publishedAt: requiredTimestamp(row, 'published_at'),
  }
}

export class PublicHomeStore {
  constructor(private readonly adapter: DatabaseAdapter) {}

  async load(now = new Date().toISOString()): Promise<PublicHomeSnapshot> {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(now) || new Date(now).toISOString() !== now) {
      throw new PublicSiteError('PUBLIC_INPUT', 'Invalid public home read timestamp')
    }
    const commands = buildHomeReadPlan(now)
    if (commands.length !== PUBLIC_HOME_BATCH_SIZE) throw new PublicSiteError('PUBLIC_PROTOCOL', 'Public home read plan has an unexpected shape')
    const results = await this.adapter.batch(commands)
    if (results.length !== commands.length) throw new PublicSiteError('PUBLIC_PROTOCOL', 'Public home database batch is incomplete')
    const stats = oneRow(results[7]!, row => ({
      research: rowInteger(row, 'research', 0, 10_000_000)!, publications: rowInteger(row, 'publications', 0, 10_000_000)!,
      projects: rowInteger(row, 'projects', 0, 10_000_000)!, news: rowInteger(row, 'news', 0, 10_000_000)!,
      generation: rowInteger(row, 'publication_generation', 0, Number.MAX_SAFE_INTEGER)!,
      translationGeneration: rowInteger(row, 'translation_generation', 0, Number.MAX_SAFE_INTEGER)!,
    }), 'Home totals')
    if (!stats) throw new PublicSiteError('PUBLIC_PROTOCOL', 'Home totals missing')
    return {
      counts: { research: stats.research, publications: stats.publications, projects: stats.projects, news: stats.news },
      publicationRevision: await sha256Hex(`public-list-v2:publications:${stats.generation}:${stats.translationGeneration}:${stats.publications}`),
      site: oneRow(results[0]!, site, 'Site settings'),
      navigation: manyRows(results[1]!, LIMITS.navigation, navigation, 'Navigation'),
      profile: oneRow(results[2]!, profile, 'Featured profile'),
      research: manyRows(results[3]!, LIMITS.research, research, 'Research interests'),
      publications: manyRows(results[4]!, LIMITS.publications, publication, 'Publications'),
      projects: manyRows(results[5]!, LIMITS.projects, project, 'Projects'),
      news: manyRows(results[6]!, LIMITS.news, news, 'News'),
    }
  }
}
