import { defineConfig, sharedConfig } from '@systemfsoftware/vitest-config'

export default defineConfig({
  ...sharedConfig,
  test: {
    ...sharedConfig.test,
    passWithNoTests: false,
    include: ['tests/**/*.integration.test.ts'],
  },
})
