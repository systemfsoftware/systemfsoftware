import { shardMutate, sharedConfig } from '@systemfsoftware/stryker-config'
import { defineConfig, type PartialStrykerOptions } from '@systemfsoftware/stryker-js/config'

// KTD13: mutation aims at the whole `src/**` of a driver package, and a driver's
// shell is observable only against its oracle — so the runner points at the
// contract config, where the loopback fixture and the conformance catalogue are
// what kill a mutant.
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
  ignorers: [
    import.meta.resolve('@systemfsoftware/stryker-ignorer-effect-schema-declarations'),
    import.meta.resolve('@systemfsoftware/stryker-ignorer-in-source-vitest-block'),
  ],
  plugins: [
    import.meta.resolve('@systemfsoftware/stryker-test-contribution'),
  ],
  mutate: shardMutate([
    'src/**/*.ts',
    '!src/**/*.test.ts',
    '!src/**/*.property.test.ts',
    '!src/**/*.d.ts',
    '!src/**/__tests__/**',
  ]),
  thresholds: { high: 100, low: 100, break: 100 },
  dryRunTimeoutMinutes: 10,
  ignorePatterns: [],
})

export default config
