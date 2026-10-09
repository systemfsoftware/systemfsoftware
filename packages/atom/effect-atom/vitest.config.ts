import { inlineSchemaTests } from '@systemfsoftware/effect-schema-vite'
import { vitestFork } from '@systemfsoftware/vitest/plugin'
import { playwright } from '@vitest/browser-playwright'
import { defaultClientConditions, defaultServerConditions } from 'vite'
import { configDefaults, defineConfig } from 'vitest/config'
import { nodeTest } from './vitest.node.config.js'

export default defineConfig({
  plugins: [inlineSchemaTests(), vitestFork()],
  resolve: { conditions: ['@systemfsoftware/source', ...defaultClientConditions] },
  ssr: { resolve: { conditions: ['@systemfsoftware/source', ...defaultServerConditions] } },
  test: {
    includeSource: ['src/**/*.{js,ts}'],
    exclude: [...configDefaults.exclude, '**/.stryker-tmp/**'],
    passWithNoTests: true,
    testTimeout: 30_000,
    silent: 'passed-only',
    coverage: {
      provider: 'istanbul',
      reporter: ['json', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts'],
    },
    projects: [
      {
        extends: true,
        test: {
          ...nodeTest,
          setupFiles: ['@systemfsoftware/vitest/guard'],
        },
      },
      {
        extends: true,
        test: {
          name: 'browser',
          include: ['./tests/browser/**/*.test.ts'],
          setupFiles: ['@systemfsoftware/vitest/guard'],
          browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
  },
})
