import { localizedProfileLinks } from '../public-profile-links'
import type { DatabaseAdapter } from '../../../../db/contracts'
import type { PublicProfileDetailViewModel, PublicTeamListViewModel } from '../../../../shared/contracts/public-content'
import type { MediaProjectionRequest } from '../../../../shared/contracts/media'
import type { SiteLocale } from '../../../../shared/contracts/i18n'
import { PUBLIC_PROFILE_BIOGRAPHY_MAX_BYTES } from '../../../../shared/contracts/public-site'
import { publicRecordPath } from '../../../../shared/utils/public-path'
import { filterGroups, pageMeta, pagination, queryView } from '../public-page'
import type { PublicListRequest } from '../public-query'
import { publicListPath } from '../public-query'
import { PublicContentStore } from '../public-content-store'
import { PublicTranslationPlan } from '../public-localization'
import { PublicModuleServiceBase } from '../public-module-base'
import { excerpt, localizedPublicMedia, plainText, safeMailAddress, safeRecordIdentifier } from '../public-values'
import { PublicSiteError } from '../errors'
import type { PublicCacheService } from '../../../cache/public-cache'
import type { TranslationBatchReader } from '../../i18n/translation-reader'
import type { MediaService } from '../../media/media-service'

const TAGS = Object.freeze(['public:team', 'public:profiles', 'public:translations', 'public:media', 'public:media-policy'] as const)
const COPY = Object.freeze({
  zh: { title: '团队与教师', description: '了解团队成员的研究背景、学术经历与合作方向。', role: '角色', organization: '单位' },
  en: { title: 'Team and faculty', description: 'Meet the people behind the research, teaching, and academic collaborations.', role: 'Role', organization: 'Organization' },
})

export class PublicTeamService extends PublicModuleServiceBase {
  private readonly store: PublicContentStore

  constructor(adapter: DatabaseAdapter, translations: TranslationBatchReader, media: MediaService, cache: PublicCacheService, publicMediaGrantSeconds: number, now?: () => Date) {
    super(translations, media, cache, publicMediaGrantSeconds, now)
    this.store = new PublicContentStore(adapter)
  }

  list(request: PublicListRequest) {
    return this.listResult<PublicTeamListViewModel>('team', request, TAGS, async () => {
      const snapshot = await this.store.teamList(request)
      const plan = new PublicTranslationPlan()
      const slots = snapshot.items.map(item => ({
        name: plan.add('profiles', item.uid, 'name', item.name, item.nameEn),
        role: plan.add('profiles', item.uid, 'role', item.role),
        title: plan.add('profiles', item.uid, 'title', item.title),
        organization: plan.add('profiles', item.uid, 'organization', item.organization),
        lab: plan.add('profiles', item.uid, 'lab', item.lab),
        biography: plan.add('profiles', item.uid, 'bio', item.biography, item.biographyEn),
      }))
      const mediaRequests: MediaProjectionRequest[] = snapshot.items.map(item => ({
        objectKey: item.avatarKey, module: 'profiles', recordUid: item.uid, visibility: 'public', purpose: 'avatar',
        referenceRevision: item.updatedAt, alt: item.name, fallback: 'initials', width: 480, height: 480,
      }))
      // Eight profiles × six fields keeps full bilingual biographies below the reader's 8 MiB batch budget.
      const [localized, projected] = await Promise.all([plan.resolve(this.translations, request.locale, 48), this.media.project(mediaRequests, null)])
      if (projected.length !== snapshot.items.length) throw new PublicSiteError('PUBLIC_PROTOCOL', 'Team media projection is incomplete')
      const items = snapshot.items.map((item, index) => {
        const slot = slots[index]!
        const name = localized.required(slot.name, item.name)
        return {
          uid: item.uid, displayNumber: item.displayNumber,
          name,
          role: localized.text(slot.role),
          title: localized.text(slot.title),
          organization: localized.text(slot.organization),
          lab: localized.text(slot.lab),
          biography: excerpt(localized.text(slot.biography), 220, PUBLIC_PROFILE_BIOGRAPHY_MAX_BYTES),
          href: publicRecordPath(request.locale, 'profiles', item.uid),
          avatar: localizedPublicMedia(projected[index], name, 'image', 'initials'),
        }
      })
      const copy = COPY[request.locale]
      const path = publicListPath('team', request)
      return {
        schemaVersion: 1,
        locale: request.locale,
        module: 'team',
        generatedAt: this.generatedAt(),
        meta: pageMeta({ locale: request.locale, title: copy.title, description: copy.description, path, alternatePath: publicListPath('team', request, request.locale === 'zh' ? 'en' : 'zh') }),
        query: queryView(request),
        filters: filterGroups(snapshot.facets, request, { role: copy.role, organization: copy.organization }),
        totalPublic: snapshot.totalPublic, revision: snapshot.revision,
        pagination: pagination(request, snapshot.total),
        items,
      }
    })
  }

