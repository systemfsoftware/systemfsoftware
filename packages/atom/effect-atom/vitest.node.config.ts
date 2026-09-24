import { inlineSchemaTests } from '@systemfsoftware/effect-schema-vite'
import { defineConfig, sharedConfig } from '@systemfsoftware/vitest-config'

/**
 * The node test project. `vitest.config.ts` runs it beside the browser project;
 * Stryker runs it alone, because the propagation engine it mutates is specified
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

export default defineConfig({
  ...sharedConfig,
  plugins: [inlineSchemaTests()],
  test: {
    ...sharedConfig.test,
    ...nodeTest,
  },
})
