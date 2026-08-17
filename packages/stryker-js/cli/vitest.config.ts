import { defineConfig, sharedConfig } from '@systemfsoftware/vitest-config'

export default defineConfig({
  ...sharedConfig,
  test: {
    ...sharedConfig.test,
    // KTD5: the container lane lives in `tests` under its own config
    // (`test:contract`); the default `test` task stays container-free and
    // covers the relocated unit specs and the in-source property tests.
    include: ['src/**/*.test.ts'],
  },
})
