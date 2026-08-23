import { defineConfig, sharedConfig } from '@systemfsoftware/vitest-config'

export default defineConfig({
  ...sharedConfig,
  test: {
    ...sharedConfig.test,
    include: ['src/**/*.test.ts'],
    coverage: {
      ...sharedConfig.test?.coverage,
      provider: 'v8',
    },
  },
})
