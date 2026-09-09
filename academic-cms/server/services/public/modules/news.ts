import type { DatabaseAdapter } from '../../../../db/contracts'
import type { PublicNewsDetailViewModel, PublicNewsListViewModel, PublicRelatedLink } from '../../../../shared/contracts/public-content'
import type { SiteLocale } from '../../../../shared/contracts/i18n'
import type { MediaProjectionRequest } from '../../../../shared/contracts/media'
import { publicRecordPath } from '../../../../shared/utils/public-path'
import type { PublicCacheService } from '../../../cache/public-cache'
import type { TranslationBatchReader } from '../../i18n/translation-reader'
import type { MediaService } from '../../media/media-service'
import { PublicContentStore } from '../public-content-store'
import { publicContentBlocks, richTextMediaReferencesFromHtml } from '../public-content-blocks'
import { PublicTranslationPlan, type PublicTranslationSlot } from '../public-localization'
import { PublicModuleServiceBase } from '../public-module-base'
import { filterGroups, pageMeta, pagination, queryView } from '../public-page'
import type { PublicListRequest } from '../public-query'
import { publicListPath } from '../public-query'
import { excerpt, localizedDate, localizedPublicMedia, plainText, safeRecordIdentifier } from '../public-values'
import { PublicSiteError } from '../errors'

const TAGS = Object.freeze(['public:news', 'public:translations', 'public:media', 'public:media-policy'] as const)
const COPY = Object.freeze({
  zh: { title: '动态', description: '查看团队最新的研究、教学、合作与学术活动。', year: '发布年份', category: '分类', publication: '关联论文', project: '关联项目', student: '关联学生' },
  en: { title: 'News', description: 'Updates on research, teaching, collaborations, and academic activities.', year: 'Published year', category: 'Category', publication: 'Related publication', project: 'Related project', student: 'Related student' },
})

export class PublicNewsService extends PublicModuleServiceBase {
  private readonly store: PublicContentStore
  constructor(adapter: DatabaseAdapter, translations: TranslationBatchReader, media: MediaService, cache: PublicCacheService, grantSeconds: number, now?: () => Date) {
    super(translations, media, cache, grantSeconds, now); this.store = new PublicContentStore(adapter)
  }

  list(request: PublicListRequest) {
    return this.listResult<PublicNewsListViewModel>('news', request, TAGS, async () => {
      const now = this.generatedAt()
      const snapshot = await this.store.news(request, now)
      const plan = new PublicTranslationPlan()
      const slots = snapshot.items.map(item => ({ title: plan.add('news', item.uid, 'title', item.title), category: plan.add('news', item.uid, 'category', item.category) }))
      const mediaRequests: MediaProjectionRequest[] = snapshot.items.map(item => ({
        objectKey: item.coverKey, module: 'news', recordUid: item.uid, visibility: 'public', purpose: 'cover', referenceRevision: item.updatedAt,
        alt: item.title, fallback: 'placeholder', width: 960, height: 540,
      }))
      const [localized, projected] = await Promise.all([plan.resolve(this.translations, request.locale), this.media.project(mediaRequests, null)])
      if (projected.length !== snapshot.items.length) throw new PublicSiteError('PUBLIC_PROTOCOL', 'News media projection is incomplete')
      const items = snapshot.items.map((item, index) => {
        const title = localized.required(slots[index]!.title, item.title)
        return {
          uid: item.uid, displayNumber: item.displayNumber, slug: item.slug, title, category: localized.text(slots[index]!.category), publishedAt: item.publishedAt,
          publishedLabel: localizedDate(item.publishedAt, request.locale)!, featured: item.featured,
          href: publicRecordPath(request.locale, 'news', item.slug), cover: localizedPublicMedia(projected[index], title, 'image', 'placeholder'),
        }
      })
      const copy = COPY[request.locale]
      const path = publicListPath('news', request)
      return {
        schemaVersion: 1, locale: request.locale, module: 'news', generatedAt: now,
        meta: pageMeta({ locale: request.locale, title: copy.title, description: copy.description, path, alternatePath: publicListPath('news', request, request.locale === 'zh' ? 'en' : 'zh') }),
        query: queryView(request), filters: filterGroups(snapshot.facets, request, { category: copy.category, year: copy.year }),
        totalPublic: snapshot.totalPublic, revision: snapshot.revision,
        pagination: pagination(request, snapshot.total), items,
      }
    })
  }

