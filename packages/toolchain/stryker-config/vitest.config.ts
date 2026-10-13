import { sharedConfig } from '@systemfsoftware/vitest-config'
import { defineConfig } from 'vitest/config'

// Vitest's own `defineConfig`, not vitest-config's: that one needs `@systemfsoftware/vitest` declared here for its
// guard, which this package's one Node-only test does not use. The test still takes the shared settings.
export default defineConfig({
  ...sharedConfig,
  test: {
    ...sharedConfig.test,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
