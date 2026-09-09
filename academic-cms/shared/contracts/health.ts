export const HEALTH_STATUS = 'ok' as const
export const HEALTH_SERVICE = 'academic-cms' as const

export type RuntimeKind = 'node' | 'cloudflare' | 'unknown'

export interface HealthPayload {
  status: typeof HEALTH_STATUS
  service: typeof HEALTH_SERVICE
  version: string
  runtime: RuntimeKind
  timestamp: string
  requestId: string
}

export function isRuntimeKind(value: unknown): value is RuntimeKind {
  return value === 'node' || value === 'cloudflare' || value === 'unknown'
}
