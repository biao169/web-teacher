import { assertMethod, getRequestURL, sendRedirect, setResponseHeaders } from 'h3'
import { resolveVisitorLocale } from '../utils/public-locale'

export default defineEventHandler(async event => {
  setResponseHeaders(event, { 'cache-control': 'private, no-store, max-age=0', vary: 'Cookie, Accept-Language' })
  assertMethod(event, ['GET', 'HEAD'])
  const locale = await resolveVisitorLocale(event, useRuntimeConfig(event))
  return sendRedirect(event, `/${locale}${getRequestURL(event).search}`, 302)
})
