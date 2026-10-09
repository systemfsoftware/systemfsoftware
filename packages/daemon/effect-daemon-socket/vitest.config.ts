import { inlineSchemaTests } from '@systemfsoftware/effect-schema-vite'
import { vitestFork } from '@systemfsoftware/vitest/plugin'
import { defaultClientConditions, defaultServerConditions } from 'vite'
import { configDefaults, defineConfig } from 'vitest/config'

const prLane = process.env['VITEST_LANE'] === 'pr'
const conformance = '**/*.conformance.test.ts'
const CONFORMANCE = 'tests/**/*.conformance.test.ts'

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
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['src/**/*.test.ts', 'tests/**/*.test.ts', ...(prLane ? [`!${conformance}`] : [])],
          exclude: [CONFORMANCE],
          includeSource: ['src/**/*.ts'],
          setupFiles: ['@systemfsoftware/vitest/guard'],
        },
      },
      {
        extends: true,
        test: {
          name: 'conformance',
          include: prLane ? [] : [CONFORMANCE],
          setupFiles: ['@systemfsoftware/vitest/guard'],
        },
      },
    ],
  },
})
