import { describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { resolveVisitorLocale } from '../../server/utils/public-locale'
import { PUBLIC_LOCALE_COOKIE } from '../../shared/utils/public-locale'

function event(headers: Record<string, string> = {}, context: Record<string, unknown> = {}, ip = '8.8.8.8') {
  return { node: { req: { headers, socket: { remoteAddress: ip } } }, context } as unknown as H3Event
}
describe('visitor locale runtime trust boundaries', () => {
  it('uses the saved choice without invoking geolocation', async () => {
    const lookup = vi.fn(async () => 'CN')
    expect(await resolveVisitorLocale(event({ cookie: `${PUBLIC_LOCALE_COOKIE}=en` }), { runtimeKind: 'node' }, lookup)).toBe('en')
    expect(lookup).not.toHaveBeenCalled()
  })
  it('uses trusted Workers metadata before any network lookup or browser language', async () => {
    const lookup = vi.fn(async () => 'US')
    expect(await resolveVisitorLocale(event({ 'accept-language': 'en' }, { cloudflare: { request: { cf: { country: 'CN' } } } }), { runtimeKind: 'cloudflare' }, lookup)).toBe('zh')
    expect(await resolveVisitorLocale(event({}, { cf: { country: 'US' } }), { runtimeKind: 'cloudflare' }, lookup)).toBe('en')
    expect(lookup).not.toHaveBeenCalled()
  })
  it('ignores spoofed forwarding and country headers on an unproxied Node origin', async () => {
    const lookup = vi.fn(async () => 'US')
    const request = event({ 'cf-ipcountry': 'CN', 'cf-connecting-ip': '1.1.1.1', 'x-forwarded-for': '1.1.1.1', 'accept-language': 'zh' }, { cf: { country: 'CN' } })
    expect(await resolveVisitorLocale(request, { runtimeKind: 'node' }, lookup)).toBe('en')
    expect(lookup).toHaveBeenCalledWith('8.8.8.8', expect.anything())
  })
  it('reuses the existing trusted proxy hop policy and fails closed on an incomplete chain', async () => {
    const lookup = vi.fn(async () => null)
    await resolveVisitorLocale(event({ 'x-forwarded-for': '9.9.9.9, 1.1.1.1, 10.0.0.1' }), { runtimeKind: 'node', authTrustedProxyHops: '2' }, lookup)
    expect(lookup).toHaveBeenLastCalledWith('1.1.1.1', expect.anything())
    await resolveVisitorLocale(event({ 'x-forwarded-for': '1.1.1.1' }), { runtimeKind: 'node', authTrustedProxyHops: '2' }, lookup)
    expect(lookup).toHaveBeenLastCalledWith(null, expect.anything())
  })
  it('falls back to browser language on unknown country, passing runtime configuration to the lookup', async () => {
    const lookup = vi.fn(async () => null)
    const config = { runtimeKind: 'cloudflare', localeGeoIpEnabled: 'false', localeGeoIpUrl: 'https://geo.example', localeGeoIpTimeoutMs: '500' }
    expect(await resolveVisitorLocale(event({ 'cf-connecting-ip': '8.8.8.8', 'accept-language': 'zh-CN' }, { cf: { country: 'XX' } }), config, lookup)).toBe('zh')
    expect(lookup).toHaveBeenCalledWith('8.8.8.8', { enabled: 'false', url: 'https://geo.example', timeoutMs: '500' })
  })
})
