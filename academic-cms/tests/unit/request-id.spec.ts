import { describe, expect, it, vi } from 'vitest'
import { normalizeRequestId, selectRequestId } from '../../shared/utils/request-id'

describe('normalizeRequestId', () => {
  it('accepts and trims a bounded safe request ID', () => {
    expect(normalizeRequestId('  cf-ray:12345678  ')).toBe('cf-ray:12345678')
  })

  it.each([
    null,
    undefined,
    '',
    'short',
    'contains spaces',
    '<script>alert(1)</script>',
    'x'.repeat(129),
  ])('rejects unsafe value %s', (value) => {
    expect(normalizeRequestId(value)).toBeNull()
  })
})

describe('selectRequestId', () => {
  it('prioritizes Cloudflare Ray ID over a forwarded value', () => {
    expect(selectRequestId({
      cloudflareRay: '9abcdef012345678-LHR',
      forwardedRequestId: 'request-from-proxy',
    })).toBe('9abcdef012345678-LHR')
  })

  it('uses a safe forwarded request ID outside Cloudflare', () => {
    expect(selectRequestId({ forwardedRequestId: 'request-from-proxy' })).toBe('request-from-proxy')
  })

  it('generates an ID when upstream values are absent or unsafe', () => {
    const generate = vi.fn(() => 'generated-request-id')
    expect(selectRequestId({ cloudflareRay: '<bad>', generate })).toBe('generated-request-id')
    expect(generate).toHaveBeenCalledOnce()
  })

  it('fails closed when a custom generator returns an unsafe value', () => {
    expect(() => selectRequestId({ generate: () => 'bad' })).toThrow(TypeError)
  })
})
