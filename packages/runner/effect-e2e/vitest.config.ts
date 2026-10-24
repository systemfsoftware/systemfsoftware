import { inlineSchemaTests } from '@systemfsoftware/effect-schema-vite'
import { defineConfig, sharedConfig } from '@systemfsoftware/vitest-config'

export default defineConfig({
  ...sharedConfig,
  plugins: [inlineSchemaTests({ runs: { MergeReports: 150 } })],
  test: {
    ...sharedConfig.test,
    name: 'unit',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    includeSource: ['src/**/*.ts'],
  },
})
