import { publicRecordPath } from '../../../../shared/utils/public-path'
import { PublicSiteError } from '../errors'
import type { DatabaseAdapter } from '../../../../db/contracts'
import type { PublicResearchViewModel, PublicResearchDetailViewModel } from '../../../../shared/contracts/public-content'
import type { SiteLocale } from '../../../../shared/contracts/i18n'
import type { PublicCacheService } from '../../../cache/public-cache'
import type { TranslationBatchReader } from '../../i18n/translation-reader'
import type { MediaService } from '../../media/media-service'
import { PublicContentStore } from '../public-content-store'
import { PublicTranslationPlan } from '../public-localization'
import { PublicModuleServiceBase } from '../public-module-base'
import { filterGroups, pageMeta, pagination, queryView } from '../public-page'
import { publicListPath, type PublicListRequest } from '../public-query'
import { excerpt, plainText, safeRecordIdentifier } from '../public-values'

const TAGS = Object.freeze(['public:research', 'public:translations'] as const)
const COPY = Object.freeze({
  zh: { title: '研究方向', description: '团队持续关注的研究问题、方法与应用领域。' },
  en: { title: 'Research interests', description: 'Research questions, methods, and application areas pursued by the team.' },
})

export class PublicResearchService extends PublicModuleServiceBase {
  private readonly store: PublicContentStore
  constructor(adapter: DatabaseAdapter, translations: TranslationBatchReader, media: MediaService, cache: PublicCacheService, grantSeconds: number, now?: () => Date) {
    super(translations, media, cache, grantSeconds, now); this.store = new PublicContentStore(adapter)
  }

  list(input: SiteLocale | PublicListRequest) {
    const request: PublicListRequest = typeof input === 'string' ? { locale: input, page: 1, pageSize: 12, search: null, filters: {} } : input
    const locale = request.locale
    return this.listResult<PublicResearchViewModel>('research', request, TAGS, async () => {
      const snapshot = await this.store.research(request)
      const records = snapshot.items
      const plan = new PublicTranslationPlan()
      const slots = records.map(item => ({ name: plan.add('research_interests', item.uid, 'name', item.name, item.nameEn), description: plan.add('research_interests', item.uid, 'description', item.description) }))
      const localized = await plan.resolve(this.translations, locale)
      const items = records.map((item, index) => ({
        uid: item.uid, displayNumber: item.displayNumber, href: publicRecordPath(locale, 'research', item.uid), name: localized.required(slots[index]!.name, item.name), description: request.selectedUids ? plainText(localized.text(slots[index]!.description), 64_000) : excerpt(localized.text(slots[index]!.description)),
      }))
      const copy = COPY[locale]
      return {
        schemaVersion: 1, locale, module: 'research', generatedAt: this.generatedAt(),
        meta: pageMeta({ locale, title: copy.title, description: request.selectedUids ? copy.description : excerpt(items.map(item => item.description).filter(Boolean).join(' '), 220) ?? copy.description, path: publicListPath('research', request), alternatePath: publicListPath('research', request, locale === 'zh' ? 'en' : 'zh') }),
        items, count: snapshot.total, totalPublic: snapshot.totalPublic, revision: snapshot.revision,
        query: queryView(request), filters: filterGroups(snapshot.facets, request, {}), pagination: pagination(request, snapshot.total),
      }
    })
  }
  detail(locale: SiteLocale, uidInput: string) {
    const uid = safeRecordIdentifier(uidInput)
    return this.detailResult<PublicResearchDetailViewModel>('research', 'research_interests', locale, uid, TAGS, async () => {
      const record = await this.store.researchDetail(uid)
      if (!record) throw new PublicSiteError('PUBLIC_NOT_FOUND', 'Public research topic was not found')
      const plan = new PublicTranslationPlan()
      const nameSlot = plan.add('research_interests', uid, 'name', record.name, record.nameEn)
      const bodySlot = plan.add('research_interests', uid, 'description', record.description)
      const localized = await plan.resolve(this.translations, locale)
      const name = localized.required(nameSlot, record.name), description = plainText(localized.text(bodySlot), 64000)
      const path = publicRecordPath(locale, 'research', uid)
      return { schemaVersion: 1, locale, module: 'research', generatedAt: this.generatedAt(),
        meta: pageMeta({ locale, title: name, description: excerpt(description, 180) ?? COPY[locale].description, path, alternatePath: publicRecordPath(locale === 'zh' ? 'en' : 'zh', 'research', uid), sectionLabel: COPY[locale].title, sectionPath: `/${locale}/research` }),
        item: { uid, name, description, href: path },
      }
    })
  }

}
