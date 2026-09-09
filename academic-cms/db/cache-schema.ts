import { check, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

export const cacheGenerations = sqliteTable('cache_generations', {
  tag: text('tag').primaryKey(),
  generation: integer('generation').notNull().default(1),
  updated_at: text('updated_at').notNull().default(sql.raw("(strftime('%Y-%m-%dT%H:%M:%fZ','now'))")),
}, table => [
  check('ck_cache_generations_tag', sql.raw("length(trim(\"tag\")) > 0 AND length(\"tag\") <= 128")),
  check('ck_cache_generations_generation', sql.raw('"generation" >= 1 AND "generation" <= 9007199254740990')),
  check('ck_cache_generations_updated_at', sql.raw("length(\"updated_at\") = 24 AND COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', \"updated_at\", '+0 seconds') = \"updated_at\", 0)")),
])
