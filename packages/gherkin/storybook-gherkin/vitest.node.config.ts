import { vitestFork } from '@systemfsoftware/vitest/plugin'
import { defaultClientConditions, defaultServerConditions } from 'vite'
import { defineConfig } from 'vitest/config'

const prLane = process.env['VITEST_LANE'] === 'pr'
const conformance = '**/*.conformance.test.ts'

/**
 * The node test project. `vitest.config.ts` runs the Storybook browser project
 * beside it; Stryker runs this one alone, because the errors schema is reached
 * by the node conformance tests and CI's Mutation job installs no browser.
 */
export default defineConfig({
  plugins: [vitestFork()],
  resolve: { conditions: ['@systemfsoftware/source', ...defaultClientConditions] },
  ssr: { resolve: { conditions: ['@systemfsoftware/source', ...defaultServerConditions] } },
  test: {
    include: [],
    includeSource: [],
    setupFiles: ['@systemfsoftware/vitest/guard'],
    passWithNoTests: true,
    environment: 'jsdom',
    globals: true,
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['tests/**/*.test.ts', `!${conformance}`],
        },
      },
      ...(prLane ? [] : [{ extends: true, test: { name: 'conformance', include: [conformance], includeSource: [] } }]),
    ],
  },
})
