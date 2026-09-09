import type { DatabaseAdapter } from '../../../../db/contracts'
import type { PublicPatentDetailViewModel, PublicPatentListViewModel } from '../../../../shared/contracts/public-content'
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

const TAGS = Object.freeze(['public:patents', 'public:translations', 'public:media', 'public:media-policy'] as const)
const COPY = Object.freeze({
  zh: { title: '专利与软件著作', description: '查看专利、软件著作及其申请、授权和法律状态。', year: '年份', country: '国家或地区', type: '类型', status: '法律状态' },
  en: { title: 'Patents and software works', description: 'Browse patents and registered software with application, grant, and legal-status information.', year: 'Year', country: 'Country or region', type: 'Type', status: 'Legal status' },
})

export class PublicPatentsService extends PublicModuleServiceBase {
  private readonly store: PublicContentStore
  constructor(adapter: DatabaseAdapter, translations: TranslationBatchReader, media: MediaService, cache: PublicCacheService, grantSeconds: number, now?: () => Date) {
    super(translations, media, cache, grantSeconds, now); this.store = new PublicContentStore(adapter)
  }

  list(request: PublicListRequest) {
    return this.listResult<PublicPatentListViewModel>('patents', request, TAGS, async () => {
      const snapshot = await this.store.patents(request)
      const plan = new PublicTranslationPlan()
      const slots = snapshot.items.map(item => ({
        name: plan.add('patents', item.uid, 'name', item.name), country: plan.add('patents', item.uid, 'country', item.country),
        type: plan.add('patents', item.uid, 'patent_type', item.patentType), inventors: plan.add('patents', item.uid, 'inventors', item.inventors),
        status: plan.add('patents', item.uid, 'legal_status', item.legalStatus),
      }))
      const localized = await plan.resolve(this.translations, request.locale)
      const items = snapshot.items.map((item, index) => {
        const slot = slots[index]!
        return {
          uid: item.uid, displayNumber: item.displayNumber, name: localized.required(slot.name, item.name), country: localized.text(slot.country), patentType: localized.text(slot.type),
          applicationNumber: item.applicationNumber, grantNumber: item.grantNumber, applicationDate: item.applicationDate, grantDate: item.grantDate,
          inventors: localized.text(slot.inventors), legalStatus: localized.text(slot.status), featured: item.featured,
          href: publicRecordPath(request.locale, 'patents', item.uid),
        }
      })
      const copy = COPY[request.locale]
      const path = publicListPath('patents', request)
      return {
        schemaVersion: 1, locale: request.locale, module: 'patents', generatedAt: this.generatedAt(),
        meta: pageMeta({ locale: request.locale, title: copy.title, description: copy.description, path, alternatePath: publicListPath('patents', request, request.locale === 'zh' ? 'en' : 'zh') }),
        query: queryView(request), filters: filterGroups(snapshot.facets, request, { year: copy.year, country: copy.country, patentType: copy.type, legalStatus: copy.status }),
        totalPublic: snapshot.totalPublic, revision: snapshot.revision,
        pagination: pagination(request, snapshot.total), items,
      }
    })
  }

  detail(locale: SiteLocale, uidInput: string) {
    const uid = safeRecordIdentifier(uidInput)
    return this.detailResult<PublicPatentDetailViewModel>('patents', 'patents', locale, uid, TAGS, async () => {
      const item = await this.store.patent(uid)
      if (!item) throw new PublicSiteError('PUBLIC_NOT_FOUND', 'Public patent was not found')
      const plan = new PublicTranslationPlan()
      const slots = {
        name: plan.add('patents', item.uid, 'name', item.name), country: plan.add('patents', item.uid, 'country', item.country),
        type: plan.add('patents', item.uid, 'patent_type', item.patentType), inventors: plan.add('patents', item.uid, 'inventors', item.inventors),
        owner: plan.add('patents', item.uid, 'owner', item.owner), status: plan.add('patents', item.uid, 'legal_status', item.legalStatus),
        summary: plan.add('patents', item.uid, 'summary', item.summary),
      }
      const mediaRequest: MediaProjectionRequest = {
        objectKey: item.certificateKey, module: 'patents', recordUid: item.uid, visibility: 'public', purpose: 'certificate',
        referenceRevision: item.updatedAt, alt: item.name, title: item.name, fallback: 'none', disposition: 'inline', allowDownload: true,
      }
      const [localized, projected] = await Promise.all([plan.resolve(this.translations, locale), this.media.project([mediaRequest], null)])
      const name = localized.required(slots.name, item.name)
      const summary = plainText(localized.text(slots.summary), 64_000)
      const path = publicRecordPath(locale, 'patents', item.uid)
      const certificate = localizedPublicMedia(projected[0], name, 'file', 'none')
      return {
        schemaVersion: 1, locale, module: 'patents', generatedAt: this.generatedAt(),
        meta: pageMeta({ locale, title: name, description: excerpt(summary, 200) ?? COPY[locale].description, path, alternatePath: publicRecordPath(locale === 'zh' ? 'en' : 'zh', 'patents', item.uid), sectionLabel: COPY[locale].title, sectionPath: `/${locale}/patents` }),
        item: {
          uid: item.uid, name, country: localized.text(slots.country), patentType: localized.text(slots.type), applicationNumber: item.applicationNumber,
          grantNumber: item.grantNumber, applicationDate: item.applicationDate, grantDate: item.grantDate, inventors: localized.text(slots.inventors),
          legalStatus: localized.text(slots.status), featured: item.featured, href: path, owner: localized.text(slots.owner), summary, certificate,
        },
      }
    })
  }
}
