import {
  HEALTH_SERVICE,
  HEALTH_STATUS,
  isRuntimeKind,
  type HealthPayload,
  type RuntimeKind,
} from '../../shared/contracts/health'
import { normalizeRequestId } from '../../shared/utils/request-id'

const HEALTH_VERSION_PATTERN = /^[0-9A-Za-z][0-9A-Za-z._+-]{0,63}$/

export interface CreateHealthPayloadOptions {
  version: unknown
  runtime: unknown
  requestId: unknown
  now?: () => Date
}

export function normalizeRuntimeKind(value: unknown): RuntimeKind {
  return isRuntimeKind(value) ? value : 'unknown'
}

export function normalizeHealthVersion(value: unknown): string {
  if (typeof value !== 'string') throw new TypeError('Health version must be a string')
  const normalized = value.trim()
  if (!HEALTH_VERSION_PATTERN.test(normalized)) {
    throw new TypeError('Health version must contain 1-64 safe version characters')
  }
  return normalized
}

function toIsoTimestamp(value: Date): string {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new TypeError('Health clock returned an invalid date')
  }
  return value.toISOString()
}

export function createHealthPayload(options: CreateHealthPayloadOptions): HealthPayload {
  const requestId = typeof options.requestId === 'string'
    ? normalizeRequestId(options.requestId)
    : null
  if (!requestId) throw new TypeError('Health request ID is missing or unsafe')

  const now = options.now ?? (() => new Date())
  return {
    status: HEALTH_STATUS,
    service: HEALTH_SERVICE,
    version: normalizeHealthVersion(options.version),
    runtime: normalizeRuntimeKind(options.runtime),
    timestamp: toIsoTimestamp(now()),
    requestId,
  }
}
