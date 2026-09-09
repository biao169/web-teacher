import { setResponseHeaders } from 'h3'
import { createHealthPayload } from '../utils/health'

export default defineEventHandler((event) => {
  const config = useRuntimeConfig(event)

  setResponseHeaders(event, {
    'cache-control': 'no-store, max-age=0',
    'content-type': 'application/json; charset=utf-8',
    'x-content-type-options': 'nosniff',
  })

  return createHealthPayload({
    version: String(config.appVersion),
    runtime: config.runtimeKind,
    requestId: event.context.requestId,
  })
})
