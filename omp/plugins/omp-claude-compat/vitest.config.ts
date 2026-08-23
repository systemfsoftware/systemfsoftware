import { inlineSchemaTests } from '@systemfsoftware/effect-schema-vite'
import { defineConfig } from '@systemfsoftware/vitest-config'

export default defineConfig({
  plugins: [inlineSchemaTests()],
  test: {
    globals: true,
    root: import.meta.dirname,
    include: ['tests/**/*.test.ts', 'src/**/*.property.test.ts', 'src/schema-laws.test.ts'],
    includeSource: ['src/**/*.ts'],
    update: 'none',
    testTimeout: 300_000,
  },
  resolve: {
    conditions: ['@systemfsoftware/source'],
  },
})
