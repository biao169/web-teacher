const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/

export function normalizeRequestId(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return REQUEST_ID_PATTERN.test(normalized) ? normalized : null
}

export interface RequestIdOptions {
  cloudflareRay?: string | null | undefined
  forwardedRequestId?: string | null | undefined
  generate?: (() => string) | undefined
}

export function selectRequestId(options: RequestIdOptions = {}): string {
  const upstream = normalizeRequestId(options.cloudflareRay)
    ?? normalizeRequestId(options.forwardedRequestId)
  if (upstream) return upstream

  const generated = options.generate ? options.generate() : crypto.randomUUID()
  const normalized = normalizeRequestId(generated)
  if (!normalized) {
    throw new TypeError('Request ID generator returned an unsafe value')
  }
  return normalized
}
