import { defineConfig, sharedConfig } from '@systemfsoftware/vitest-config'

export default defineConfig({
  ...sharedConfig,
  test: {
    ...sharedConfig.test,
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    exclude: [
      ...(sharedConfig.test?.exclude ?? []),
      '**/.stryker-tmp/**',
      '**/testResources/**',
    ],
    testTimeout: 60000,
    hookTimeout: 60000,
  },
})
