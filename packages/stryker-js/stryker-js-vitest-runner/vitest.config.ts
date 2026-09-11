import { defineConfig, sharedConfig } from '@systemfsoftware/vitest-config'

const sourceConditions = ['@systemfsoftware/source']

export default defineConfig({
  ...sharedConfig,
  resolve: { conditions: sourceConditions },
  ssr: { resolve: { conditions: sourceConditions } },
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
