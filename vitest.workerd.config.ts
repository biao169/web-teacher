import { fileURLToPath } from 'node:url'
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin'
import { defineConfig } from 'vitest/config'

// Test-only local bindings. Never reads account IDs or uses the deployment Wrangler file.
export default defineConfig({
  plugins: [cloudflareTest(async () => ({
    miniflare: {
      compatibilityDate: '2026-08-27',
      compatibilityFlags: ['nodejs_compat'],
      d1Databases: ['DB'],
      bindings: {
        TEST_MIGRATIONS: await readD1Migrations(fileURLToPath(new URL('./migrations', import.meta.url))),
      },
    },
  }))],
  test: {
    include: ['tests/workerd/**/*.spec.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    reporters: ['default'],
  },
})
