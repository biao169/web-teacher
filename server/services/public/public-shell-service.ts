import { publicFooterHtml } from './public-content-blocks'
import { scopedNavigationHref } from '../../../shared/utils/public-list-link'
import type { DatabaseAdapter } from '../../../db/contracts'
import type { SiteLocale } from '../../../shared/contracts/i18n'
import type { MediaProjectionRequest } from '../../../shared/contracts/media'
import type { PublicNavigationLocation, PublicShellViewModel, PublicSiteLink } from '../../../shared/contracts/public-site'
import type { PublicJsonValue } from '../../../shared/contracts/view-model'
import { resolvePublicNavigation } from '../../../shared/utils/public-path'
import type { PublicCacheService } from '../../cache/public-cache'
import type { TranslationBatchReader } from '../i18n/translation-reader'
import type { MediaService } from '../media/media-service'
import { boundedList, localizedPublicMedia, normalizedConfiguredText, plainText, publicNow } from './public-values'
import { PublicTranslationPlan } from './public-localization'
import { mediaBoundedCachePolicy, rememberPublicView, type PublicServiceResult } from './public-result'
import { PublicShellStore, type ShellNavigationRecord } from './public-shell-store'

const TAGS = Object.freeze(['public:layout', 'public:site', 'public:navigation', 'public:translations', 'public:media', 'public:media-policy'] as const)
const DEFAULTS = Object.freeze({
  zh: { title: '研究、教学与学术成果', subtitle: '面向教师、科研团队与实验室的长期学术展示。' },
  en: { title: 'Research, teaching, and academic work', subtitle: 'A durable academic presence for faculty, research groups, and laboratories.' },
})

function navigation(records: readonly ShellNavigationRecord[], labels: readonly string[], locale: SiteLocale): Record<PublicNavigationLocation, PublicSiteLink[]> {
  const output: Record<PublicNavigationLocation, PublicSiteLink[]> = { header: [], hero: [], footer: [] }
  const seen = new Set<string>()
  records.forEach((record, index) => {
    const label = labels[index]?.trim()
    if (!label) return
    try {
      const resolved = resolvePublicNavigation(record, locale)
      if (!resolved) return
      const key = `${resolved.location}\u0000${resolved.href}\u0000${label}`
      if (seen.has(key)) return
      seen.add(key)
      output[resolved.location].push({ uid: record.uid, label, ...resolved, href: scopedNavigationHref(resolved.href, record.uid) })
    }
    catch { /* malformed admin navigation is skipped, never reflected */ }
  })
  return output
}

export class PublicShellService {
  private readonly store: PublicShellStore
  private readonly defaultSiteName: string
  private readonly clock: () => Date
  private readonly policy

  constructor(
    adapter: DatabaseAdapter,
    private readonly translations: TranslationBatchReader,
    private readonly media: MediaService,
    private readonly cache: PublicCacheService,
    options: { defaultSiteName: string; publicMediaGrantSeconds: number; now?: () => Date },
  ) {
    this.store = new PublicShellStore(adapter)
    this.defaultSiteName = normalizedConfiguredText(options.defaultSiteName, 'default public site name')
    this.clock = options.now ?? (() => new Date())
    this.policy = mediaBoundedCachePolicy(options.publicMediaGrantSeconds, 300, 1_800, 96_000)
  }

  private async build(locale: SiteLocale): Promise<PublicShellViewModel> {
    const snapshot = await this.store.load()
    const site = snapshot.site
    const siteUid = site?.uid ?? 'site:default'
    const revision = site?.updatedAt ?? 'default-site-v1'
    const plan = new PublicTranslationPlan()
    const slots = {
      name: plan.add('site_settings', siteUid, 'site_name', site?.siteName ?? this.defaultSiteName, site?.siteNameEn),
      heroTitle: plan.add('site_settings', siteUid, 'hero_title', site?.heroTitle ?? null),
      heroSubtitle: plan.add('site_settings', siteUid, 'hero_subtitle', site?.heroSubtitle ?? null),
      seoTitle: plan.add('site_settings', siteUid, 'seo_title', site?.seoTitle ?? site?.heroTitle ?? null),
      seoDescription: plan.add('site_settings', siteUid, 'seo_description', site?.seoDescription ?? site?.heroSubtitle ?? null),
      seoKeywords: plan.add('site_settings', siteUid, 'seo_keywords', site?.seoKeywords ?? null),
      footerText: plan.add('site_settings', siteUid, 'footer_text', site?.footerText ?? null),
      navigation: snapshot.navigation.map(item => plan.add('navigation_items', item.uid, 'title', item.title, item.titleEn)),
    }
    const mediaRequests: MediaProjectionRequest[] = [
      { objectKey: site?.logoKey ?? null, module: 'site_settings', recordUid: siteUid, visibility: 'public', purpose: 'logo', referenceRevision: revision, alt: site?.siteName ?? this.defaultSiteName, fallback: 'initials', width: 96, height: 96 },
      { objectKey: site?.faviconKey ?? null, module: 'site_settings', recordUid: siteUid, visibility: 'public', purpose: 'favicon', referenceRevision: revision, alt: '', fallback: 'none', width: 64, height: 64 },
      { objectKey: site?.openGraphImageKey ?? null, module: 'site_settings', recordUid: siteUid, visibility: 'public', purpose: 'og_image', referenceRevision: revision, alt: site?.siteName ?? this.defaultSiteName, fallback: 'none', width: 1200, height: 630 },
    ]
    const [localized, projected] = await Promise.all([plan.resolve(this.translations, locale), this.media.project(mediaRequests, null)])
    if (projected.length !== mediaRequests.length) throw new TypeError('Public shell media projection is incomplete')
    const defaults = DEFAULTS[locale]
    const name = localized.required(slots.name, this.defaultSiteName)
    const heroTitle = localized.required(slots.heroTitle, defaults.title)
    const heroSubtitle = localized.text(slots.heroSubtitle, defaults.subtitle)?.trim() || defaults.subtitle
    const labels = slots.navigation.map(slot => localized.text(slot, '') ?? '')
    return {
      schemaVersion: 1,
      locale,
      homePath: locale === 'zh' ? '/zh' : '/en',
      alternatePath: locale === 'zh' ? '/en' : '/zh',
      generatedAt: publicNow(this.clock).toISOString(),
      site: {
        uid: siteUid,
        name,
        heroTitle,
        heroSubtitle,
        seoTitle: localized.required(slots.seoTitle, heroTitle),
        seoDescription: localized.required(slots.seoDescription, heroSubtitle),
        keywords: boundedList(localized.text(slots.seoKeywords), 12),
        footerText: plainText(localized.text(slots.footerText)),
        footerHtml: publicFooterHtml(localized.text(slots.footerText)),
        logo: localizedPublicMedia(projected[0], name, 'image', 'initials'),
        favicon: localizedPublicMedia(projected[1], '', 'image', 'none'),
        openGraphImage: localizedPublicMedia(projected[2], name, 'image', 'none'),
      },
      navigation: navigation(snapshot.navigation, labels, locale),
    }
  }

  shell(locale: SiteLocale): Promise<PublicServiceResult<PublicShellViewModel>> {
    return rememberPublicView(this.cache, {
      namespace: 'public-site', resource: 'shell', locale, tags: TAGS, schemaVersion: 4,
    }, this.policy, 96_000, () => this.build(locale))
  }
}
