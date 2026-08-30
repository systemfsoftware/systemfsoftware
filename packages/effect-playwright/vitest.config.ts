import { defineConfig, sharedConfig } from '@systemfsoftware/vitest-config'

export default defineConfig({
  ...sharedConfig,
  test: {
    ...sharedConfig.test,
    include: ['tests/**/*.integration.test.ts'],
    includeSource: ['src/**/*.ts'],
    sequence: {
      concurrent: true,
    },
    slowTestThreshold: 2000,
  },
})
