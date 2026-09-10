import type { D1Database } from '@cloudflare/workers-types'
import { drizzle } from 'drizzle-orm/d1'
import { D1Adapter } from '../adapters/d1'
import { Repository } from '../repository'

export function openCloudflareDatabase(binding: D1Database) {
  if (!binding || typeof binding.prepare !== 'function' || typeof binding.batch !== 'function') throw new Error('D1 DB binding is missing')
  const adapter = new D1Adapter(binding)
  return { adapter, orm: drizzle(binding), repository: new Repository(adapter) }
}
