export interface AdminErrorDetails { status: number; code: string; message: string; requestId: string | null; fieldErrors: Readonly<Record<string, string>> }

/** Display a validated API error, or a locally raised Error from upload/preview tools. */
export function adminErrorMessage(error: unknown, fallback: string): string {
  return adminErrorDetails(error, error instanceof Error && error.message.trim() ? error.message : fallback).message
}
interface ErrorBody { code?: unknown; message?: unknown; requestId?: unknown; fieldErrors?: unknown }
function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}
function numericStatus(value: unknown): number {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isInteger(number) && number >= 100 && number <= 599 ? number : 0
}
export function adminErrorDetails(error: unknown, fallback = '后台请求失败，请稍后重试。'): AdminErrorDetails {
  if (!error || typeof error !== 'object') return { status: 0, code: 'UNKNOWN', message: fallback, requestId: null, fieldErrors: {} }
  const candidate = error as { status?: unknown; statusCode?: unknown; response?: { status?: unknown; _data?: unknown }; data?: unknown }
  const payload = record(candidate.data ?? candidate.response?._data)
  const direct = record(payload?.error)
  const nested = record(record(payload?.data)?.error)
  const body = (direct ?? nested ?? {}) as ErrorBody
  const rawFields = record(body.fieldErrors)
  return {
    status: numericStatus(candidate.statusCode ?? candidate.status ?? candidate.response?.status),
    code: typeof body?.code === 'string' ? body.code : 'UNKNOWN',
    message: typeof body?.message === 'string' && body.message.trim() ? body.message : fallback,
    requestId: typeof body?.requestId === 'string' && body.requestId.trim() ? body.requestId : null,
    fieldErrors: rawFields ? Object.fromEntries(Object.entries(rawFields).flatMap(([key, value]) => {
      if (typeof value === 'string') return [[key, value]]
      if (Array.isArray(value)) {
        const first = value.find((item): item is string => typeof item === 'string')
        return first ? [[key, first]] : []
      }
      return []
    })) : {},
  }
}
