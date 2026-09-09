import { assertMethod, setResponseHeaders } from 'h3'
import { configuredPublicOrigin } from '../../shared/utils/public-seo'
import { publicRobots } from '../services/public/public-sitemap'

export default defineEventHandler(event => {
  assertMethod(event, ['GET', 'HEAD'])
  setResponseHeaders(event, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' })
  return publicRobots(configuredPublicOrigin(useRuntimeConfig(event).public.siteUrl))
})
