import { inlineSchemaTests } from '@systemfsoftware/effect-schema-vite'
import { defineConfig, sharedConfig } from '@systemfsoftware/vitest-config'

export default defineConfig({
  ...sharedConfig,
  plugins: [inlineSchemaTests()],
  test: {
    ...sharedConfig.test,
    root: import.meta.dirname,
    include: ['tests/**/*.test.ts', 'src/**/*.property.test.ts', 'src/schema-laws.test.ts'],
    includeSource: ['src/**/*.ts'],
    testTimeout: 300_000,
  },
  resolve: {
    conditions: ['@systemfsoftware/source'],
  },
})
