import { defineConfig, sharedConfig } from '@systemfsoftware/vitest-config'

export default defineConfig({
  ...sharedConfig,
  test: {
    ...sharedConfig.test,
    include: ['tests/**/*.integration.test.ts'],
    globalSetup: ['./global-setup.ts'],

    passWithNoTests: false,

    includeSource: [],
    coverage: { enabled: false },

    testTimeout: 75_000,
    teardownTimeout: 30_000,
  },
})
