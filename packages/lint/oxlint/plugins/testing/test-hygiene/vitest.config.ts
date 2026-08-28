import { defineConfig, sharedConfig } from '@systemfsoftware/vitest-config'

const config = {
  ...sharedConfig,
  test: {
    ...sharedConfig.test,
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    setupFiles: ['vitest-setup.ts'],
    bail: 0 as const,
  },
  resolve: {
    conditions: ['@systemfsoftware/source', 'source', 'import', 'node', 'default'],
  },
}

export default defineConfig(config)