  detail(locale: SiteLocale, uidInput: string) {
    const uid = safeRecordIdentifier(uidInput)
    return this.detailResult<PublicProfileDetailViewModel>('team', 'profiles', locale, uid, TAGS, async () => {
      const item = await this.store.profile(uid)
      if (!item) throw new PublicSiteError('PUBLIC_NOT_FOUND', 'Public profile was not found')
      const plan = new PublicTranslationPlan()
      const slots = {
        name: plan.add('profiles', item.uid, 'name', item.name, item.nameEn), role: plan.add('profiles', item.uid, 'role', item.role),
        title: plan.add('profiles', item.uid, 'title', item.title), organization: plan.add('profiles', item.uid, 'organization', item.organization),
        lab: plan.add('profiles', item.uid, 'lab', item.lab), biography: plan.add('profiles', item.uid, 'bio', item.biography, item.biographyEn),
        education: plan.add('profiles', item.uid, 'education', item.education), experience: plan.add('profiles', item.uid, 'experience', item.experience),
        recruiting: plan.add('profiles', item.uid, 'recruiting', item.recruiting), office: plan.add('profiles', item.uid, 'office', item.office),
      }
      const request: MediaProjectionRequest = {
        objectKey: item.avatarKey, module: 'profiles', recordUid: item.uid, visibility: 'public', purpose: 'avatar',
        referenceRevision: item.updatedAt, alt: item.name, fallback: 'initials', width: 640, height: 640,
      }
      const [localized, projected] = await Promise.all([plan.resolve(this.translations, locale), this.media.project([request], null)])
      const name = localized.required(slots.name, item.name)
      const links = localizedProfileLinks(item.links, locale)
      const email = safeMailAddress(item.email)
      const phone = plainText(item.phone, 512)
      const office = plainText(localized.text(slots.office), 2_048)
      const contact = email || phone || office ? { email, phone, office } : null
      const path = publicRecordPath(locale, 'profiles', item.uid)
      const listPath = `/${locale}/team`
      const description = excerpt(localized.text(slots.biography), 180, PUBLIC_PROFILE_BIOGRAPHY_MAX_BYTES) ?? (
        [localized.text(slots.title), localized.text(slots.organization)].filter(Boolean).join(' · ')
        || (locale === 'zh' ? `${name}的团队成员资料。` : `Academic profile for ${name}.`)
      )
      const avatar = localizedPublicMedia(projected[0], name, 'image', 'initials')
      return {
        schemaVersion: 1, locale, module: 'team', generatedAt: this.generatedAt(),
        meta: pageMeta({ locale, title: name, description, path, alternatePath: publicRecordPath(locale === 'zh' ? 'en' : 'zh', 'profiles', item.uid), sectionLabel: COPY[locale].title, sectionPath: listPath, image: avatar, type: 'profile' }),
        item: {
          uid: item.uid, name, role: localized.text(slots.role), title: localized.text(slots.title), organization: localized.text(slots.organization),
          lab: localized.text(slots.lab), biography: plainText(localized.text(slots.biography), PUBLIC_PROFILE_BIOGRAPHY_MAX_BYTES), href: path, avatar,
          education: plainText(localized.text(slots.education)), experience: plainText(localized.text(slots.experience)),
          recruiting: plainText(localized.text(slots.recruiting)), contact, links,
        },
      }
    })
  }
}
