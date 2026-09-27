import { defineConfig, sourceResolveConditions } from '@systemfsoftware/vitest-config'

/**
 * The node test project. `vitest.config.ts` runs the Storybook browser project
 * beside it; Stryker runs this one alone, because the errors schema is reached
 * by the node conformance tests and CI's Mutation job installs no browser.
 */
export default defineConfig({
  ...sourceResolveConditions,
  test: {
    passWithNoTests: true,
    environment: 'jsdom',
    globals: true,
    include: ['tests/**/*.test.ts'],
  },
})
