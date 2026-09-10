import type { DatabaseAdapter, RawRow } from '../../db/contracts'
import { read, write } from '../../db/query'
import { CacheError } from './errors'
import { normalizeCacheTags } from './keys'
import type { CacheGenerationSnapshot } from './contracts'

const MAX_GENERATION = 9_007_199_254_740_990

function parseGeneration(row: RawRow): { tag: string; generation: number } {
  const tag = row.tag
  const generation = row.generation
  if (typeof tag !== 'string' || typeof generation !== 'number' || !Number.isSafeInteger(generation) || generation < 1 || generation > MAX_GENERATION) {
    throw new CacheError('CACHE_PROTOCOL', 'Cache generation row is invalid')
  }
  return { tag, generation }
}

export class CacheGenerationStore {
  constructor(private readonly adapter: DatabaseAdapter) {}

  async read(tags: readonly string[]): Promise<CacheGenerationSnapshot> {
    const normalized = normalizeCacheTags(tags)
    const result = await this.adapter.execute(read(`SELECT tag, generation FROM cache_generations
      WHERE tag IN (${normalized.map(() => '?').join(', ')})`, normalized))
    const generations = new Map<string, number>()
    for (const row of result.rows) {
      const parsed = parseGeneration(row)
      if (!normalized.includes(parsed.tag) || generations.has(parsed.tag)) throw new CacheError('CACHE_PROTOCOL', 'Cache generation query returned an unexpected row')
      generations.set(parsed.tag, parsed.generation)
    }
    return { generations }
  }

  async bump(tags: readonly string[], at = new Date().toISOString()): Promise<CacheGenerationSnapshot> {
    const normalized = normalizeCacheTags(tags)
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(at) || !Number.isFinite(Date.parse(at)) || new Date(at).toISOString() !== at) throw new CacheError('CACHE_INPUT', 'Invalid cache invalidation timestamp')
    const values = normalized.map(() => '(?, 1, ?)').join(', ')
    const params = normalized.flatMap(tag => [tag, at])
    const result = await this.adapter.execute(write(`INSERT INTO cache_generations (tag, generation, updated_at)
      VALUES ${values}
      ON CONFLICT(tag) DO UPDATE SET
        generation = cache_generations.generation + 1,
        updated_at = CASE WHEN cache_generations.updated_at >= excluded.updated_at
          THEN strftime('%Y-%m-%dT%H:%M:%fZ', cache_generations.updated_at, '+0.001 seconds')
          ELSE excluded.updated_at END
      RETURNING tag, generation`, params, true))
    if (result.rows.length !== normalized.length) throw new CacheError('CACHE_PROTOCOL', 'Cache invalidation did not update every tag')
    const generations = new Map<string, number>()
    for (const row of result.rows) {
      const parsed = parseGeneration(row)
      if (!normalized.includes(parsed.tag) || generations.has(parsed.tag)) throw new CacheError('CACHE_PROTOCOL', 'Cache invalidation returned an unexpected row')
      generations.set(parsed.tag, parsed.generation)
    }
    if (generations.size !== normalized.length) throw new CacheError('CACHE_PROTOCOL', 'Cache invalidation result is incomplete')
    return { generations }
  }
}
