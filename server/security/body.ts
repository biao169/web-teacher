import { SecurityError } from './errors'

export const AUTH_JSON_BODY_LIMIT = 16 * 1024

/** Authentication endpoints do not accept compressed request bodies. */
export function validateContentEncoding(value: string | null | undefined): void {
  if (value === null || value === undefined || value.trim() === '') return
  if (value.trim().toLowerCase() === 'identity') return
  throw new SecurityError('AUTH_UNSUPPORTED_MEDIA_TYPE', 'Compressed authentication request bodies are not supported')
}

function assertLimit(maximumBytes: number): void {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1024 || maximumBytes > 1024 * 1024) {
    throw new SecurityError('AUTH_CONFIG', 'Invalid authentication request body limit')
  }
}

export function validateContentLength(value: string | null | undefined, maximumBytes = AUTH_JSON_BODY_LIMIT): number | null {
  assertLimit(maximumBytes)
  if (value === null || value === undefined || value === '') return null
  if (!/^(?:0|[1-9][0-9]{0,9})$/u.test(value)) throw new SecurityError('AUTH_INPUT', 'Content-Length is invalid')
  const length = Number(value)
  if (!Number.isSafeInteger(length)) throw new SecurityError('AUTH_INPUT', 'Content-Length is invalid')
  if (length > maximumBytes) throw new SecurityError('AUTH_PAYLOAD_TOO_LARGE', 'Authentication request body is too large')
  return length
}

/** Reads a request stream with a hard byte ceiling and strict UTF-8 decoding. */
export async function parseBoundedJsonStream(
  stream: ReadableStream<Uint8Array> | null | undefined,
  contentLength: string | null | undefined,
  maximumBytes = AUTH_JSON_BODY_LIMIT,
): Promise<unknown> {
  const declaredLength = validateContentLength(contentLength, maximumBytes)
  if (!stream) throw new SecurityError('AUTH_INPUT', 'Request body is required')

  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const result = await reader.read()
      if (result.done) break
      const chunk = result.value
      if (!(chunk instanceof Uint8Array)) throw new SecurityError('AUTH_INPUT', 'Request body stream is invalid')
      total += chunk.byteLength
      if (total > maximumBytes) {
        await reader.cancel('authentication request body limit exceeded').catch(() => undefined)
        throw new SecurityError('AUTH_PAYLOAD_TOO_LARGE', 'Authentication request body is too large')
      }
      chunks.push(chunk)
    }
  }
  finally {
    reader.releaseLock()
  }

  if (declaredLength !== null && declaredLength !== total) throw new SecurityError('AUTH_INPUT', 'Content-Length does not match the request body')
  if (total === 0) throw new SecurityError('AUTH_INPUT', 'Request body is required')

  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }

  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  }
  catch (error) {
    throw new SecurityError('AUTH_INPUT', 'Request body is not valid UTF-8', { cause: error })
  }
  try {
    return JSON.parse(text) as unknown
  }
  catch (error) {
    throw new SecurityError('AUTH_INPUT', 'Request body is not valid JSON', { cause: error })
  }
}
