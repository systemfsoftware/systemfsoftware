import { shardMutate, sharedConfig } from '@systemfsoftware/stryker-config'

export default {
  ...sharedConfig,
  testRunner: {
    plugin: import.meta.resolve('@systemfsoftware/stryker-js-vitest-runner'),
    options: { configFile: 'vitest.config.ts', dir: '.', related: true },
  },
  ignorers: [import.meta.resolve('@systemfsoftware/stryker-ignorer-effect-schema-declarations')],
  mutate: shardMutate(['src/**/*.workflow.ts']),
}
