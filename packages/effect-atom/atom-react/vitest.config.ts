import { defineConfig, sharedConfig } from '@systemfsoftware/vitest-config'
import { playwright } from '@vitest/browser-playwright'
import * as path from 'node:path'

export default defineConfig({
  ...sharedConfig,
  test: {
    ...sharedConfig.test,
    projects: [
      {
        extends: true,
        test: {
          name: 'browser',
          include: ['./test/**/*.test.{ts,tsx}', '!./test/ssr.test.tsx'],
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
          include: ['./test/ssr.test.tsx'],
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
    alias: {
      '@systemfsoftware/effect-atom/test': path.join(import.meta.dirname, '../atom/test'),
      '@systemfsoftware/effect-atom': path.join(import.meta.dirname, '../atom/src'),
      '@systemfsoftware/effect-atom-react/test': path.join(import.meta.dirname, 'test'),
      '@systemfsoftware/effect-atom-react': path.join(import.meta.dirname, 'src'),
      '@systemfsoftware/effect-gherkin-spec': path.join(import.meta.dirname, '../../effect-gherkin-spec/src/mod.ts'),
    },
  },
})
