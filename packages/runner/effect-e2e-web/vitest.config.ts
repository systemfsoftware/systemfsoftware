import { inlineSchemaTests } from '@systemfsoftware/effect-schema-vite'
import { defineConfig, sharedConfig } from '@systemfsoftware/vitest-config'

export default defineConfig({
  ...sharedConfig,
  plugins: [inlineSchemaTests()],
  test: {
    ...sharedConfig.test,
    name: 'unit',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    exclude: [...(sharedConfig.test?.exclude ?? []), 'tests/__fixtures__/**'],
    includeSource: ['src/**/*.ts'],
    // Each scenario launches a real browser, and a missing-locator scenario waits out the
    // engine's action timeout before it can fail.
    testTimeout: 60_000,
  },
})
