import { publicFooterHtml } from './public-content-blocks'
import { scopedNavigationHref } from '../../../shared/utils/public-list-link'
import { localizedProfileLinks } from './public-profile-links'
import type { DatabaseAdapter } from '../../../db/contracts'
import type { SiteLocale } from '../../../shared/contracts/i18n'
import { PUBLIC_PROFILE_BIOGRAPHY_MAX_BYTES } from '../../../shared/contracts/public-site'
import type { MediaProjectionRequest } from '../../../shared/contracts/media'
import type {
  PublicHomeViewModel,
  PublicNavigationLocation,
  PublicSiteLink,
} from '../../../shared/contracts/public-site'
import type { PublicJsonValue } from '../../../shared/contracts/view-model'
import { publicRecordPath, resolvePublicNavigation } from '../../../shared/utils/public-path'
import type { PublicCachePolicy } from '../../cache/contracts'
import type { PublicCacheService } from '../../cache/public-cache'
import type { TranslationBatchReader } from '../i18n/translation-reader'
import type { MediaService } from '../media/media-service'
import { stablePublicJson, sha256Hex } from '../../view-model/serializer'
import { PublicSiteError } from './errors'
import { rowOptionalText } from './public-row'
import { PublicTranslationPlan, type PublicTranslationSlot, type PublicTranslations } from './public-localization'
import {
  boundedList, excerpt, safeMailAddress, periodLabel,
  localizedDate,
  localizedPublicMedia,
  normalizedConfiguredText,
  plainText,
  publicNow,
  safeDoi,
  safeExternalUrl,
} from './public-values'
import {
  PublicHomeStore,
  type HomeNavigationRecord,
  type PublicHomeSnapshot,
} from './public-home-store'

const MAX_HOME_ASSEMBLY_MILLISECONDS = 20_000
const CACHE_TAGS = Object.freeze([
  'public:home',
  'public:site',
  'public:navigation',
  'public:profiles',
  'public:research',
  'public:publications',
  'public:projects',
  'public:news',
  'public:translations',
  'public:media',
  'public:media-policy',
] as const)

const DEFAULT_TEXT = Object.freeze({
  zh: {
    siteName: '学术主页',
    heroTitle: '研究、教学与学术成果',
    heroSubtitle: '面向教师、科研团队与实验室的长期学术展示。',
    seoDescription: '教师与科研团队的研究方向、学术成果、项目和最新动态。',
  },
  en: {
    siteName: 'Academic Profile',
    heroTitle: 'Research, teaching, and academic work',
    heroSubtitle: 'A durable academic presence for faculty, research groups, and laboratories.',
    seoDescription: 'Research interests, publications, projects, and news from a faculty member or research group.',
  },
})

type CacheState = 'hit' | 'stale' | 'miss'

export type PublicHomeResult = {
  viewModel: PublicHomeViewModel
  cache: CacheState
  etag: string
}

export interface PublicHomeServiceOptions {
  defaultSiteName: string
  publicMediaGrantSeconds: number
  now?: () => Date
}

export function homeCachePolicy(publicMediaGrantSeconds: number): PublicCachePolicy {
  if (!Number.isSafeInteger(publicMediaGrantSeconds) || publicMediaGrantSeconds < 30 || publicMediaGrantSeconds > 3_600) {
    throw new PublicSiteError('PUBLIC_INPUT', 'Invalid public media grant lifetime')
  }
  // Tokens have at least one configured lifetime remaining when issued. Keep a
  // twenty-second assembly/clock margin so a cached ViewModel never outlives
  // its shortest managed media URL, including the stale response window.
  const retentionBudget = Math.max(2, publicMediaGrantSeconds - 20)
  const ttlSeconds = Math.min(60, Math.max(1, Math.floor(retentionBudget / 4)))
  const staleSeconds = Math.max(0, retentionBudget - ttlSeconds)
  return { ttlSeconds, staleSeconds, maxPayloadBytes: 768_000 }
}

