export interface ApiErrorShape {
  data?: { error?: { code?: unknown; message?: unknown; requestId?: unknown } }
  statusCode?: number
  message?: string
}

export function apiErrorDetails(error: unknown, fallback: string): { code: string; message: string; requestId: string | null } {
  if (typeof error !== 'object' || error === null) return { code: 'UNKNOWN', message: fallback, requestId: null }
  const candidate = error as ApiErrorShape
  const body = candidate.data?.error
  return {
    code: typeof body?.code === 'string' ? body.code : 'UNKNOWN',
    message: typeof body?.message === 'string' && body.message.trim() ? body.message : fallback,
    requestId: typeof body?.requestId === 'string' ? body.requestId : null,
  }
}
