import { describe, expect, it } from 'vitest'
import {
  createHealthPayload,
  normalizeHealthVersion,
  normalizeRuntimeKind,
} from '../../server/utils/health'

describe('normalizeRuntimeKind', () => {
  it.each(['node', 'cloudflare', 'unknown'] as const)('keeps %s', (runtime) => {
    expect(normalizeRuntimeKind(runtime)).toBe(runtime)
  })

  it('maps unexpected values to unknown', () => {
    expect(normalizeRuntimeKind('browser')).toBe('unknown')
    expect(normalizeRuntimeKind(undefined)).toBe('unknown')
  })
})

describe('normalizeHealthVersion', () => {
  it('trims a bounded version identifier', () => {
    expect(normalizeHealthVersion(' 1.2.3+build.4 ')).toBe('1.2.3+build.4')
  })

  it.each([undefined, '', 'version with spaces', 'x'.repeat(65)])('rejects %s', (value) => {
    expect(() => normalizeHealthVersion(value)).toThrow(TypeError)
  })
})

describe('createHealthPayload', () => {
  it('creates a deterministic, non-sensitive payload', () => {
    const payload = createHealthPayload({
      version: '1.2.3',
      runtime: 'node',
      requestId: 'request-12345678',
      now: () => new Date('2026-08-29T00:00:00.000Z'),
    })

    expect(payload).toEqual({
      status: 'ok',
      service: 'academic-cms',
      version: '1.2.3',
      runtime: 'node',
      timestamp: '2026-08-29T00:00:00.000Z',
      requestId: 'request-12345678',
    })
    expect(payload).not.toHaveProperty('environment')
    expect(payload).not.toHaveProperty('database')
  })

  it('rejects an invalid clock value instead of emitting broken JSON', () => {
    expect(() => createHealthPayload({
      version: '1.2.3',
      runtime: 'node',
      requestId: 'request-12345678',
      now: () => new Date(Number.NaN),
    })).toThrow(TypeError)
  })

  it('rejects unsafe request IDs at the contract boundary', () => {
    expect(() => createHealthPayload({
      version: '1.2.3',
      runtime: 'node',
      requestId: '<unsafe>',
    })).toThrow(TypeError)
  })
})
