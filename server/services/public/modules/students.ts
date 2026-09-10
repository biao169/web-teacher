import type { DatabaseAdapter } from '../../../../db/contracts'
import { splitPublicCategories } from '../../../../shared/utils/public-categories'
import type { PublicStudentDetailViewModel, PublicStudentListViewModel } from '../../../../shared/contracts/public-content'
import type { SiteLocale } from '../../../../shared/contracts/i18n'
import type { MediaProjectionRequest } from '../../../../shared/contracts/media'
import { publicRecordPath } from '../../../../shared/utils/public-path'
import type { PublicCacheService } from '../../../cache/public-cache'
import type { TranslationBatchReader } from '../../i18n/translation-reader'
import type { MediaService } from '../../media/media-service'
import { PublicContentStore, type StudentCategoryRecord } from '../public-content-store'
import { PublicTranslationPlan, type PublicTranslationSlot, type PublicTranslations } from '../public-localization'
import { PublicModuleServiceBase } from '../public-module-base'
import { filterGroups, pageMeta, pagination, queryView } from '../public-page'
import type { PublicListRequest } from '../public-query'
import { publicListPath } from '../public-query'
import { boundedList, excerpt, localizedPublicMedia, plainText, safeExternalUrl, safeMailAddress, safeRecordIdentifier } from '../public-values'
import { PublicSiteError } from '../errors'

const TAGS = Object.freeze(['public:students', 'public:translations', 'public:media', 'public:media-policy'] as const)
const COPY = Object.freeze({
  zh: { title: '学生', description: '按培养层次、年级、研究方向和状态浏览团队学生。', category: '分类', degree: '培养层次', grade: '年级', direction: '研究方向', status: '状态', other: '其他' },
  en: { title: 'Students', description: 'Browse students by category, degree, cohort, research direction, and status.', category: 'Category', degree: 'Degree', grade: 'Cohort', direction: 'Research direction', status: 'Status', other: 'Other' },
})

type LocalizedCategory = { key: string; label: string; keywords: string[]; displayOrder: number }

function categoryPlan(plan: PublicTranslationPlan, categories: readonly StudentCategoryRecord[]): Array<{ record: StudentCategoryRecord; label: PublicTranslationSlot }> {
  return categories.map(record => ({ record, label: plan.add('student_category_displays', record.uid, 'label', record.label, record.labelEn) }))
}
function localizedCategories(values: readonly { record: StudentCategoryRecord; label: PublicTranslationSlot }[], localized: PublicTranslations): LocalizedCategory[] {
  return values.map(({ record, label }) => ({
    key: record.key, label: localized.required(label, record.label), keywords: boundedList(record.keywords, 100, 256), displayOrder: record.displayOrder,
  })).sort((a, b) => a.displayOrder - b.displayOrder || a.key.localeCompare(b.key))
}
function categoryFor(value: string | null, rules: readonly LocalizedCategory[], fallback: string): { key: string | null; label: string | null } {
  if (!value?.trim()) return { key: null, label: null }
  const normalized = value.trim().normalize('NFC').toLocaleLowerCase('und')
  const exact = rules.find(rule => rule.key.toLocaleLowerCase('und') === normalized)
    ?? rules.find(rule => rule.keywords.some(item => item.toLocaleLowerCase('und') === normalized))
  if (exact) return { key: exact.key, label: exact.label }
  const candidates = rules.flatMap(rule => rule.keywords.map(keyword => ({
    rule,
    keyword: keyword.trim().normalize('NFC').toLocaleLowerCase('und'),
  }))).filter(candidate => Array.from(candidate.keyword).length >= 2
    && (normalized.includes(candidate.keyword) || candidate.keyword.includes(normalized)))
    .sort((left, right) => Array.from(right.keyword).length - Array.from(left.keyword).length
      || left.rule.displayOrder - right.rule.displayOrder
      || left.rule.key.localeCompare(right.rule.key))
  const matched = candidates[0]?.rule
  return matched ? { key: matched.key, label: matched.label } : { key: value, label: value || fallback }
}

export class PublicStudentsService extends PublicModuleServiceBase {
  private readonly store: PublicContentStore
  constructor(adapter: DatabaseAdapter, translations: TranslationBatchReader, media: MediaService, cache: PublicCacheService, grantSeconds: number, now?: () => Date) {
    super(translations, media, cache, grantSeconds, now); this.store = new PublicContentStore(adapter)
  }

