import { sharedConfig } from '@systemfsoftware/stryker-config'
import { defineConfig } from '@systemfsoftware/stryker-js/config'

export default defineConfig({
  ...sharedConfig,
  testRunner: {
    plugin: import.meta.resolve('@systemfsoftware/stryker-js-vitest-runner'),
    options: { configFile: 'vitest.config.ts', dir: '.', related: true },
  },
  checkers: [
    {
      plugin: import.meta.resolve('@systemfsoftware/stryker-js-typescript-checker'),
      options: { prioritizePerformanceOverAccuracy: true },
    },
  ],
  plugins: [
    import.meta.resolve('@systemfsoftware/stryker-test-contribution'),
  ],
  mutate: [
    'src/rules/**/*.ts',
    '!src/rules/__tests__/**',
    '!src/rules/**/*.config.ts',
  ],
  thresholds: { high: 100, low: 100, break: 100 },
})
