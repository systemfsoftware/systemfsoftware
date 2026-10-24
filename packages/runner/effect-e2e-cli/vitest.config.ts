import { inlineSchemaTests } from '@systemfsoftware/effect-schema-vite'
import { defineConfig, sharedConfig } from '@systemfsoftware/vitest-config'

export default defineConfig({
  ...sharedConfig,
  plugins: [inlineSchemaTests()],
  test: {
    ...sharedConfig.test,
    name: 'unit',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    exclude: [...(sharedConfig.test?.exclude ?? []), 'tests/__fixtures__/**', '.scratch/**'],
    includeSource: ['src/**/*.ts'],
    // Scenarios spawn the built bin, oxlint and tsc as child processes.
    testTimeout: 60_000,
  },
})
