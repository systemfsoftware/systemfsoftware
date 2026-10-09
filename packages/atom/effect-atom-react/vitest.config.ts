import { inlineSchemaTests } from '@systemfsoftware/effect-schema-vite'
import { vitestFork } from '@systemfsoftware/vitest/plugin'
import { playwright } from '@vitest/browser-playwright'
import { defaultClientConditions, defaultServerConditions } from 'vite'
import { configDefaults, defineConfig } from 'vitest/config'

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
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}'],
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'browser',
          include: ['./tests/**/*.integration.test.ts', '!./tests/ssr.integration.test.ts'],
          setupFiles: ['@systemfsoftware/vitest/guard'],
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
          include: ['./tests/ssr.integration.test.ts', './src/**/*.test.ts'],
          setupFiles: ['@systemfsoftware/vitest/guard'],
        },
      },
    ],
  },
})
