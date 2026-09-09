import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildTranslationProviderRequest } from '../../shared/complete-admin/core.mjs'
import { resolveTranslationConfig, splitTranslationText } from '../../shared/admin/translation'
import { createTranslationClient, parseProviderResponse } from '../../server/services/complete-admin/translation-provider'

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })
const myMemory = (translatedText: string) => Response.json({ responseStatus: 200, quotaFinished: false, responseData: { translatedText } })
const libre = { translation_provider: 'libretranslate', translation_providers: '["libretranslate"]', libretranslate_url: 'https://translator.example/api' }

describe('effective translation configuration and request contracts', () => {
  it('uses keyless defaults and normalizes empty or invalid numeric values', () => {
    expect(resolveTranslationConfig({})).toMatchObject({ provider: 'mymemory', readyProviders: ['mymemory'], usesDefault: true, batchSize: 10, workerCount: 1, timeoutSeconds: 15 })
    expect(resolveTranslationConfig({ translation_batch_size: '', translation_timeout_seconds: 'bad', translation_worker_count: 99 })).toMatchObject({ batchSize: 10, timeoutSeconds: 15, workerCount: 1 })
    expect(resolveTranslationConfig({ translation_provider: 'libretranslate' })).toMatchObject({ provider: 'mymemory' })
  })
  it('respects an explicit allowlist and uses a newly configured service immediately', () => {
    expect(resolveTranslationConfig({ translation_provider: 'libretranslate', translation_providers: '["libretranslate"]' }).provider).toBeNull()
    expect(resolveTranslationConfig(libre)).toMatchObject({ provider: 'libretranslate', readyProviders: ['libretranslate'] })
    expect(resolveTranslationConfig({ ...libre, libretranslate_url: 'https://libretranslate.com' }).provider).toBeNull()
    expect(resolveTranslationConfig({ ...libre, libretranslate_url: 'https://libretranslate.com', libretranslate_api_key: 'configured' }).provider).toBe('libretranslate')
  })
  it('keeps endpoint prefixes, selects the DeepL plan, and omits an empty contact email', () => {
    expect(buildTranslationProviderRequest('libretranslate', { url: libre.libretranslate_url }, ['文本']).url).toBe('https://translator.example/api/translate')
    expect(buildTranslationProviderRequest('libretranslate', { url: 'https://translator.example/api/translate' }, ['文本']).url).toBe('https://translator.example/api/translate')
    expect(buildTranslationProviderRequest('deepl', { apiKey: 'test:fx' }, ['文本']).url).toContain('api-free.deepl.com')
    expect(buildTranslationProviderRequest('deepl', { apiKey: 'test' }, ['文本']).url).toContain('api.deepl.com')
    const url = new URL(buildTranslationProviderRequest('mymemory', {}, ['文本']).url)
    expect(url.searchParams.has('de')).toBe(false)
    expect(url.searchParams.get('langpair')).toBe('zh-CN|en')
    expect(() => buildTranslationProviderRequest('mymemory', {}, ['中'.repeat(167)])).toThrow('PROVIDER_TEXT_TOO_LARGE')
  })
  it('splits UTF-8 text without losing emoji, whitespace or paragraphs', () => {
    const source = ('中文😀 English。\n第二段文字。 '.repeat(100))
    const chunks = splitTranslationText(source)
    expect(chunks.join('')).toBe(source)
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.every(chunk => new TextEncoder().encode(chunk).byteLength <= 500)).toBe(true)
    expect(chunks.every(chunk => chunk.isWellFormed())).toBe(true)
  })
  it('rejects HTTP-200 quota errors and non-success MyMemory payloads', () => {
    expect(() => parseProviderResponse('mymemory', { responseStatus: 429, responseData: { translatedText: 'LIMIT REACHED' } }, 1)).toThrow('PROVIDER_RATE_LIMITED')
    expect(() => parseProviderResponse('mymemory', { responseStatus: 200, quotaFinished: true, responseData: { translatedText: 'LIMIT REACHED' } }, 1)).toThrow('PROVIDER_QUOTA_EXCEEDED')
  })
})

