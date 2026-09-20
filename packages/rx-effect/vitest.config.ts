import { defineConfig, isCI, sharedConfig } from '@systemfsoftware/vitest-config'

const testTimeout = (): number => {
  if (isCI) return 60_000
  return 30_000
}

export default defineConfig({
  ...sharedConfig,
  test: {
    ...sharedConfig.test,
    testTimeout: testTimeout(),
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/mod.ts'],
    },
  },
})
