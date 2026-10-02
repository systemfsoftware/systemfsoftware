import { shardMutate, sharedConfig } from '@systemfsoftware/stryker-config'
import { defineConfig, type PartialStrykerOptions } from '@systemfsoftware/stryker-js/config'

// Composite node projects emit declarations, and the inferred `defineConfig` return type is not
// nameable from outside `@systemfsoftware/stryker-js`'s internal chunks (TS2883); naming it here
// keeps the emitted declaration portable.
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
  mutate: shardMutate(['src/**/*.workflow.ts']),
  thresholds: { high: 100, low: 100, break: 100 },
  dryRunTimeoutMinutes: 10,
  ignorePatterns: [],
})

export default config
