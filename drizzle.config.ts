import { defineConfig } from 'drizzle-kit'

// Candidate migrations only: never point Drizzle push at production D1/SQLite.
export default defineConfig({
  dialect: 'sqlite',
  schema: ['./db/schema.ts', './db/security-schema.ts', './db/cache-schema.ts', './db/interaction-schema.ts'],
  out: './.tmp/drizzle-candidates',
  strict: true,
  verbose: true,
})
