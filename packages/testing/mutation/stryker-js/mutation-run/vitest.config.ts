import { defineConfig, sharedConfig } from '@systemfsoftware/vitest-config'

export default defineConfig({
  ...sharedConfig,
  test: {
    ...sharedConfig.test,
    // The behaviour lane lives in `tests` as Gherkin integration features;
    // in-source unit tests run through `import.meta.vitest` blocks.
    include: ['tests/**/*.integration.test.ts'],

    includeSource: ['src/**/*.ts'],
  },
})
