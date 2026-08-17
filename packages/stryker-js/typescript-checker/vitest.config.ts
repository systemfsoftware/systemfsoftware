import { defineConfig, sharedConfig } from '@systemfsoftware/vitest-config'

export default defineConfig({
  ...sharedConfig,
  test: {
    ...sharedConfig.test,
    include: ['tests/**/*.integration.test.ts'],
    exclude: [
      '**/node_modules/**',
      '**/.stryker-tmp/**',
      '**/testResources/**',
    ],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
})
