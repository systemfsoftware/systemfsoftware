import { defineConfig, sharedConfig } from '@systemfsoftware/vitest-config'

export default defineConfig({
  ...sharedConfig,
  test: {
    ...sharedConfig.test,
    include: ['tests/**/*.integration.test.ts'],
    // Every feature starts nested Vitest servers of its own, so the per-test budget in the shared
    // config (8-30s) covers one test body only after the nested run inside it has finished.
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
})
