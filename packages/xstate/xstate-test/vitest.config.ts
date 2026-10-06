import { defineConfig, sharedConfig } from '@systemfsoftware/vitest-config'

// Upstream's per-package vitest settings at the pin (globals, environment, includes),
// so the imported suites run as upstream runs them.
export default defineConfig({
  ...sharedConfig,
  test: {
    ...sharedConfig.test,
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
})
