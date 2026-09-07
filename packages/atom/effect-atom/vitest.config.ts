import { inlineSchemaTests } from '@systemfsoftware/effect-schema-vite'
import { defineConfig, sharedConfig } from '@systemfsoftware/vitest-config'

export default defineConfig({
  ...sharedConfig,
  plugins: [inlineSchemaTests()],
  test: {
    include: ['./tests/**/*.test.ts', 'src/schema-laws.test.ts'],
    includeSource: ['src/**/*.ts'],
    globals: true,
    pool: 'forks',
    coverage: {
      ...sharedConfig.test?.coverage,
      exclude: ['src/**/*.test.ts'],
    },
  },
  resolve: {
    conditions: ['@systemfsoftware/source', 'source', 'import', 'node', 'default'],
  },
})
