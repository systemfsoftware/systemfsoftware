import { inlineSchemaTests } from '@systemfsoftware/effect-schema-vite'
import { vitestFork } from '@systemfsoftware/vitest/plugin'
import { defaultClientConditions, defaultServerConditions } from 'vite'
import { configDefaults, defineConfig } from 'vitest/config'

/**
 * The node test project. `vitest.config.ts` runs it beside the browser project;
 * Stryker runs it alone, because the decision modules it mutates are specified
 * by node tests and the CI mutation job installs no browser.
 */
export const nodeTest: {
  readonly name: string
  readonly include: string[]
  readonly pool: 'forks'
  readonly environment: 'node'
} = {
  name: 'node',
  include: ['./tests/**/*.test.ts', './src/**/*.test.ts', '!./tests/browser/**'],
  pool: 'forks',
  environment: 'node',
}

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
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: [...nodeTest.include, `!${conformance}`],
          includeSource: ['src/**/*.{js,ts}'],
        },
      },
      ...(prLane ? [] : [{ extends: true, test: { name: 'conformance', include: [conformance] } }]),
    ],
  },
})
