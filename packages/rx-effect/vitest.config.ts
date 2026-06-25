import { defineConfig, sharedConfig } from '@systemfsoftware/vitest-config'

export default defineConfig({
  ...sharedConfig,
  test: {
    ...sharedConfig.test,
    testTimeout: process.env.CI ? 60_000 : 30_000,
    include: ['src/**/*.test.ts'],
    setupFiles: ['./vitest-setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/mod.ts'],
    },
  },
})