describe('bounded translation requests and partial outcomes', () => {
  it('merges short fields with stable markers in a single request', async () => {
    const fetch = vi.fn(async (url: string) => myMemory(new URL(url).searchParams.get('q')!.replace('教师', 'Teacher').replace('学生', 'Student')))
    vi.stubGlobal('fetch', fetch)
    const client = createTranslationClient({})
    expect(await client.translate(['教师', '学生'])).toEqual([{ translated: 'Teacher', provider: 'mymemory' }, { translated: 'Student', provider: 'mymemory' }])
    expect(client.requestCount).toBe(1)
    expect(new TextEncoder().encode(new URL(fetch.mock.calls[0]![0]).searchParams.get('q')!).byteLength).toBeLessThanOrEqual(500)
  })
  it('segments long fields before network calls and saves no partial field after failure', async () => {
    const sent: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      sent.push(new URL(url).searchParams.get('q')!)
      return sent.length === 2 ? new Response(null, { status: 429 }) : myMemory('First segment')
    }))
    const client = createTranslationClient({})
    const result = await client.translate(['中'.repeat(400)])
    expect(sent.every(value => new TextEncoder().encode(value).byteLength <= 500)).toBe(true)
    expect(result[0]?.translated).toBeUndefined()
    expect(result[0]?.error?.code).toBe('PROVIDER_RATE_LIMITED')
    expect(client.requestCount).toBe(2)
  })
  it('stops splitting/repeating requests on rate limits and honours Retry-After', async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 429, headers: { 'retry-after': '180' } }))
    vi.stubGlobal('fetch', fetch)
    const client = createTranslationClient({})
    const results = await client.translate(['一', '二', '三'])
    await client.translate(['四'])
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(results.every(result => result.error?.retryAfterSeconds === 180)).toBe(true)
  })
  it('uses only allowed fallback providers and records the actual successful provider', async () => {
    const fetch = vi.fn(async (url: string) => url.startsWith('https://translator.example') ? new Response(null, { status: 503 }) : myMemory('Translated'))
    vi.stubGlobal('fetch', fetch)
    const result = await createTranslationClient({ ...libre, translation_providers: '["libretranslate","mymemory"]' }).translate(['测试'])
    expect(result).toEqual([{ provider: 'mymemory', translated: 'Translated' }])
    expect(fetch).toHaveBeenCalledTimes(2)
    fetch.mockClear()
    expect((await createTranslationClient(libre).translate(['测试']))[0]?.error?.code).toBe('PROVIDER_TEMPORARY_FAILURE')
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('keeps successful siblings if one item fails after malformed batch response', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      const source = JSON.parse(String(init.body)).q
      if (source.length > 1) return Response.json({ translatedText: [] })
      if (source[0] === '坏字段') return new Response(null, { status: 400 })
      return Response.json({ translatedText: ['Good translation'] })
    }))
    const result = await createTranslationClient(libre).translate(['好字段', '坏字段'])
    expect(result[0]?.translated).toBe('Good translation')
    expect(result[1]?.error?.code).toBe('PROVIDER_REQUEST_REJECTED')
  })
  it('classifies network failures without storing URLs or secret error details', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('https://private.example?key=secret') }))
    const result = await createTranslationClient({}).translate(['测试'])
    expect(result[0]?.error?.message).toBe('PROVIDER_NETWORK_FAILURE')
  })
  it('aborts timed-out requests and releases the timer', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => init.signal!.addEventListener('abort', () => reject(new Error('aborted'))))))
    const pending = createTranslationClient({ translation_timeout_seconds: 1 }).translate(['测试'])
    await vi.advanceTimersByTimeAsync(1000)
    expect((await pending)[0]?.error?.code).toBe('PROVIDER_TIMEOUT')
    expect(vi.getTimerCount()).toBe(0)
  })
})
