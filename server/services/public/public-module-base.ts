import type { PublicPageMeta } from '../../../shared/contracts/public-content'
import type { PublicListRequest } from './public-query'
import type { PublicCacheService } from '../../cache/public-cache'
import type { TranslationBatchReader } from '../i18n/translation-reader'
import type { MediaService } from '../media/media-service'
import type { AuthModule } from '../../../shared/enums/auth'
import { cacheRecordTag } from '../../cache/invalidation-map'
import { freshPublicView, mediaBoundedCachePolicy, rememberPublicView, type PublicServiceResult } from './public-result'
import { PUBLIC_SELECTION_BATCH_BYTES } from '../../../shared/contracts/public-selection'
import { publicNow } from './public-values'

export abstract class PublicModuleServiceBase {
  protected readonly listPolicy
  protected readonly detailPolicy
  protected readonly clock: () => Date

  constructor(
    protected readonly translations: TranslationBatchReader,
    protected readonly media: MediaService,
    protected readonly cache: PublicCacheService,
    publicMediaGrantSeconds: number,
    now?: () => Date,
  ) {
    this.clock = now ?? (() => new Date())
    this.listPolicy = mediaBoundedCachePolicy(publicMediaGrantSeconds, 120, 600, 512_000)
    this.detailPolicy = mediaBoundedCachePolicy(publicMediaGrantSeconds, 300, 1_200, 768_000)
  }

  protected generatedAt(): string { return publicNow(this.clock).toISOString() }

  protected listResult<T extends { meta: PublicPageMeta }>(module: string, request: PublicListRequest, tags: readonly string[], loader: () => Promise<T>): Promise<PublicServiceResult<T>> {
    if (request.selectedUids) return freshPublicView(PUBLIC_SELECTION_BATCH_BYTES, loader)
    return rememberPublicView(this.cache, {
      namespace: 'public-content',
      resource: `${module}-list`,
      locale: request.locale,
      params: { page: request.page, pageSize: request.pageSize, search: request.search, filters: { ...request.filters }, scope: request.scope ?? null },
      tags: request.scope ? [...tags, 'public:navigation'] : tags,
      schemaVersion: 8,
    }, this.listPolicy, 512_000, async () => {
      const view = await loader()
      if (!request.scope) return view
      return { ...view, meta: { ...view.meta, title: request.scope.label, breadcrumbs: view.meta.breadcrumbs.map((crumb, index, all) => index === all.length - 1 ? { ...crumb, label: request.scope!.label } : crumb) } }
    })
  }

  protected async detailResult<T>(module: string, authModule: AuthModule, locale: 'zh' | 'en', uid: string, tags: readonly string[], loader: () => Promise<T>): Promise<PublicServiceResult<T>> {
    const recordTag = await cacheRecordTag(authModule, uid)
    return rememberPublicView(this.cache, {
      namespace: 'public-content',
      resource: `${module}-detail`,
      locale,
      params: { uid },
      tags: [...tags, recordTag],
      schemaVersion: module === 'team' ? 3 : ['publications', 'news'].includes(module) ? 2 : 1,
    }, this.detailPolicy, 768_000, loader)
  }
}
