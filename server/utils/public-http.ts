import { createError, getHeader, setHeader, setResponseStatus, type H3Event } from 'h3'
import { ifNoneMatchMatches } from '../../shared/utils/http-etag'
import { PublicSiteError } from '../services/public/errors'
import type { PublicServiceResult } from '../services/public/public-result'

function statusFor(error: PublicSiteError): number {
  switch (error.code) {
    case 'PUBLIC_INPUT':
    case 'PUBLIC_LIMIT': return 400
    case 'PUBLIC_NOT_FOUND': return 404
    default: return 503
  }
}

export function publicHttpFailure(event: H3Event, label: string, error: unknown): never {
  if (error && typeof error === 'object' && 'statusCode' in error) throw error
  const statusCode = error instanceof URIError ? 400 : error instanceof PublicSiteError ? statusFor(error) : 503
  const message = statusCode === 400
    ? 'Invalid public request'
    : statusCode === 404
      ? 'Public content was not found'
      : 'Public site data is temporarily unavailable'
  if (statusCode >= 500) {
    console.error(`${label} failed`, {
      requestId: event.context.requestId,
      errorType: error instanceof Error ? error.name : typeof error,
      errorCode: error instanceof PublicSiteError ? error.code : 'PUBLIC_UNAVAILABLE',
    })
  }
  throw createError({ statusCode, message })
}

export function sendPublicResult<T>(event: H3Event, result: PublicServiceResult<T>): T | null {
  setHeader(event, 'cache-control', 'public, max-age=0, must-revalidate')
  setHeader(event, 'etag', result.etag)
  setHeader(event, 'vary', 'accept-encoding')
  setHeader(event, 'x-cms-cache', result.cache)
  setHeader(event, 'x-content-type-options', 'nosniff')
  if (ifNoneMatchMatches(getHeader(event, 'if-none-match'), result.etag)) {
    setResponseStatus(event, 304)
    return null
  }
  return result.viewModel
}

export async function handlePublicResult<T>(event: H3Event, label: string, loader: () => Promise<PublicServiceResult<T>>): Promise<T | null> {
  try { return sendPublicResult(event, await loader()) }
  catch (error) { return publicHttpFailure(event, label, error) }
}
