import { defineVitestConfig } from '@nuxt/test-utils/config'

export default defineVitestConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.spec.ts'],
    reporters: ['default'],
    server: { deps: { inline: [/element-plus/] } },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['shared/**/*.ts', 'server/utils/health.ts'],
      thresholds: {
        lines: 90,
        functions: 90,
        statements: 90,
        branches: 85
      }
    },
  },
})
