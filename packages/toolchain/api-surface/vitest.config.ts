import { defineConfig, sharedConfig } from '@systemfsoftware/vitest-config'

export default defineConfig({
  ...sharedConfig,
  test: {
    ...sharedConfig.test,
    include: ['tests/**/*.test.ts', 'src/__tests__/**/*.test.ts'],
    includeSource: ['src/**/*.ts'],
  },
})