function normalizeNavigation(
  records: readonly HomeNavigationRecord[],
  localized: PublicTranslations,
  slots: readonly PublicTranslationSlot[],
  locale: SiteLocale,
): Record<PublicNavigationLocation, PublicSiteLink[]> {
  const output: Record<PublicNavigationLocation, PublicSiteLink[]> = { header: [], hero: [], footer: [] }
  const seen: Record<PublicNavigationLocation, Set<string>> = { header: new Set(), hero: new Set(), footer: new Set() }
  records.forEach((record, index) => {
    const label = localized.text(slots[index]!)?.trim()
    if (!label) return
    let resolved
    try {
      resolved = resolvePublicNavigation({
        kind: record.kind,
        urlName: record.urlName,
        path: record.path,
        fragment: record.fragment,
        icon: record.icon,
        style: record.style,
        location: record.location,
      }, locale)
    }
    catch { return }
    if (!resolved) return
    const dedupeKey = `${resolved.href}\u0000${label}`
    if (seen[resolved.location].has(dedupeKey)) return
    seen[resolved.location].add(dedupeKey)
    output[resolved.location].push({ uid: record.uid, label, ...resolved, href: scopedNavigationHref(resolved.href, record.uid) })
  })
  return output
}

function mediaRequests(snapshot: PublicHomeSnapshot): MediaProjectionRequest[] {
  const siteUid = snapshot.site?.uid ?? 'site:default'
  const siteRevision = snapshot.site?.updatedAt ?? 'default-site-v1'
  const requests: MediaProjectionRequest[] = [
    {
      objectKey: snapshot.site?.logoKey ?? null,
      module: 'site_settings', recordUid: siteUid, visibility: 'public', purpose: 'logo',
      referenceRevision: siteRevision, alt: snapshot.site?.siteName ?? '', fallback: 'initials', width: 96, height: 96,
    },
    {
      objectKey: snapshot.site?.faviconKey ?? null,
      module: 'site_settings', recordUid: siteUid, visibility: 'public', purpose: 'favicon',
      referenceRevision: siteRevision, alt: '', fallback: 'none', width: 64, height: 64,
    },
    {
      objectKey: snapshot.site?.openGraphImageKey ?? null,
      module: 'site_settings', recordUid: siteUid, visibility: 'public', purpose: 'og_image',
      referenceRevision: siteRevision, alt: snapshot.site?.siteName ?? '', fallback: 'none', width: 1200, height: 630,
    },
  ]
  if (snapshot.profile) {
    requests.push({
      objectKey: snapshot.profile.avatarKey,
      module: 'profiles', recordUid: snapshot.profile.uid, visibility: 'public', purpose: 'avatar',
      referenceRevision: snapshot.profile.updatedAt, alt: snapshot.profile.name, fallback: 'initials', width: 480, height: 640,
    })
  }
  for (const item of snapshot.news) {
    requests.push({
      objectKey: item.coverKey,
      module: 'news', recordUid: item.uid, visibility: 'public', purpose: 'cover',
      referenceRevision: item.updatedAt, alt: item.title, fallback: 'placeholder', width: 960, height: 540,
    })
  }
  return requests
}

