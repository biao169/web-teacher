import { afterEach, describe, expect, it, vi } from 'vitest'
import { createVisitorCountryLookup, normalizeVisitorIp, publicVisitorIp } from '../../server/services/public/visitor-country'

afterEach(() => vi.useRealTimers())
describe('visitor IP normalization and lookup', () => {
  it.each(['127.0.0.1', '::1', '::ffff:127.0.0.1', '10.2.3.4', '172.16.0.1', '192.168.1.1', '169.254.1.1', '100.64.0.1', '198.18.0.1', '224.0.0.1', '0.0.0.0', '192.0.2.1', '203.0.113.2', '2001:db8::1', 'fc00::1', 'fe80::1', 'fe80::1%eth0', 'host.example', '1.2.3.4/evil', '001.2.3.4', '256.1.2.3', '8.8.8.8,1.1.1.1'])('never sends non-public or invalid IP %s', value => expect(publicVisitorIp(value)).toBeNull())
  it('normalizes IPv4, IPv6 and mapped IPv4 without accepting a hostname', () => {
    expect(publicVisitorIp('8.8.8.8')).toBe('8.8.8.8')
    expect(publicVisitorIp('::FFFF:8.8.8.8')).toBe('8.8.8.8')
    expect(publicVisitorIp('2001:4860:4860:0:0:0:0:8888')).toBe('2001:4860:4860::8888')
    expect(normalizeVisitorIp('8.8.8.8@evil.test')).toBeNull()
  })
  it('shares simultaneous lookups, caches results and expires them', async () => {
    let time = 0
    const fetch = vi.fn(async () => Response.json({ ip: '8.8.8.8', country: 'US' }))
    const lookup = createVisitorCountryLookup(fetch, () => time)
    expect(await Promise.all([lookup('8.8.8.8'), lookup('::ffff:8.8.8.8')])).toEqual(['US', 'US'])
    expect(await lookup('8.8.8.8')).toBe('US')
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledWith('https://api.country.is/8.8.8.8', expect.objectContaining({ redirect: 'error' }))
    time += 6 * 3600_000 + 1
    await lookup('8.8.8.8'); expect(fetch).toHaveBeenCalledTimes(2)
  })
  it('negative-caches a synchronous failure and recovers rather than retaining a dead promise', async () => {
    let time = 0
    const fetch = vi.fn().mockImplementationOnce(() => { throw new Error('offline') }).mockResolvedValue(Response.json({ ip: '8.8.8.8', country: 'US' }))
    const lookup = createVisitorCountryLookup(fetch, () => time)
    expect(await lookup('8.8.8.8')).toBeNull()
    expect(await lookup('8.8.8.8')).toBeNull(); expect(fetch).toHaveBeenCalledTimes(1)
    time = 60001
    expect(await lookup('8.8.8.8')).toBe('US'); expect(fetch).toHaveBeenCalledTimes(2)
  })
  it('times out and returns a fallback signal', async () => {
    vi.useFakeTimers()
    const fetch = vi.fn((_url: unknown, options?: RequestInit) => new Promise<Response>((_resolve, reject) => options?.signal?.addEventListener('abort', () => reject(new Error('aborted')))))
    const lookup = createVisitorCountryLookup(fetch)
    const result = lookup('8.8.8.8')
    await vi.advanceTimersByTimeAsync(1001)
    expect(await result).toBeNull()
  })
  it.each([
    () => Response.json({ ip: '1.1.1.1', country: 'US' }),
    () => Response.json({ ip: '8.8.8.8', country: 'XX' }),
    () => new Response('not json'),
    () => Response.json({ ip: '8.8.8.8', country: 'US', extra: 'x'.repeat(5000) }),
    () => new Response(null, { status: 503 }),
  ])('rejects incorrect, oversized or failed responses', async response => {
    expect(await createVisitorCountryLookup(vi.fn(async () => response()))('8.8.8.8')).toBeNull()
  })
  it('honors rate-limit cooldown across IPs', async () => {
    let time = 0
    const fetch = vi.fn().mockResolvedValueOnce(new Response(null, { status: 429, headers: { 'retry-after': '120' } })).mockResolvedValueOnce(Response.json({ ip: '1.1.1.1', country: 'AU' }))
    const lookup = createVisitorCountryLookup(fetch, () => time)
    await lookup('8.8.8.8')
    expect(await lookup('1.1.1.1')).toBeNull(); expect(fetch).toHaveBeenCalledTimes(1)
    time = 120001
    expect(await lookup('1.1.1.1')).toBe('AU')
  })
  it('disables external requests, rejects unsafe configuration and supports a configured local service', async () => {
    const fetch = vi.fn(async () => Response.json({ ip: '8.8.8.8', country: 'US' }))
    const lookup = createVisitorCountryLookup(fetch)
    for (const options of [{ enabled: false }, { enabled: 'false' }, { url: 'http://remote.example' }, { url: 'https://user:pass@service.test' }, { url: 'https://service.test/?ip=' }]) expect(await lookup('8.8.8.8', options)).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
    expect(await lookup('8.8.8.8', { url: 'http://127.0.0.1:9090/geo' })).toBe('US')
    expect(fetch.mock.calls[0]![0]).toBe('http://127.0.0.1:9090/geo/8.8.8.8')
  })
})
