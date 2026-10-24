import { defineConfig, sharedConfig } from '@systemfsoftware/vitest-config'

export default defineConfig({
  ...sharedConfig,
  test: {
    ...sharedConfig.test,
    name: 'unit',
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/bin/**'],
    includeSource: ['src/**/*.ts'],
  },
})
