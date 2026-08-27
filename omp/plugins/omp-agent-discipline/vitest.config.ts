import { inlineRefutationCoverage } from '@systemfsoftware/effect-schema-refutation-vite'
import { inlineSchemaTests } from '@systemfsoftware/effect-schema-vite'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [inlineSchemaTests(), inlineRefutationCoverage()],
  test: {
    globals: true,
    root: import.meta.dirname,
    include: [
      'tests/**/*.test.ts',
      'src/**/*.property.test.ts',
      'src/**/schema-laws.test.ts',
      'src/**/schema-refutations.test.ts',
    ],
    includeSource: ['src/**/*.ts'],
    testTimeout: 30000,
  },
  resolve: {
    conditions: ['@systemfsoftware/source'],
  },
})
