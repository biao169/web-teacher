import { getCookie, getHeader, type H3Event } from 'h3'
import { defaultPublicLocale, PUBLIC_LOCALE_COOKIE, publicCountryCode, savedPublicLocale } from '../../shared/utils/public-locale'
import { selectClientNetwork } from '../security/origin'
import { createVisitorCountryLookup } from '../services/public/visitor-country'

const lookupCountry = createVisitorCountryLookup()

/** Root-only negotiation: no database/session dependency and no trust in visitor-supplied country headers. */
export async function resolveVisitorLocale(event: H3Event, config: Readonly<Record<string, unknown>>, lookup = lookupCountry) {
  const preference = savedPublicLocale(getCookie(event, PUBLIC_LOCALE_COOKIE))
  if (preference) return preference
  const cloudflare = config.runtimeKind === 'cloudflare'
  const platform = event.context as { cf?: { country?: unknown }; cloudflare?: { request?: { cf?: { country?: unknown } } } }
  let country = cloudflare ? publicCountryCode(platform.cloudflare?.request?.cf?.country ?? platform.cf?.country) : null
  if (!country) {
    const hops = Number(config.authTrustedProxyHops || 0)
    const network = selectClientNetwork({
      runtimeKind: cloudflare ? 'cloudflare' : config.runtimeKind === 'node' ? 'node' : 'unknown',
      cloudflareConnectingIp: getHeader(event, 'cf-connecting-ip') ?? null,
      forwardedFor: getHeader(event, 'x-forwarded-for') ?? null,
      remoteAddress: event.node?.req?.socket?.remoteAddress ?? null,
      trustedProxyHops: hops,
    })
    country = await lookup(network, { enabled: config.localeGeoIpEnabled, url: config.localeGeoIpUrl, timeoutMs: config.localeGeoIpTimeoutMs })
  }
  return defaultPublicLocale({ country, acceptLanguage: getHeader(event, 'accept-language'), chineseRegions: config.localeChineseRegions, fallback: config.localeFallback })
}
