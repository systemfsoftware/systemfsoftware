import { defineConfig, sharedConfig } from '@systemfsoftware/vitest-config'
import { playwright } from '@vitest/browser-playwright'

export default defineConfig({
  ...sharedConfig,
  test: {
    ...sharedConfig.test,
    projects: [
      {
        extends: true,
        test: {
          name: 'browser',
          include: ['./tests/**/*.integration.test.ts', '!./tests/ssr.integration.test.ts'],
          setupFiles: ['./vitest-setup.ts'],
          browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            instances: [{ browser: 'chromium' }],
          },
        },
      },
      {
        extends: true,
        test: {
          name: 'node',
          include: ['./tests/ssr.integration.test.ts', './tests/surface.snapshot.test.ts'],
          environment: 'node',
        },
      },
    ],
    coverage: {
      ...sharedConfig.test?.coverage,
      provider: 'istanbul',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}'],
    },
  },
  resolve: {
    conditions: ['@systemfsoftware/source', 'source', 'import', 'node', 'default'],
  },
})