function buildTranslationPlan(snapshot: PublicHomeSnapshot, runtimeName: string): {
  plan: PublicTranslationPlan
  slots: {
    site: Record<'name' | 'heroTitle' | 'heroSubtitle' | 'seoTitle' | 'seoDescription' | 'seoKeywords' | 'footerText', PublicTranslationSlot>
    navigation: PublicTranslationSlot[]
    profile: null | Record<'name' | 'role' | 'title' | 'organization' | 'lab' | 'office' | 'biography', PublicTranslationSlot>
    research: Array<Record<'name' | 'description', PublicTranslationSlot>>
    publications: Array<Record<'title' | 'authors' | 'venue' | 'publicationType' | 'authorRole', PublicTranslationSlot>>
    projects: Array<Record<'name' | 'source' | 'fundName' | 'role' | 'status' | 'principal', PublicTranslationSlot>>
    news: Array<Record<'title' | 'category', PublicTranslationSlot>>
  }
} {
  const plan = new PublicTranslationPlan()
  const site = snapshot.site
  const siteUid = site?.uid ?? 'site:default'
  const siteName = site?.siteName ?? runtimeName
  const slots = {
    site: {
      name: plan.add('site_settings', siteUid, 'site_name', siteName, site?.siteNameEn),
      heroTitle: plan.add('site_settings', siteUid, 'hero_title', site?.heroTitle ?? null),
      heroSubtitle: plan.add('site_settings', siteUid, 'hero_subtitle', site?.heroSubtitle ?? null),
      seoTitle: plan.add('site_settings', siteUid, 'seo_title', site?.seoTitle ?? site?.heroTitle ?? null),
      seoDescription: plan.add('site_settings', siteUid, 'seo_description', site?.seoDescription ?? site?.heroSubtitle ?? null),
      seoKeywords: plan.add('site_settings', siteUid, 'seo_keywords', site?.seoKeywords ?? null),
      footerText: plan.add('site_settings', siteUid, 'footer_text', site?.footerText ?? null),
    },
    navigation: snapshot.navigation.map(item => plan.add('navigation_items', item.uid, 'title', item.title, item.titleEn)),
    profile: snapshot.profile ? {
      name: plan.add('profiles', snapshot.profile.uid, 'name', snapshot.profile.name, snapshot.profile.nameEn),
      role: plan.add('profiles', snapshot.profile.uid, 'role', snapshot.profile.role),
      title: plan.add('profiles', snapshot.profile.uid, 'title', snapshot.profile.title),
      organization: plan.add('profiles', snapshot.profile.uid, 'organization', snapshot.profile.organization),
      lab: plan.add('profiles', snapshot.profile.uid, 'lab', snapshot.profile.lab),
      office: plan.add('profiles', snapshot.profile.uid, 'office', snapshot.profile.office),
      biography: plan.add('profiles', snapshot.profile.uid, 'bio', snapshot.profile.biography, snapshot.profile.biographyEn),
    } : null,
    research: snapshot.research.map(item => ({
      name: plan.add('research_interests', item.uid, 'name', item.name, item.nameEn),
      description: plan.add('research_interests', item.uid, 'description', item.description),
    })),
    publications: snapshot.publications.map(item => ({
      title: plan.add('publications', item.uid, 'title', item.title),
      authors: plan.add('publications', item.uid, 'authors', item.authors),
      venue: plan.add('publications', item.uid, 'venue', item.venue),
      publicationType: plan.add('publications', item.uid, 'publication_type', item.publicationType),
      authorRole: plan.add('publications', item.uid, 'author_role', item.authorRole),
    })),
    projects: snapshot.projects.map(item => ({
      name: plan.add('projects', item.uid, 'name', item.name),
      source: plan.add('projects', item.uid, 'source', item.source),
      fundName: plan.add('projects', item.uid, 'fund_name', item.fundName),
      role: plan.add('projects', item.uid, 'project_role', item.projectRole),
      status: plan.add('projects', item.uid, 'status', item.status),
      principal: plan.add('projects', item.uid, 'principal', item.principal),
    })),
    news: snapshot.news.map(item => ({
      title: plan.add('news', item.uid, 'title', item.title),
      category: plan.add('news', item.uid, 'category', item.category),
    })),
  }
  return { plan, slots }
}

export class PublicHomeService {
  private readonly store: PublicHomeStore
  private readonly clock: () => Date
  private readonly defaultSiteName: string
  private readonly policy: PublicCachePolicy

  constructor(
    adapter: DatabaseAdapter,
    private readonly translations: TranslationBatchReader,
    private readonly media: MediaService,
    private readonly cache: PublicCacheService,
    options: PublicHomeServiceOptions,
  ) {
    if (!adapter || !translations || !media || !cache || !options) throw new PublicSiteError('PUBLIC_INPUT', 'Public home dependencies are required')
    this.store = new PublicHomeStore(adapter)
    this.clock = options.now ?? (() => new Date())
    this.defaultSiteName = normalizedConfiguredText(options.defaultSiteName, 'default public site name')
    this.policy = homeCachePolicy(options.publicMediaGrantSeconds)
  }

