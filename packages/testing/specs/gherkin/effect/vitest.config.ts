import { defineConfig, sharedConfig } from '@systemfsoftware/vitest-config'

export default defineConfig({
  ...sharedConfig,
  test: {
    ...sharedConfig.test,
    includeSource: ['src/**/*.ts'],
    setupFiles: ['./vitest.setup.ts'],
  },
})
