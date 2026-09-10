import type { H3Event } from 'h3'
import { getHeader, getRequestWebStream } from 'h3'
import { AUTH_JSON_BODY_LIMIT, parseBoundedJsonStream, validateContentEncoding } from '../security/body'

export function readBoundedJsonBody(event: H3Event, maximumBytes = AUTH_JSON_BODY_LIMIT): Promise<unknown> {
  validateContentEncoding(getHeader(event, 'content-encoding'))
  return parseBoundedJsonStream(getRequestWebStream(event), getHeader(event, 'content-length'), maximumBytes)
}
