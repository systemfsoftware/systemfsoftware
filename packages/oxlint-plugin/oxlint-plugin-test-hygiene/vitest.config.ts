import { defineConfig, sharedConfig } from '@systemfsoftware/vitest-config'

const config = {
  ...sharedConfig,
  test: {
    ...sharedConfig.test,
    include: ['src/**/*.test.ts'],
    setupFiles: ['vitest-setup.ts'],
    bail: 0 as const,
  },
}

export default defineConfig(config)
