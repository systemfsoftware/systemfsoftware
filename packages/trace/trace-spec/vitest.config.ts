import { vitestFork } from '@systemfsoftware/vitest/plugin'
import { defaultClientConditions } from 'vite'
import { configDefaults, defineConfig } from 'vitest/config'

const prLane = process.env['VITEST_LANE'] === 'pr'
const conformance = '**/*.conformance.test.ts'

export default defineConfig({
  plugins: [vitestFork()],
  resolve: { conditions: ['@systemfsoftware/source', ...defaultClientConditions] },
  ssr: { resolve: { conditions: ['@systemfsoftware/source', 'node', 'development|production'] } },
  test: {
    include: [],
    includeSource: [],
    exclude: [...configDefaults.exclude, '**/.stryker-tmp/**'],
    setupFiles: ['@systemfsoftware/vitest/guard'],
    passWithNoTests: false,
    testTimeout: 30_000,
    silent: 'passed-only',
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['src/**/*.test.ts', 'tests/**/*.test.ts', `!${conformance}`],
          includeSource: ['src/**/*.ts'],
        },
      },
      // The pull-request lane leaves the conformance files out.
      ...(prLane ? [] : [{ extends: true, test: { name: 'conformance', include: [conformance] } }]),
    ],
  },
})
