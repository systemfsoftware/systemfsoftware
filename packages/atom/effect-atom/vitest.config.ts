import { inlineSchemaTests } from '@systemfsoftware/effect-schema-vite'
import { defineConfig, sharedConfig } from '@systemfsoftware/vitest-config'

export default defineConfig({
  ...sharedConfig,
  plugins: [inlineSchemaTests()],
  test: {
    ...sharedConfig.test,
    include: ['./tests/**/*.test.ts', 'src/schema-laws.test.ts'],
    pool: 'forks',
    coverage: {
      ...sharedConfig.test?.coverage,
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts'],
    },
  },
  resolve: {
    conditions: ['@systemfsoftware/source', 'source', 'import', 'node', 'default'],
  },
})
