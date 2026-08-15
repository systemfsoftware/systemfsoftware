import { defineConfig, sharedConfig } from '@systemfsoftware/vitest-config'

export default defineConfig({
  ...sharedConfig,
  test: {
    ...sharedConfig.test,
    include: ['src/**/*.test.ts', '__tests__/**/*.test.ts'],
    includeSource: ['src/**/*.ts'],
  },
})
