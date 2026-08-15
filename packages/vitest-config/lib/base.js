export { defineConfig } from 'vitest/config'

// AGENT outranks CI. This repo's agent shell sets both, so a CI-first reading
// gives every agent run the thorough forge treatment - tenfold property draws
// and coverage - for work that wants fast feedback. An agent run is a dev run.
const isAgent = process.env['AGENT'] !== undefined

// Presence, not equality: GitHub Actions writes "true" and the agent shell
// writes "1", so testing against either value classifies the other as local.
export const isCI = !isAgent && typeof process.env['CI'] === 'string' && process.env['CI'].length > 0

const isGithubActions = process.env['GITHUB_ACTIONS'] !== undefined

const sharedTestTimeout = isCI ? 30_000 : isAgent ? 15_000 : 8_000

/**
 * @type {import('vitest/config').ViteUserConfig}
 */
export const sharedConfig = {
  test: {
    globals: true,
    environment: 'node',
    includeSource: ['src/**/*.{js,ts}'],
    exclude: ['**/.stryker-tmp/**', '**/node_modules/**', '**/.repo/**'],
    passWithNoTests: true,
    testTimeout: sharedTestTimeout,
    silent: isAgent ? 'passed-only' : false,
    ...(isAgent ? { bail: 1 } : {}),

    reporters: isGithubActions
      ? ['default', 'github-actions']
      : ['default', ['json', { outputFile: './reports/vitest-output.json' }]],

    coverage: {
      enabled: isCI || process.env['COVERAGE'] === 'true',
      provider: 'v8',
      reporter: ['json', 'html', 'lcov'],
    },
  },
}
