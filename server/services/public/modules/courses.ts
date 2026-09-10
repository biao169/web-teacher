import type { DatabaseAdapter } from '../../../../db/contracts'
import type { PublicCourseDetailViewModel, PublicCourseListViewModel } from '../../../../shared/contracts/public-content'
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
import { excerpt, localizedPublicMedia, plainText, safeRecordIdentifier } from '../public-values'
import { PublicSiteError } from '../errors'

const TAGS = Object.freeze(['public:courses', 'public:translations', 'public:media', 'public:media-policy'] as const)
const COPY = Object.freeze({
  zh: { title: '课程教学', description: '浏览课程学期、授课对象、教学内容和公开材料。', semester: '学期', audience: '授课对象' },
  en: { title: 'Teaching', description: 'Browse courses, semesters, audiences, summaries, and public teaching materials.', semester: 'Semester', audience: 'Audience' },
})

export class PublicCoursesService extends PublicModuleServiceBase {
  private readonly store: PublicContentStore
  constructor(adapter: DatabaseAdapter, translations: TranslationBatchReader, media: MediaService, cache: PublicCacheService, grantSeconds: number, now?: () => Date) {
    super(translations, media, cache, grantSeconds, now); this.store = new PublicContentStore(adapter)
  }

  list(request: PublicListRequest) {
    return this.listResult<PublicCourseListViewModel>('courses', request, TAGS, async () => {
      const snapshot = await this.store.courses(request)
      const plan = new PublicTranslationPlan()
      const slots = snapshot.items.map(item => ({
        name: plan.add('courses', item.uid, 'name', item.name), semester: plan.add('courses', item.uid, 'semester', item.semester),
        audience: plan.add('courses', item.uid, 'audience', item.audience), summary: plan.add('courses', item.uid, 'summary', item.summary),
      }))
      const localized = await plan.resolve(this.translations, request.locale)
      const items = snapshot.items.map((item, index) => ({
        uid: item.uid, displayNumber: item.displayNumber, name: localized.required(slots[index]!.name, item.name), semester: localized.text(slots[index]!.semester),
        audience: localized.text(slots[index]!.audience), summary: request.selectedUids ? plainText(localized.text(slots[index]!.summary)) : excerpt(localized.text(slots[index]!.summary)), featured: item.featured,
        href: publicRecordPath(request.locale, 'courses', item.uid),
      }))
      const copy = COPY[request.locale]
      const path = publicListPath('courses', request)
      return {
        schemaVersion: 1, locale: request.locale, module: 'courses', generatedAt: this.generatedAt(),
        meta: pageMeta({ locale: request.locale, title: copy.title, description: copy.description, path, alternatePath: publicListPath('courses', request, request.locale === 'zh' ? 'en' : 'zh') }),
        query: queryView(request), filters: filterGroups(snapshot.facets, request, { semester: copy.semester, audience: copy.audience }),
        totalPublic: snapshot.totalPublic, revision: snapshot.revision,
        pagination: pagination(request, snapshot.total), items,
      }
    })
  }

  detail(locale: SiteLocale, uidInput: string) {
    const uid = safeRecordIdentifier(uidInput)
    return this.detailResult<PublicCourseDetailViewModel>('courses', 'courses', locale, uid, TAGS, async () => {
      const item = await this.store.course(uid)
      if (!item) throw new PublicSiteError('PUBLIC_NOT_FOUND', 'Public course was not found')
      const plan = new PublicTranslationPlan()
      const slots = {
        name: plan.add('courses', item.uid, 'name', item.name), semester: plan.add('courses', item.uid, 'semester', item.semester),
        audience: plan.add('courses', item.uid, 'audience', item.audience), summary: plan.add('courses', item.uid, 'summary', item.summary),
        references: plan.add('courses', item.uid, 'references_text', item.referencesText),
      }
      const mediaRequests: MediaProjectionRequest[] = [
        { objectKey: item.syllabusKey, module: 'courses', recordUid: item.uid, visibility: 'public', purpose: 'syllabus', referenceRevision: item.updatedAt, alt: item.name, title: item.name, fallback: 'none', disposition: 'inline', allowDownload: true },
        { objectKey: item.materialKey, module: 'courses', recordUid: item.uid, visibility: 'public', secondaryVisibility: item.materialVisibility, purpose: 'course_material', referenceRevision: item.updatedAt, alt: item.name, title: item.name, fallback: 'none', disposition: 'attachment', allowDownload: true },
      ]
      const [localized, projected] = await Promise.all([plan.resolve(this.translations, locale), this.media.project(mediaRequests, null)])
      const name = localized.required(slots.name, item.name)
      const summary = plainText(localized.text(slots.summary), 64_000)
      const path = publicRecordPath(locale, 'courses', item.uid)
      return {
        schemaVersion: 1, locale, module: 'courses', generatedAt: this.generatedAt(),
        meta: pageMeta({ locale, title: name, description: excerpt(summary, 200) ?? COPY[locale].description, path, alternatePath: publicRecordPath(locale === 'zh' ? 'en' : 'zh', 'courses', item.uid), sectionLabel: COPY[locale].title, sectionPath: `/${locale}/courses` }),
        item: {
          uid: item.uid, name, semester: localized.text(slots.semester), audience: localized.text(slots.audience), summary,
          featured: item.featured, href: path, references: plainText(localized.text(slots.references), 128_000),
          syllabus: localizedPublicMedia(projected[0], name, 'file', 'none'), material: localizedPublicMedia(projected[1], name, 'file', 'none'),
        },
      }
    })
  }
}
