import { getHeader, setHeader } from 'h3'
import { selectRequestId } from '../../shared/utils/request-id'

export default defineEventHandler((event) => {
  const config = useRuntimeConfig(event)
  const requestId = selectRequestId({
    // A client can spoof cf-ray on a normal Node deployment, so trust it only
    // in the artifact explicitly built for the Cloudflare runtime.
    cloudflareRay: config.runtimeKind === 'cloudflare' ? getHeader(event, 'cf-ray') : null,
    forwardedRequestId: getHeader(event, 'x-request-id'),
  })

  event.context.requestId = requestId
  setHeader(event, 'x-request-id', requestId)
})
