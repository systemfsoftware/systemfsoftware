import { defineConfig, sharedConfig } from '@systemfsoftware/vitest-config'

export default defineConfig({
  ...sharedConfig,
  test: {
    ...sharedConfig.test,
    name: 'bin',
    include: ['tests/bin/**/*.test.ts'],
    includeSource: [],
  },
})
