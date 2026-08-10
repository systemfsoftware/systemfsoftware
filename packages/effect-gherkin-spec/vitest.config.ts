import { defineConfig, sharedConfig } from '@systemfsoftware/vitest-config'

export default defineConfig({
  ...sharedConfig,
  test: {
    ...sharedConfig.test,
    include: ['__tests__/**/*.test.ts'],
    includeSource: ['src/**/*.ts'],
    setupFiles: ['./vitest.setup.ts'],
  },
})
