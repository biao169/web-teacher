import type { DatabaseAdapter } from '../../../../db/contracts'
import type { PublicProjectDetailViewModel, PublicProjectListViewModel } from '../../../../shared/contracts/public-content'
import type { SiteLocale } from '../../../../shared/contracts/i18n'
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
import { excerpt, periodLabel, plainText, safeRecordIdentifier } from '../public-values'
import { PublicSiteError } from '../errors'

const TAGS = Object.freeze(['public:projects', 'public:translations'] as const)
const COPY = Object.freeze({
  zh: { title: '科研项目', description: '浏览团队承担的科研项目、基金计划、角色和项目进展。', source: '项目来源', fundName: '基金计划', year: '开始年份', role: '承担角色', status: '项目状态' },
  en: { title: 'Research projects', description: 'Explore funded research, project roles, collaborators, and current progress.', source: 'Source', fundName: 'Funding program', year: 'Start year', role: 'Role', status: 'Status' },
})

export class PublicProjectsService extends PublicModuleServiceBase {
  private readonly store: PublicContentStore
  constructor(adapter: DatabaseAdapter, translations: TranslationBatchReader, media: MediaService, cache: PublicCacheService, grantSeconds: number, now?: () => Date) {
    super(translations, media, cache, grantSeconds, now); this.store = new PublicContentStore(adapter)
  }

  list(request: PublicListRequest) {
    return this.listResult<PublicProjectListViewModel>('projects', request, TAGS, async () => {
      const snapshot = await this.store.projects(request)
      const plan = new PublicTranslationPlan()
      const slots = snapshot.items.map(item => ({
        name: plan.add('projects', item.uid, 'name', item.name), source: plan.add('projects', item.uid, 'source', item.source),
        fundName: plan.add('projects', item.uid, 'fund_name', item.fundName), role: plan.add('projects', item.uid, 'project_role', item.projectRole),
        principal: plan.add('projects', item.uid, 'principal', item.principal), status: plan.add('projects', item.uid, 'status', item.status),
      }))
      const localized = await plan.resolve(this.translations, request.locale)
      const items = snapshot.items.map((item, index) => {
        const slot = slots[index]!
        return {
          uid: item.uid, displayNumber: item.displayNumber, name: localized.required(slot.name, item.name), source: localized.text(slot.source), fundName: localized.text(slot.fundName),
          projectNumber: item.projectNumber, role: localized.text(slot.role), principal: localized.text(slot.principal), startDate: item.startDate, endDate: item.endDate,
          periodLabel: periodLabel(item.startDate, item.endDate, request.locale), status: localized.text(slot.status),
          summary: null, amount: item.amount, featured: item.featured, href: publicRecordPath(request.locale, 'projects', item.uid),
        }
      })
      const copy = COPY[request.locale]
      const path = publicListPath('projects', request)
      return {
        schemaVersion: 1, locale: request.locale, module: 'projects', generatedAt: this.generatedAt(),
        meta: pageMeta({ locale: request.locale, title: copy.title, description: copy.description, path, alternatePath: publicListPath('projects', request, request.locale === 'zh' ? 'en' : 'zh') }),
        query: queryView(request), filters: filterGroups(snapshot.facets, request, { year: copy.year, source: copy.source, fundName: copy.fundName, role: copy.role, status: copy.status }),
        totalPublic: snapshot.totalPublic, revision: snapshot.revision,
        pagination: pagination(request, snapshot.total), items,
      }
    })
  }

  detail(locale: SiteLocale, uidInput: string) {
    const uid = safeRecordIdentifier(uidInput)
    return this.detailResult<PublicProjectDetailViewModel>('projects', 'projects', locale, uid, TAGS, async () => {
      const item = await this.store.project(uid)
      if (!item) throw new PublicSiteError('PUBLIC_NOT_FOUND', 'Public project was not found')
      const plan = new PublicTranslationPlan()
      const slots = {
        name: plan.add('projects', item.uid, 'name', item.name), source: plan.add('projects', item.uid, 'source', item.source),
        fundName: plan.add('projects', item.uid, 'fund_name', item.fundName), role: plan.add('projects', item.uid, 'project_role', item.projectRole),
        principal: plan.add('projects', item.uid, 'principal', item.principal), members: plan.add('projects', item.uid, 'members', item.members),
        status: plan.add('projects', item.uid, 'status', item.status), summary: plan.add('projects', item.uid, 'summary', item.summary),
      }
      const localized = await plan.resolve(this.translations, locale)
      const name = localized.required(slots.name, item.name)
      const summary = plainText(localized.text(slots.summary), 64_000)
      const path = publicRecordPath(locale, 'projects', item.uid)
      return {
        schemaVersion: 1, locale, module: 'projects', generatedAt: this.generatedAt(),
        meta: pageMeta({ locale, title: name, description: excerpt(summary, 200) ?? COPY[locale].description, path, alternatePath: publicRecordPath(locale === 'zh' ? 'en' : 'zh', 'projects', item.uid), sectionLabel: COPY[locale].title, sectionPath: `/${locale}/projects` }),
        item: {
          uid: item.uid, name, source: localized.text(slots.source), fundName: localized.text(slots.fundName), role: localized.text(slots.role),
          principal: localized.text(slots.principal), startDate: item.startDate, endDate: item.endDate, periodLabel: periodLabel(item.startDate, item.endDate, locale),
          status: localized.text(slots.status), summary, featured: item.featured, href: path,
          projectNumber: item.projectNumber, members: localized.text(slots.members), amount: item.amount,
        },
      }
    })
  }
}
