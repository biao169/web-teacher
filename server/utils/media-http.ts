import type { H3Event } from 'h3'
import { getHeader, getQuery, getRouterParam, sendStream, setHeader, setResponseStatus } from 'h3'
import { SecurityError } from '../security/errors'
import { resolveOptionalSession } from './auth-runtime'
import { decodeObjectKeyPath } from '../media/object-key'
import { MediaError } from '../media/errors'
import { useMediaRuntime } from './media-runtime'

function singleQuery(value: unknown, name: string): string | null {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string' || value.length > 4096) throw new MediaError('MEDIA_INPUT', `Invalid media query parameter: ${name}`)
  return value
}

async function optionalPrincipal(event: H3Event) {
  try { return (await resolveOptionalSession(event))?.principal ?? null }
  catch (error) {
    if (error instanceof SecurityError && (error.code === 'AUTH_SESSION_INVALID' || error.code === 'AUTH_SESSION_EXPIRED')) return null
    throw error
  }
}

export function mediaHttpFailure(event: H3Event, error: unknown): null {
  const media = error instanceof MediaError ? error : new MediaError('MEDIA_STORAGE', 'Media delivery failed', error instanceof Error ? { cause: error } : undefined)
  const expected = ['MEDIA_INPUT', 'MEDIA_NOT_FOUND', 'MEDIA_FORBIDDEN', 'MEDIA_RANGE', 'MEDIA_PRECONDITION'].includes(media.code)
  const status = media.code === 'MEDIA_RANGE' ? 416
    : media.code === 'MEDIA_PRECONDITION' ? 412
      : expected ? 404 : 500
  setResponseStatus(event, status)
  setHeader(event, 'cache-control', 'private, no-store, max-age=0')
  setHeader(event, 'content-type', 'text/plain; charset=utf-8')
  setHeader(event, 'x-content-type-options', 'nosniff')
  if (!expected) console.error('Media request failed unexpectedly', { requestId: event.context.requestId, code: media.code, errorType: error instanceof Error ? error.name : typeof error })
  return null
}

export async function handleMediaRequest(event: H3Event): Promise<unknown> {
  try {
    const path = getRouterParam(event, 'key')
    if (!path) throw new MediaError('MEDIA_INPUT', 'Media object path is required')
    const objectKey = decodeObjectKeyPath(path)
    const query = getQuery(event)
    const grant = singleQuery(query.g, 'g')
    if (!grant) throw new MediaError('MEDIA_FORBIDDEN', 'Media grant is required')
    const downloadValue = singleQuery(query.download, 'download')
    if (downloadValue !== null && downloadValue !== '1') throw new MediaError('MEDIA_INPUT', 'Invalid download parameter')
    const method = event.method === 'HEAD' ? 'HEAD' : 'GET'
    const plan = await useMediaRuntime(event).service.deliver({
      objectKey,
      grant,
      method,
      range: getHeader(event, 'range') ?? null,
      ifRange: getHeader(event, 'if-range') ?? null,
      ifMatch: getHeader(event, 'if-match') ?? null,
      ifNoneMatch: getHeader(event, 'if-none-match') ?? null,
      ifModifiedSince: getHeader(event, 'if-modified-since') ?? null,
      ifUnmodifiedSince: getHeader(event, 'if-unmodified-since') ?? null,
      download: downloadValue === '1',
    }, () => optionalPrincipal(event))
    setResponseStatus(event, plan.status)
    for (const [name, value] of Object.entries(plan.headers)) setHeader(event, name, value)
    if (!plan.body || method === 'HEAD') return null
    return sendStream(event, plan.body)
  }
  catch (error) { return mediaHttpFailure(event, error) }
}
