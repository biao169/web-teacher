import { assertMethod, createError, getQuery, setResponseHeaders } from 'h3'
import { configuredPublicOrigin } from '../../shared/utils/public-seo'
import { parseSitemapRequest, publicSitemap } from '../services/public/public-sitemap'
import { useDatabase } from '../utils/database'
import { publicHttpFailure } from '../utils/public-http'

export default defineEventHandler(async event => {
  setResponseHeaders(event, { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' })
  assertMethod(event, ['GET', 'HEAD'])
  const origin = configuredPublicOrigin(useRuntimeConfig(event).public.siteUrl)
  if (!origin) throw createError({ statusCode: 503, statusMessage: 'Configure NUXT_PUBLIC_SITE_URL to enable the sitemap' })
  try {
    const request = parseSitemapRequest(getQuery(event))
    const body = await publicSitemap(useDatabase(event).adapter, origin, request)
    setResponseHeaders(event, { 'content-type': 'application/xml; charset=utf-8' })
    return body
  }
  catch (error) { return publicHttpFailure(event, 'Sitemap', error) }
})
