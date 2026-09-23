import { sharedConfig } from '@systemfsoftware/stryker-config'
import { defineConfig, type StrykerConfig } from '@systemfsoftware/stryker-js/config'

const config: StrykerConfig = defineConfig({
  ...sharedConfig,
  testRunner: {
    plugin: import.meta.resolve('@systemfsoftware/stryker-js-vitest-runner'),
    options: { configFile: 'vitest.config.ts', dir: '.' },
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
  mutate: [
    'src/rules/*.ts',
    '!src/rules/**/*.test.ts',
    '!src/rules/*.config.ts',
  ],
  coverageAnalysis: 'perTest',
})

export default config
