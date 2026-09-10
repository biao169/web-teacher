/** Read server-directed cooldowns without automatically replaying a write. */
export function requestBackoffSeconds(error: unknown, now = Date.now()): number {
  if (!error || typeof error !== 'object') return 0
  const candidate = error as { statusCode?: number; status?: number; response?: { status?: number; headers?: Headers } }
  if (Number(candidate.statusCode ?? candidate.status ?? candidate.response?.status) !== 429) return 0
  const headers = candidate.response?.headers
  const retry = headers?.get?.('retry-after')
  if (retry) {
    const seconds = /^\d+$/u.test(retry.trim()) ? Number(retry) : (Date.parse(retry) - now) / 1000
    if (Number.isFinite(seconds)) return Math.max(1, Math.min(86_400, Math.ceil(seconds)))
  }
  const reset = Number(headers?.get?.('x-ratelimit-reset'))
  if (Number.isFinite(reset) && reset > now) return Math.max(1, Math.min(86_400, Math.ceil((reset - now) / 1000)))
  return 60
}