  detail(locale: SiteLocale, slugInput: string) {
    const slug = safeRecordIdentifier(slugInput)
    return this.detailResult<PublicNewsDetailViewModel>('news', 'news', locale, slug, TAGS, async () => {
      const now = this.generatedAt()
      const item = await this.store.newsDetail(slug, now)
      if (!item) throw new PublicSiteError('PUBLIC_NOT_FOUND', 'Public news item was not found')
      const plan = new PublicTranslationPlan()
      const slots: {
        title: PublicTranslationSlot; category: PublicTranslationSlot; content: PublicTranslationSlot
        relatedPublication: PublicTranslationSlot | null; relatedProject: PublicTranslationSlot | null; relatedStudent: PublicTranslationSlot | null
      } = {
        title: plan.add('news', item.uid, 'title', item.title), category: plan.add('news', item.uid, 'category', item.category),
        content: plan.add('news', item.uid, 'content', item.content),
        relatedPublication: item.relatedPublicationUid && item.relatedPublicationTitle ? plan.add('publications', item.relatedPublicationUid, 'title', item.relatedPublicationTitle) : null,
        relatedProject: item.relatedProjectUid && item.relatedProjectName ? plan.add('projects', item.relatedProjectUid, 'name', item.relatedProjectName) : null,
        relatedStudent: item.relatedStudentUid && item.relatedStudentName ? plan.add('students', item.relatedStudentUid, 'name', item.relatedStudentName, item.relatedStudentNameEn) : null,
      }
      const mediaRequest: MediaProjectionRequest = {
        objectKey: item.coverKey, module: 'news', recordUid: item.uid, visibility: 'public', purpose: 'cover', referenceRevision: item.updatedAt,
        alt: item.title, fallback: 'placeholder', width: 1280, height: 720,
      }
      const [localized, projected] = await Promise.all([plan.resolve(this.translations, locale), this.media.project([mediaRequest], null)])
      const title = localized.required(slots.title, item.title)
      const content = localized.text(slots.content)
      const references = item.contentFormat === 'html' ? richTextMediaReferencesFromHtml(content) : []
      const inlineMedia = await this.media.project(references.map(({ objectKey, kind }, index): MediaProjectionRequest => ({
        objectKey, module: 'news', recordUid: item.uid, visibility: 'public', purpose: kind === 'pdf' ? 'publication_pdf' : 'cover', referenceRevision: `${item.updatedAt}:content:${index}`,
        alt: title, fallback: 'none', width: 1280, height: 1280,
      })), null)
      const mediaUrls = new Map<string, string>()
      const pdfUrls = new Map<string, string>()
      references.forEach(({ objectKey, kind }, index) => {
        const media = inlineMedia[index]
        if (!media?.available) return
        if (kind === 'pdf') pdfUrls.set(objectKey, `/api/v1/public/news/${encodeURIComponent(item.slug)}/pdf?${new URLSearchParams({ key: objectKey })}`)
        else mediaUrls.set(objectKey, media.url)
      })
      const blocks = publicContentBlocks(content, item.contentFormat, mediaUrls, pdfUrls)
      const related: PublicRelatedLink[] = []
      const copy = COPY[locale]
      if (item.relatedPublicationUid && slots.relatedPublication !== null) related.push({ kind: 'publication', label: `${copy.publication}：${localized.required(slots.relatedPublication, item.relatedPublicationTitle!)}`, href: publicRecordPath(locale, 'publications', item.relatedPublicationUid) })
      if (item.relatedProjectUid && slots.relatedProject !== null) related.push({ kind: 'project', label: `${copy.project}：${localized.required(slots.relatedProject, item.relatedProjectName!)}`, href: publicRecordPath(locale, 'projects', item.relatedProjectUid) })
      if (item.relatedStudentUid && slots.relatedStudent !== null) related.push({ kind: 'student', label: `${copy.student}：${localized.required(slots.relatedStudent, item.relatedStudentName!)}`, href: publicRecordPath(locale, 'students', item.relatedStudentUid) })
      const path = publicRecordPath(locale, 'news', item.slug)
      const cover = localizedPublicMedia(projected[0], title, 'image', 'placeholder')
      const description = excerpt(blocks.map(block => block.type === 'list' ? block.items.join(' ') : block.text).join(' '), 220) ?? COPY[locale].description
      return {
        schemaVersion: 1, locale, module: 'news', generatedAt: now,
        meta: pageMeta({ locale, title, description, path, alternatePath: publicRecordPath(locale === 'zh' ? 'en' : 'zh', 'news', item.slug), sectionLabel: copy.title, sectionPath: `/${locale}/news`, image: cover, type: 'article' }),
        item: {
          uid: item.uid, slug: item.slug, title, category: localized.text(slots.category), publishedAt: item.publishedAt,
          publishedLabel: localizedDate(item.publishedAt, locale)!, featured: item.featured, href: path, cover,
          contentFormat: item.contentFormat, blocks, related, commentsEnabled: item.allowComments,
        },
      }
    })
  }
}
