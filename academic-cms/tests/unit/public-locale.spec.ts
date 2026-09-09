import { describe, expect, it } from 'vitest'
import { browserPublicLocale, defaultPublicLocale, PUBLIC_LOCALE_COOKIE_OPTIONS, publicCountryCode } from '../../shared/utils/public-locale'

describe('public language priority', () => {
  it.each([
    [{ preference: 'en', country: 'CN', acceptLanguage: 'zh' }, 'en'],
    [{ preference: 'zh', country: 'US', acceptLanguage: 'en' }, 'zh'],
    [{ preference: 'invalid', country: 'CN', acceptLanguage: 'en' }, 'zh'],
    [{ country: 'US', acceptLanguage: 'zh' }, 'en'],
    [{ country: 'CN', acceptLanguage: 'en' }, 'zh'],
    [{ country: 'HK' }, 'zh'], [{ country: 'MO' }, 'zh'], [{ country: 'TW' }, 'zh'],
    [{ country: 'HK', chineseRegions: 'CN' }, 'en'],
    [{ country: 'SG', chineseRegions: 'CN;SG' }, 'zh'],
    [{ country: 'XX', acceptLanguage: 'zh-CN' }, 'zh'],
    [{ country: 'T1', acceptLanguage: 'en-US' }, 'en'],
    [{ acceptLanguage: 'fr,zh-Hans;q=0.8,en;q=0.5' }, 'zh'],
    [{ acceptLanguage: 'zh;q=0,en;q=0.8' }, 'en'],
    [{ acceptLanguage: 'de-DE', fallback: 'zh' }, 'zh'],
    [{ fallback: 'invalid' }, 'en'], [{}, 'en'],
  ])('negotiates %j as %s', (input, expected) => expect(defaultPublicLocale(input)).toBe(expected))
  it.each([
    ['en-US;q=0.4,zh-CN;q=0.9', 'zh'], ['zh;q=0.5,en;q=0.5', 'zh'],
    ['en;q=0.5,zh;q=0.5', 'en'], ['ZH-hans-CN', 'zh'],
    ['zh;q=1.1,en;q=0', null], ['*', null], ['zh_CN', null], ['x'.repeat(2049), null],
  ])('parses browser preferences %s', (value, expected) => expect(browserPublicLocale(value)).toBe(expected))
  it('uses a bounded host cookie without changing auth cookies', () => {
    expect(PUBLIC_LOCALE_COOKIE_OPTIONS).toEqual({ path: '/', sameSite: 'lax', maxAge: 31536000 })
    expect(publicCountryCode(' cn ')).toBe('CN')
    expect(publicCountryCode(['CN'])).toBeNull()
  })
})
