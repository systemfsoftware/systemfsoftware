export { defineConfig } from 'vitest/config'

const isCI = process.env['CI'] === 'true' || process.env['GITHUB_ACTIONS'] !== undefined

const isAgent = !isCI && !process.stdout.isTTY

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

    reporters: (isCI
      ? ['default', 'github-actions']
      : ['default', ['json', { outputFile: './reports/vitest-output.json' }]]),

    coverage: {
      enabled: isCI || process.env['COVERAGE'] === 'true',
      provider: 'v8',
      reporter: ['json', 'html', 'lcov'],
    },
  },
}