  list(request: PublicListRequest) {
    return this.listResult<PublicStudentListViewModel>('students', request, TAGS, async () => {
      const snapshot = await this.store.students(request)
      const plan = new PublicTranslationPlan()
      const slots = snapshot.items.map(item => ({
        name: plan.add('students', item.uid, 'name', item.name, item.nameEn), degree: plan.add('students', item.uid, 'degree', item.degree),
        grade: plan.add('students', item.uid, 'grade', item.grade), direction: plan.add('students', item.uid, 'direction', item.direction),
        status: plan.add('students', item.uid, 'status', item.status), biography: plan.add('students', item.uid, 'bio', item.biography),
      }))
      const categorySlots = categoryPlan(plan, snapshot.categories)
      const mediaRequests: MediaProjectionRequest[] = snapshot.items.map(item => ({
        objectKey: item.avatarKey, module: 'students', recordUid: item.uid, visibility: 'public', purpose: 'avatar',
        referenceRevision: item.updatedAt, alt: item.name, fallback: 'initials', width: 480, height: 480,
      }))
      const [localized, projected] = await Promise.all([plan.resolve(this.translations, request.locale), this.media.project(mediaRequests, null)])
      if (projected.length !== snapshot.items.length) throw new PublicSiteError('PUBLIC_PROTOCOL', 'Student media projection is incomplete')
      const rules = localizedCategories(categorySlots, localized)
      const copy = COPY[request.locale]
      const items = snapshot.items.map((item, index) => {
        const slot = slots[index]!
        const name = localized.required(slot.name, item.name)
        const categories = splitPublicCategories(item.category).map(value => categoryFor(value, rules, copy.other))
        const category = { key: [...new Set(categories.map(value => value.key).filter(Boolean))].join(';') || null, label: [...new Set(categories.map(value => value.label).filter(Boolean))].join('；') || null }
        return {
          uid: item.uid, displayNumber: item.displayNumber, name, degree: localized.text(slot.degree), category: category.label, categoryKey: category.key,
          grade: localized.text(slot.grade), direction: localized.text(slot.direction), status: localized.text(slot.status),
          biography: request.selectedUids ? plainText(localized.text(slot.biography)) : excerpt(localized.text(slot.biography)), featured: item.featured, href: publicRecordPath(request.locale, 'students', item.uid),
          avatar: localizedPublicMedia(projected[index], name, 'image', 'initials'),
        }
      })
      const categoryLabels = new Map(rules.map(rule => [rule.key, rule.label]))
      const path = publicListPath('students', request)
      return {
        schemaVersion: 1, locale: request.locale, module: 'students', generatedAt: this.generatedAt(),
        meta: pageMeta({ locale: request.locale, title: copy.title, description: copy.description, path, alternatePath: publicListPath('students', request, request.locale === 'zh' ? 'en' : 'zh') }),
        query: queryView(request),
        filters: filterGroups(snapshot.facets, request, { category: copy.category, degree: copy.degree, grade: copy.grade, direction: copy.direction, status: copy.status },
          (key, value) => key === 'category' ? categoryLabels.get(value) ?? categoryFor(value, rules, copy.other).label ?? value : value),
        totalPublic: snapshot.totalPublic, revision: snapshot.revision,
        pagination: pagination(request, snapshot.total), items, categories: rules.map(rule => ({ key: rule.key, label: rule.label })),
      }
    })
  }

  detail(locale: SiteLocale, uidInput: string) {
    const uid = safeRecordIdentifier(uidInput)
    return this.detailResult<PublicStudentDetailViewModel>('students', 'students', locale, uid, TAGS, async () => {
      const snapshot = await this.store.student(uid)
      const item = snapshot.item
      if (!item) throw new PublicSiteError('PUBLIC_NOT_FOUND', 'Public student was not found')
      const plan = new PublicTranslationPlan()
      const slots = {
        name: plan.add('students', item.uid, 'name', item.name, item.nameEn), degree: plan.add('students', item.uid, 'degree', item.degree),
        grade: plan.add('students', item.uid, 'grade', item.grade), direction: plan.add('students', item.uid, 'direction', item.direction),
        status: plan.add('students', item.uid, 'status', item.status), biography: plan.add('students', item.uid, 'bio', item.biography),
        destination: plan.add('students', item.uid, 'destination', item.destination), awards: plan.add('students', item.uid, 'awards', item.awards),
      }
      const categorySlots = categoryPlan(plan, snapshot.categories)
      const mediaRequest: MediaProjectionRequest = {
        objectKey: item.avatarKey, module: 'students', recordUid: item.uid, visibility: 'public', purpose: 'avatar',
        referenceRevision: item.updatedAt, alt: item.name, fallback: 'initials', width: 640, height: 640,
      }
      const [localized, projected] = await Promise.all([plan.resolve(this.translations, locale), this.media.project([mediaRequest], null)])
      const name = localized.required(slots.name, item.name)
      const rules = localizedCategories(categorySlots, localized)
      const category = categoryFor(item.category, rules, COPY[locale].other)
      const biography = plainText(localized.text(slots.biography), 64_000)
      const path = publicRecordPath(locale, 'students', item.uid)
      const avatar = localizedPublicMedia(projected[0], name, 'image', 'initials')
      return {
        schemaVersion: 1, locale, module: 'students', generatedAt: this.generatedAt(),
        meta: pageMeta({ locale, title: name, description: excerpt(biography, 200) ?? COPY[locale].description, path, alternatePath: publicRecordPath(locale === 'zh' ? 'en' : 'zh', 'students', item.uid), sectionLabel: COPY[locale].title, sectionPath: `/${locale}/students`, image: avatar, type: 'profile' }),
        item: {
          uid: item.uid, name, degree: localized.text(slots.degree), category: category.label, categoryKey: category.key,
          grade: localized.text(slots.grade), direction: localized.text(slots.direction), status: localized.text(slots.status),
          biography, featured: item.featured, href: path, avatar, studentId: item.studentId, enrollmentDate: item.enrollmentDate,
          graduationDate: item.graduationDate, destination: plainText(localized.text(slots.destination), 32_000), awards: plainText(localized.text(slots.awards), 64_000),
          email: safeMailAddress(item.publicEmail), homepage: safeExternalUrl(item.homepage),
        },
      }
    })
  }
}