  private async build(locale: SiteLocale): Promise<PublicHomeViewModel> {
    const startedAt = publicNow(this.clock)
    const snapshot = await this.store.load(startedAt.toISOString())
    const translation = buildTranslationPlan(snapshot, this.defaultSiteName)
    const requests = mediaRequests(snapshot)
    const [localized, projectedMedia] = await Promise.all([
      translation.plan.resolve(this.translations, locale),
      this.media.project(requests, null),
    ])
    if (projectedMedia.length !== requests.length) throw new PublicSiteError('PUBLIC_PROTOCOL', 'Media projection result is incomplete')

    const defaults = DEFAULT_TEXT[locale]
    const name = localized.text(translation.slots.site.name)?.trim() || this.defaultSiteName || defaults.siteName
    const heroTitle = localized.text(translation.slots.site.heroTitle)?.trim() || defaults.heroTitle
    const heroSubtitle = localized.text(translation.slots.site.heroSubtitle)?.trim() || defaults.heroSubtitle
    const seoTitle = localized.text(translation.slots.site.seoTitle)?.trim() || heroTitle
    const seoDescription = localized.text(translation.slots.site.seoDescription)?.trim() || heroSubtitle || defaults.seoDescription
    const navigation = normalizeNavigation(snapshot.navigation, localized, translation.slots.navigation, locale)
    const siteUid = snapshot.site?.uid ?? 'site:default'

    let mediaIndex = 0
    const logo = localizedPublicMedia(projectedMedia[mediaIndex++], name, 'image', 'initials')
    const favicon = localizedPublicMedia(projectedMedia[mediaIndex++], '', 'image', 'none')
    const openGraphImage = localizedPublicMedia(projectedMedia[mediaIndex++], name, 'image', 'none')

    let featuredProfile = null
    if (snapshot.profile && translation.slots.profile) {
      const record = snapshot.profile
      const slot = translation.slots.profile
      const profileName = localized.text(slot.name)?.trim() || record.name
      featuredProfile = {
        uid: record.uid,
        links: localizedProfileLinks(record.links, locale),
        name: profileName,
        role: localized.text(slot.role),
        title: localized.text(slot.title),
        organization: localized.text(slot.organization),
        // Biography is a plain-text textarea, escaped by Vue; preserve its paragraphs and spacing.
        biography: rowOptionalText({ biography: localized.text(slot.biography) }, 'biography', PUBLIC_PROFILE_BIOGRAPHY_MAX_BYTES), lab: localized.text(slot.lab),
        contact: record.email || record.phone || record.office ? { email: safeMailAddress(record.email), phone: plainText(record.phone, 128), office: plainText(localized.text(slot.office), 2048) } : null,
        href: publicRecordPath(locale, 'profiles', record.uid),
        avatar: localizedPublicMedia(projectedMedia[mediaIndex++], profileName, 'image', 'initials'),
      }
    }

    const researchInterests = snapshot.research.map((record, index) => ({
      uid: record.uid, displayNumber: record.displayNumber, href: publicRecordPath(locale, 'research', record.uid),
      name: localized.text(translation.slots.research[index]!.name)?.trim() || record.name,
      description: excerpt(localized.text(translation.slots.research[index]!.description), 300),
    }))

    const publications = snapshot.publications.map((record, index) => {
      const slot = translation.slots.publications[index]!
      return {
        uid: record.uid, displayNumber: record.displayNumber, featured: true, indexTypes: boundedList(record.indexType, 8, 128),
        title: localized.text(slot.title)?.trim() || record.title,
        authors: localized.text(slot.authors),
        venue: localized.text(slot.venue),
        year: record.year,
        doi: safeDoi(record.doi),
        externalUrl: safeExternalUrl(record.url),
        publicationType: localized.text(slot.publicationType),
        authorRole: localized.text(slot.authorRole),
        tags: boundedList(record.displayTags, 6, 128),
        href: publicRecordPath(locale, 'publications', record.uid),
      }
    })

    const projects = snapshot.projects.map((record, index) => {
      const slot = translation.slots.projects[index]!
      return {
        uid: record.uid, displayNumber: record.displayNumber, featured: true,
        amount: record.amount, projectNumber: record.projectNumber, principal: localized.text(slot.principal), startDate: record.startDate, endDate: record.endDate, periodLabel: periodLabel(record.startDate, record.endDate, locale),
        name: localized.text(slot.name)?.trim() || record.name,
        source: localized.text(slot.source),
        fundName: localized.text(slot.fundName),
        role: localized.text(slot.role),
        status: localized.text(slot.status),
        summary: null,
        href: publicRecordPath(locale, 'projects', record.uid),
      }
    })

    const news = snapshot.news.map((record, index) => {
      const slot = translation.slots.news[index]!
      const title = localized.text(slot.title)?.trim() || record.title
      return {
        uid: record.uid, displayNumber: record.displayNumber, featured: true,
        title,
        slug: record.slug,
        category: localized.text(slot.category),
        publishedAt: record.publishedAt,
        publishedLabel: localizedDate(record.publishedAt, locale)!,
        href: publicRecordPath(locale, 'news', record.slug),
        cover: localizedPublicMedia(projectedMedia[mediaIndex++], title, 'image', 'placeholder'),
      }
    })

    if (mediaIndex !== projectedMedia.length) throw new PublicSiteError('PUBLIC_PROTOCOL', 'Media projection result has unexpected entries')

    const completedAt = publicNow(this.clock)
    const assemblyMilliseconds = completedAt.getTime() - startedAt.getTime()
    if (!Number.isSafeInteger(assemblyMilliseconds) || assemblyMilliseconds < 0 || assemblyMilliseconds > MAX_HOME_ASSEMBLY_MILLISECONDS) {
      throw new PublicSiteError('PUBLIC_UNAVAILABLE', 'Public home assembly exceeded its media safety window')
    }
    const generatedAt = completedAt.toISOString()
    const viewModel: PublicHomeViewModel = {
      schemaVersion: 1,
      locale,
      homePath: locale === 'zh' ? '/zh' : '/en',
      alternatePath: locale === 'zh' ? '/en' : '/zh',
      generatedAt,
      site: {
        uid: siteUid,
        name,
        heroTitle,
        heroSubtitle,
        seoTitle,
        seoDescription,
        keywords: boundedList(localized.text(translation.slots.site.seoKeywords), 12, 128),
        footerText: plainText(localized.text(translation.slots.site.footerText)),
        footerHtml: publicFooterHtml(localized.text(translation.slots.site.footerText)),
        logo,
        favicon,
        openGraphImage,
      },
      navigation,
      publicationRevision: snapshot.publicationRevision,
      featuredProfile,
      researchInterests,
      publications,
      projects,
      news,
      sections: {
        research: researchInterests.length > 0,
        publications: publications.length > 0,
        projects: projects.length > 0,
        news: news.length > 0,
      },
      counts: {
        research: snapshot.counts.research,
        publications: snapshot.counts.publications,
        projects: snapshot.counts.projects,
        news: snapshot.counts.news,
      },
    }
    return stablePublicJson(viewModel, { limits: { maxBytes: 768_000, maxDepth: 16, maxNodes: 10_000 } }).value as unknown as PublicHomeViewModel
  }

  async home(locale: SiteLocale): Promise<PublicHomeResult> {
    if (locale !== 'zh' && locale !== 'en') throw new PublicSiteError('PUBLIC_INPUT', 'Unsupported public site locale')
    const remembered = await this.cache.remember<PublicJsonValue>({
      namespace: 'public-site',
      resource: 'home',
      locale,
      tags: CACHE_TAGS,
      schemaVersion: 9,
    }, this.policy, async () => this.build(locale) as unknown as PublicJsonValue)
    const viewModel = remembered.value as unknown as PublicHomeViewModel
    const etag = remembered.etag ?? `"vm-${await sha256Hex(stablePublicJson(viewModel, { limits: { maxBytes: 768_000 } }).json)}"`
    return { viewModel, cache: remembered.cache, etag }
  }
}
