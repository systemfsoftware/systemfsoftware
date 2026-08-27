import { inlineRefutationCoverage } from '@systemfsoftware/effect-schema-refutation-vite'
import { inlineSchemaTests } from '@systemfsoftware/effect-schema-vite'
import { defineConfig, sharedConfig } from '@systemfsoftware/vitest-config'

export default defineConfig({
  ...sharedConfig,
  plugins: [inlineSchemaTests(), inlineRefutationCoverage()],
  test: {
    ...sharedConfig.test,
    include: [
      'tests/**/*.test.ts',
      'src/**/*.property.test.ts',
      'src/**/schema-laws.test.ts',
      'src/**/schema-refutations.test.ts',
    ],
  },
  resolve: {
    conditions: ['@systemfsoftware/source'],
  },
})
