import { sharedConfig } from '@systemfsoftware/vitest-config'
import { defineConfig } from 'vitest/config'

// Vitest's own `defineConfig`, not vitest-config's: that one needs `@systemfsoftware/vitest` declared
// here for its guard, and the fork builds with this package's `quietBuild`, so the declaration would
// close a build cycle. The tests still take the shared settings, the per-test timeout among them.
export default defineConfig({
  ...sharedConfig,
  test: {
    ...sharedConfig.test,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
