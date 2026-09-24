import { defineConfig, sharedConfig } from '@systemfsoftware/vitest-config'

export default defineConfig({
  ...sharedConfig,
  test: {
    ...sharedConfig.test,
    include: ['tests/**/*.contract.test.ts', 'tests/**/*.conformance.test.ts'],
    setupFiles: ['vitest-setup.ts'],
  },
})
