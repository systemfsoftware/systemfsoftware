import { inlineSchemaTests } from '@systemfsoftware/effect-schema-vite'
import { vitestFork } from '@systemfsoftware/vitest/plugin'
import { defaultClientConditions, defaultServerConditions } from 'vite'
import { configDefaults, defineConfig } from 'vitest/config'

/**
 * The node test project. `vitest.config.ts` runs it beside the browser project;
 * Stryker runs it alone, because the CI mutation job installs no browser.
 */
export const nodeTest: {
  readonly name: string
  readonly include: string[]
  readonly pool: 'forks'
  readonly environment: 'node'
} = {
  name: 'node',
  include: [
    './tests/ssr.integration.test.ts',
    './src/**/*.test.ts',
    './src/__tests__/*.workflow.property.test.ts',
  ],
  pool: 'forks',
  environment: 'node',
}

export default defineConfig({
  plugins: [inlineSchemaTests(), vitestFork()],
  resolve: { conditions: ['@systemfsoftware/source', ...defaultClientConditions] },
  ssr: { resolve: { conditions: ['@systemfsoftware/source', ...defaultServerConditions] } },
  test: {
    name: 'node',
    include: [...nodeTest.include],
    includeSource: ['src/**/*.{js,ts}'],
    exclude: [...configDefaults.exclude, '**/.stryker-tmp/**'],
    setupFiles: ['@systemfsoftware/vitest/guard'],
    passWithNoTests: true,
    testTimeout: 30_000,
    silent: 'passed-only',
  },
})
