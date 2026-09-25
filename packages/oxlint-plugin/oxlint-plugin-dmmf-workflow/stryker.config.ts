import { shardMutate, sharedConfig } from '@systemfsoftware/stryker-config'
import { type PartialStrykerOptions, StrykerConfig } from '@systemfsoftware/stryker-js/config'

const config: PartialStrykerOptions = StrykerConfig.define({
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
    'src/rules/*.ts',
    '!src/rules/**/*.test.ts',
    '!src/rules/*.config.ts',
  ]),
})

export default config
