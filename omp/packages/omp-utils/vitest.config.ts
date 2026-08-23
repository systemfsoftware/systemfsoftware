import { inlineSchemaTests } from '@systemfsoftware/effect-schema-vite'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [inlineSchemaTests({ refutationCoverage: true })],
  test: {
    globals: true,
    root: import.meta.dirname,
    include: ['tests/**/*.test.ts', 'src/schema-laws.test.ts'],
    includeSource: ['src/**/*.ts'],
    pool: 'forks',
  },
  resolve: {
    conditions: ['@systemfsoftware/source'],
  },
})
