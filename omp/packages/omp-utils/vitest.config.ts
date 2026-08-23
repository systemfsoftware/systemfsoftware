import { inlineSchemaTests } from '@systemfsoftware/effect-schema-vite'
import { defineConfig, sharedConfig } from '@systemfsoftware/vitest-config'

export default defineConfig({
  ...sharedConfig,
  plugins: [inlineSchemaTests()],
  test: {
    ...sharedConfig.test,
    root: import.meta.dirname,
    include: ['tests/**/*.test.ts', 'src/schema-laws.test.ts'],
    includeSource: ['src/**/*.ts'],
    pool: 'forks',
  },
  resolve: {
    conditions: ['@systemfsoftware/source'],
  },
})
