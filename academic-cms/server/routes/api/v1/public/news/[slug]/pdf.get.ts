import { getHeader, getQuery, getRouterParam, sendStream, setHeader, setResponseStatus } from 'h3'
import { useDatabase } from '../../../../../../utils/database'
import { useMediaRuntime } from '../../../../../../utils/media-runtime'
import { mediaHttpFailure } from '../../../../../../utils/media-http'
import { MediaError } from '../../../../../../media/errors'
import { PublicContentStore } from '../../../../../../services/public/public-content-store'
import { richTextMediaReferencesFromHtml } from '../../../../../../services/public/public-content-blocks'
import { safeRecordIdentifier } from '../../../../../../services/public/public-values'

/** Reauthorize every range, so a long reading session never depends on an expired page grant. */
export default defineEventHandler(async event => {
  try {
    const query = getQuery(event)
    if (Object.keys(query).some(key => key !== 'key') || typeof query.key !== 'string') throw new MediaError('MEDIA_INPUT', 'Invalid PDF reference')
    let slug: string
    try { slug = safeRecordIdentifier(getRouterParam(event, 'slug') ?? '') } catch { throw new MediaError('MEDIA_INPUT', 'Invalid news identifier') }
    const item = await new PublicContentStore(useDatabase(event).adapter).newsDetail(slug, new Date().toISOString())
    if (!item || item.contentFormat !== 'html' || !richTextMediaReferencesFromHtml(item.content).some(ref => ref.kind === 'pdf' && ref.objectKey === query.key)) throw new MediaError('MEDIA_NOT_FOUND', 'PDF is not attached to this public news item')
    const service = useMediaRuntime(event).service
    const [media] = await service.project([{ objectKey: query.key, module: 'news', recordUid: item.uid, visibility: 'public', purpose: 'publication_pdf', referenceRevision: item.updatedAt, disposition: 'inline', allowDownload: false }], null)
    if (!media?.available || media.kind !== 'pdf') throw new MediaError('MEDIA_NOT_FOUND', 'PDF is unavailable')
    const grant = new URL(media.url, 'https://public.invalid').searchParams.get('g')
    if (!grant) throw new MediaError('MEDIA_PROTOCOL', 'Missing media grant')
    const plan = await service.deliver({ objectKey: query.key, grant, method: event.method === 'HEAD' ? 'HEAD' : 'GET',
      range: getHeader(event, 'range') ?? null, ifRange: getHeader(event, 'if-range') ?? null,
      ifMatch: getHeader(event, 'if-match') ?? null, ifNoneMatch: getHeader(event, 'if-none-match') ?? null,
      ifModifiedSince: getHeader(event, 'if-modified-since') ?? null, ifUnmodifiedSince: getHeader(event, 'if-unmodified-since') ?? null, download: false,
    }, async () => null)
    setResponseStatus(event, plan.status)
    for (const [key, value] of Object.entries(plan.headers)) setHeader(event, key, value)
    setHeader(event, 'cache-control', 'private, no-store, max-age=0')
    return plan.body && event.method !== 'HEAD' ? sendStream(event, plan.body) : null
  } catch (error) { return mediaHttpFailure(event, error) }
})
