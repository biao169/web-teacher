import type { D1Database } from '@cloudflare/workers-types'
import type { DatabaseRequest } from '../../db/context'
import { openCloudflareDatabase } from '../../db/runtime/cloudflare'

export function getPlatformDatabase(event: DatabaseRequest) {
  const context = event.context as { cloudflare?: { env?: { DB?: D1Database } } }
  const binding = context.cloudflare?.env?.DB
  if (!binding) throw new Error('D1 DB binding is missing; configure it before using database-backed routes')
  return openCloudflareDatabase(binding)
}
