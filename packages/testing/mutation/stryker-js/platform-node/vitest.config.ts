import { defineConfig, sharedConfig } from '@systemfsoftware/vitest-config'

export default defineConfig({
  test: {
    ...sharedConfig.test,
    include: ['tests/**/*.integration.test.ts', 'src/**/__tests__/*.test.ts'],
    includeSource: ['src/**/*.ts'],
  },
  resolve: {
    conditions: ['@systemfsoftware/source', 'source', 'import', 'node', 'default'],
  },
})
