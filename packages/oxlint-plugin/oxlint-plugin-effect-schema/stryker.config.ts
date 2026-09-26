import { shardMutate, sharedConfig } from '@systemfsoftware/stryker-config'
import { defineConfig, type PartialStrykerOptions } from '@systemfsoftware/stryker-js/config'

const config: PartialStrykerOptions = defineConfig({
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
  mutate: shardMutate([
    'src/rules/**/*.ts',
    '!src/rules/__tests__/**',
    '!src/rules/**/*.config.ts',
  ]),
  thresholds: { high: 100, low: 100, break: 100 },
})

export default config
