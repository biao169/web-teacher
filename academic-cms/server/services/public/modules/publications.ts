import type { DatabaseAdapter } from '../../../../db/contracts'
import type { PublicCitation, PublicPublicationDetailViewModel, PublicPublicationListViewModel } from '../../../../shared/contracts/public-content'
import type { SiteLocale } from '../../../../shared/contracts/i18n'
import type { MediaProjectionRequest } from '../../../../shared/contracts/media'
import { publicRecordPath } from '../../../../shared/utils/public-path'
import type { PublicCacheService } from '../../../cache/public-cache'
import type { TranslationBatchReader } from '../../i18n/translation-reader'
import type { MediaService } from '../../media/media-service'
import { PublicContentStore } from '../public-content-store'
import { PublicTranslationPlan } from '../public-localization'
import { PublicModuleServiceBase } from '../public-module-base'
import { filterGroups, pageMeta, pagination, queryView } from '../public-page'
import type { PublicListRequest } from '../public-query'
import { publicListPath } from '../public-query'
import { boundedList, excerpt, localizedPublicMedia, plainText, safeDoi, safeExternalUrl, safeRecordIdentifier } from '../public-values'
import { PublicSiteError } from '../errors'
import { publicCitation } from '../public-citation'
import { PUBLIC_CITATION_STYLES } from '../../../../shared/contracts/public-citation'

const TAGS = Object.freeze(['public:publications', 'public:translations', 'public:media', 'public:media-policy'] as const)
const COPY = Object.freeze({
  zh: { title: '论文成果', featuredTitle: '精选论文', description: '检索论文题名、作者、期刊会议、年份和收录信息。', year: '年份', venue: '期刊／会议', type: '论文类型', index: '收录类型', featured: '精选', yes: '是', no: '否' },
  en: { title: 'Publications', featuredTitle: 'Featured publications', description: 'Search publications by title, author, venue, year, and indexing information.', year: 'Year', venue: 'Journal / conference', type: 'Publication type', index: 'Index', featured: 'Featured', yes: 'Yes', no: 'No' },
})

function citations(locale: SiteLocale, record: Awaited<ReturnType<PublicContentStore['publication']>>): PublicCitation[] {
  if (!record) return []
  const names = { gbt: 'Gbt', elsevier: 'Elsevier', apa: 'Apa', ieee: 'Ieee' } as const
  return PUBLIC_CITATION_STYLES.map(style => publicCitation({
    ...record, text: record[`citation${names[style]}`], highlights: record[`highlight${names[style]}`],
  }, style))
}

export class PublicPublicationsService extends PublicModuleServiceBase {
  private readonly store: PublicContentStore
  constructor(adapter: DatabaseAdapter, translations: TranslationBatchReader, media: MediaService, cache: PublicCacheService, grantSeconds: number, now?: () => Date) {
    super(translations, media, cache, grantSeconds, now); this.store = new PublicContentStore(adapter)
  }

  private listForRoute(request: PublicListRequest, featuredRoute: boolean) {
    const cacheResource = featuredRoute ? 'featured-publications' : 'publications'
    return this.listResult<PublicPublicationListViewModel>(cacheResource, request, TAGS, async () => {
      const snapshot = await this.store.publications(request)
      const plan = new PublicTranslationPlan()
      const slots = snapshot.items.map(item => ({
        title: plan.add('publications', item.uid, 'title', item.title), authors: plan.add('publications', item.uid, 'authors', item.authors),
        venue: plan.add('publications', item.uid, 'venue', item.venue), type: plan.add('publications', item.uid, 'publication_type', item.publicationType),
        role: plan.add('publications', item.uid, 'author_role', item.authorRole), index: plan.add('publications', item.uid, 'index_type', item.indexType),
      }))
      const mediaRequests: MediaProjectionRequest[] = request.selectedUids ? snapshot.items.map(item => ({
        objectKey: item.pdfKey ?? null, module: 'publications', recordUid: item.uid, visibility: 'public', secondaryVisibility: item.pdfVisibility ?? 'hidden',
        purpose: 'publication_pdf', referenceRevision: item.updatedAt, alt: item.title, title: item.title, fallback: 'none', disposition: 'inline', allowDownload: true,
      })) : []
      const [localized, projected] = await Promise.all([plan.resolve(this.translations, request.locale), this.media.project(mediaRequests, null)])
      const items = snapshot.items.map((item, index) => {
        const slot = slots[index]!
        return {
          uid: item.uid, displayNumber: item.displayNumber, title: localized.required(slot.title, item.title), authors: localized.text(slot.authors), venue: localized.text(slot.venue),
          year: item.year, publicationType: localized.text(slot.type), authorRole: localized.text(slot.role),
          indexTypes: boundedList(localized.text(slot.index), 10), tags: boundedList(item.displayTags, 10),
          doi: safeDoi(item.doi), externalUrl: safeExternalUrl(item.url), featured: item.featured,
          href: publicRecordPath(request.locale, 'publications', item.uid),
          ...(item.citationInput ? { citation: publicCitation(item.citationInput, request.citationStyle ?? 'gbt'), pdf: localizedPublicMedia(projected[index], item.title, 'pdf', 'none') } : {}),
        }
      })
      const copy = COPY[request.locale]
      const title = featuredRoute ? copy.featuredTitle : copy.title
      const routeModule = featuredRoute ? 'publications/featured' : 'publications'
      const routePath = publicListPath(routeModule, request)
      const alternatePath = publicListPath(routeModule, request, request.locale === 'zh' ? 'en' : 'zh')
      return {
        schemaVersion: 1, locale: request.locale, module: 'publications', generatedAt: this.generatedAt(),
        meta: pageMeta({ locale: request.locale, title, description: copy.description, path: routePath, alternatePath }),
        query: queryView(request),
        filters: filterGroups(snapshot.facets, request, { year: copy.year, venue: copy.venue, publicationType: copy.type, indexType: copy.index, featured: copy.featured },
          (key, value) => key === 'featured' ? (value === '1' ? copy.yes : copy.no) : value).filter(group => !featuredRoute || group.key !== 'featured'),
        totalPublic: snapshot.totalPublic, revision: snapshot.revision,
        pagination: pagination(request, snapshot.total), items,
      }
    })
  }

