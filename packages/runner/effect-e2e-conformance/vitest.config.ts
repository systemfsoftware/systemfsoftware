import { defineConfig, sharedConfig } from '@systemfsoftware/vitest-config'

export default defineConfig({
  ...sharedConfig,
  test: {
    ...sharedConfig.test,
    include: ['tests/**/*.integration.test.ts'],
    exclude: [...(sharedConfig.test?.exclude ?? []), 'tests/__fixtures__/**'],
    testTimeout: 60_000,
  },
})
