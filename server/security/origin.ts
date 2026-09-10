import { SecurityError } from './errors'

export function canonicalizeOrigin(value: string, code: 'AUTH_CONFIG' | 'AUTH_ORIGIN' = 'AUTH_ORIGIN'): string {
  if (typeof value !== 'string' || value.length > 2048) throw new SecurityError(code, 'Invalid origin')
  let url: URL
  try { url = new URL(value) }
  catch (error) { throw new SecurityError(code, 'Invalid origin', { cause: error }) }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new SecurityError(code, 'Origin must contain only scheme and authority')
  }
  return url.origin
}

export function requestOrigin(requestUrl: string): string {
  let url: URL
  try { url = new URL(requestUrl) }
  catch (error) { throw new SecurityError('AUTH_ORIGIN', 'Request URL is invalid', { cause: error }) }
  if (!['http:', 'https:'].includes(url.protocol)) throw new SecurityError('AUTH_ORIGIN', 'Request scheme is not allowed')
  return url.origin
}

export function selectClientNetwork(input: {
  runtimeKind: 'node' | 'cloudflare' | 'unknown'
  cloudflareConnectingIp?: string | null
  forwardedFor?: string | null
  remoteAddress?: string | null
  trustedProxyHops: number
}): string | null {
  if (!Number.isSafeInteger(input.trustedProxyHops) || input.trustedProxyHops < 0 || input.trustedProxyHops > 10) return null
  if (input.runtimeKind === 'cloudflare') return normalizeNetworkValue(input.cloudflareConnectingIp)
  if (input.runtimeKind === 'node' && input.trustedProxyHops > 0 && input.forwardedFor) {
    const chain = input.forwardedFor.split(',').map(item => item.trim()).filter(Boolean)
    const index = chain.length - input.trustedProxyHops
    if (index >= 0 && index < chain.length) return normalizeNetworkValue(chain[index])
    return null
  }
  return normalizeNetworkValue(input.remoteAddress)
}

function normalizeNetworkValue(value: string | null | undefined): string | null {
  if (!value) return null
  const normalized = value.trim().toLowerCase()
  if (!normalized || normalized.length > 128 || /[\u0000-\u001f\u007f\s,]/.test(normalized)) return null
  return normalized
}
