import { defineConfig, sharedConfig } from '@systemfsoftware/vitest-config'

// Upstream's per-package vitest settings at the pin (globals, environment, includes),
// so the imported suites run as upstream runs them.
export default defineConfig({
  ...sharedConfig,
  resolve: { conditions: ['module', 'development', 'browser'] },
  test: {
    ...sharedConfig.test,
    globals: true,
    environment: 'happy-dom',
    include: ['test/**/*.test.{ts,tsx}'],
    server: { deps: { inline: ['@statelyai/inspect'] } },
  },
})
