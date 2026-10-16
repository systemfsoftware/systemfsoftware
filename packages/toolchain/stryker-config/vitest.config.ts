import { defineConfig, sharedConfig } from '@systemfsoftware/vitest-config'

export default defineConfig({
  ...sharedConfig,
  test: {
    ...sharedConfig.test,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