  list(request: PublicListRequest) { return this.listForRoute(request, false) }
  featured(request: PublicListRequest) { return this.listForRoute(request, true) }

  detail(locale: SiteLocale, uidInput: string) {
    const uid = safeRecordIdentifier(uidInput)
    return this.detailResult<PublicPublicationDetailViewModel>('publications', 'publications', locale, uid, TAGS, async () => {
      const item = await this.store.publication(uid)
      if (!item) throw new PublicSiteError('PUBLIC_NOT_FOUND', 'Public publication was not found')
      const plan = new PublicTranslationPlan()
      const slots = {
        title: plan.add('publications', item.uid, 'title', item.title), authors: plan.add('publications', item.uid, 'authors', item.authors),
        venue: plan.add('publications', item.uid, 'venue', item.venue), type: plan.add('publications', item.uid, 'publication_type', item.publicationType),
        role: plan.add('publications', item.uid, 'author_role', item.authorRole), corresponding: plan.add('publications', item.uid, 'corresponding_authors', item.correspondingAuthors),
        index: plan.add('publications', item.uid, 'index_type', item.indexType), abstract: plan.add('publications', item.uid, 'abstract', item.abstract),
        keywords: plan.add('publications', item.uid, 'keywords', item.keywords),
      }
      const mediaRequest: MediaProjectionRequest = {
        objectKey: item.pdfKey, module: 'publications', recordUid: item.uid, visibility: 'public', secondaryVisibility: item.pdfVisibility,
        purpose: 'publication_pdf', referenceRevision: item.updatedAt, alt: item.title, title: item.title, fallback: 'none', disposition: 'inline', allowDownload: true,
      }
      const [localized, projected] = await Promise.all([plan.resolve(this.translations, locale), this.media.project([mediaRequest], null)])
      const title = localized.required(slots.title, item.title)
      const path = publicRecordPath(locale, 'publications', item.uid)
      const abstract = plainText(localized.text(slots.abstract), 128_000)
      const description = excerpt(abstract, 200) ?? (
        [localized.text(slots.authors), localized.text(slots.venue), item.year ? String(item.year) : null].filter(Boolean).join(' · ')
        || (locale === 'zh' ? `${title}的论文详情。` : `Publication details for ${title}.`)
      )
      const pdf = localizedPublicMedia(projected[0], title, 'pdf', 'none')
      return {
        schemaVersion: 1, locale, module: 'publications', generatedAt: this.generatedAt(),
        meta: pageMeta({ locale, title, description, path, alternatePath: publicRecordPath(locale === 'zh' ? 'en' : 'zh', 'publications', item.uid), sectionLabel: COPY[locale].title, sectionPath: `/${locale}/publications`, type: 'article' }),
        item: {
          uid: item.uid, title, authors: localized.text(slots.authors), venue: localized.text(slots.venue), year: item.year,
          publicationType: localized.text(slots.type), authorRole: localized.text(slots.role), indexTypes: boundedList(localized.text(slots.index), 10),
          tags: boundedList(item.displayTags, 10), doi: safeDoi(item.doi), externalUrl: safeExternalUrl(item.url), featured: item.featured, href: path,
          sourceCitation: plainText(item.sourceCitation, 32_000), volume: item.volume, issue: item.issue, pages: item.pages,
          correspondingAuthors: localized.text(slots.corresponding), abstract, keywords: boundedList(localized.text(slots.keywords), 24),
          bibtex: item.bibtex, citations: citations(locale, item), pdf,
        },
      }
    })
  }
}
