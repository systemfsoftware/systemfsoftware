import { defineConfig, sharedConfig } from '@systemfsoftware/vitest-config'

export default defineConfig({
  test: {
    ...sharedConfig.test,
    include: ['tests/**/*.integration.test.ts', 'tests/**/*.test.ts', 'src/**/__tests__/*.test.ts'],
    includeSource: ['src/**/*.ts'],
    testTimeout: 60_000,
  },
  resolve: {
    conditions: ['@systemfsoftware/source', 'source', 'import', 'node', 'default'],
  },
})
