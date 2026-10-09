import { inlineSchemaTests } from '@systemfsoftware/effect-schema-vite'
import { vitestFork } from '@systemfsoftware/vitest/plugin'
import { defaultClientConditions, defaultServerConditions } from 'vite'
import { configDefaults, defineConfig } from 'vitest/config'

const prLane = process.env['VITEST_LANE'] === 'pr'
const conformance = '**/*.conformance.test.ts'

export default defineConfig({
  plugins: [inlineSchemaTests(), vitestFork()],
  resolve: { conditions: ['@systemfsoftware/source', ...defaultClientConditions] },
  ssr: { resolve: { conditions: ['@systemfsoftware/source', ...defaultServerConditions] } },
  test: {
    include: [],
    includeSource: [],
    exclude: [...configDefaults.exclude, '**/.stryker-tmp/**'],
    setupFiles: ['@systemfsoftware/vitest/guard'],
    passWithNoTests: true,
    testTimeout: 30_000,
    silent: 'passed-only',
    coverage: {
      provider: 'v8',
      reporter: ['json', 'html', 'lcov'],
      enabled: true,
      include: ['src/**/*.ts'],
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100,
      },
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['src/**/*.test.ts', 'tests/**/*.test.ts', `!${conformance}`],
          includeSource: ['src/**/*.ts'],
        },
      },
      ...(prLane ? [] : [{ extends: true, test: { name: 'conformance', include: [conformance] } }]),
    ],
  },
})
