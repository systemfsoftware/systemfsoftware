import { defineConfig, sharedConfig } from '@systemfsoftware/vitest-config'

export default defineConfig({
  ...sharedConfig,
  test: {
    ...sharedConfig.test,
    include: ['src/**/*.test.ts'],
    setupFiles: [sharedConfig.test?.setupFiles ?? [], './vitest-setup.ts'].flat(),
  },
})
