import { defaultClientConditions, defaultServerConditions } from 'vite'

export { defineConfig } from 'vitest/config'

// Workspace packages expose their source under this condition in `exports`, so a
// test resolves a sibling's `src/` instead of a `dist/` this run may not have built.
// Both pipelines need it: node-environment tests resolve through the SSR resolver,
// while browser tests use the client one. Vite replaces the default conditions when
// they are set, so the defaults are spread back in rather than dropped.
export const sourceCondition = '@systemfsoftware/source'

// AGENT outranks CI. This repo's agent shell sets both, so a CI-first reading
// gives every agent run the thorough forge treatment - tenfold property draws
// and coverage - for work that wants fast feedback. An agent run is a dev run.
const isAgent = process.env['AGENT'] !== undefined

// Presence, not equality: GitHub Actions writes "true" and the agent shell
// writes "1", so testing against either value classifies the other as local.
export const isCI = !isAgent && typeof process.env['CI'] === 'string' && process.env['CI'].length > 0

const sharedTestTimeout = isCI ? 30_000 : isAgent ? 15_000 : 8_000

// One tier table decides how many draws every property gets: a Stryker worker wants fast mutant runs,
// CI wants the thorough tier, and a local run sits between them. The fork merges this over its own
// `runs: 100` unless a property sets its own.
const propertyRuns = process.env['STRYKER_MUTATOR_WORKER'] !== undefined ? 30 : isCI ? 1000 : 100

// The fork reads these under `inject`; the key is its published `ProvidedContext` key.
const propertyCheckDefaults = { runs: propertyRuns }

/**
 * Spread into a `defineConfig` object that does not use `sharedConfig` as a whole.
 * Both pipelines need the condition, and Vite replaces its defaults when they are set.
 * @type {import('vitest/config').ViteUserConfig}
 */
export const sourceResolveConditions = {
  resolve: { conditions: [...defaultClientConditions, sourceCondition] },
  ssr: { resolve: { conditions: [...defaultServerConditions, sourceCondition] } },
}

/**
 * @type {import('vitest/config').ViteUserConfig}
 */
export const sharedConfig = {
  ...sourceResolveConditions,
  // Effect v3's `effect/TestClock` path, which models keep writing, resolves to
  // the fork's compat module; on its virtual time `adjust` lets that much time pass.
  resolve: {
    ...sourceResolveConditions.resolve,
    alias: { 'effect/TestClock': '@effect/vitest/TestClock' },
  },
  test: {
    globals: false,
    environment: 'node',
    includeSource: ['src/**/*.{js,ts}'],
    exclude: ['**/.stryker-tmp/**', '**/node_modules/**', '**/.repo/**'],
    passWithNoTests: true,
    testTimeout: sharedTestTimeout,
    silent: isAgent ? 'passed-only' : false,
    provide: { '@systemfsoftware/vitest:property-check': propertyCheckDefaults },
    ...(isAgent ? { bail: 1 } : {}),
    coverage: {
      enabled: isCI || process.env['COVERAGE'] === 'true',
      provider: 'v8',
      reporter: ['json', 'html', 'lcov'],
    },
  },
}
