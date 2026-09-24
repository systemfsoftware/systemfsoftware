import { defaultClientConditions, defaultServerConditions } from 'vite'
import { defineConfig as defineVitestConfig } from 'vitest/config'

import { CONFORMANCE_SETUP, conformanceCoverage } from './conformance-coverage.js'

/** @typedef {import('vitest/config').ViteUserConfig} ViteUserConfig */
/** @typedef {NonNullable<ViteUserConfig['test']>} TestConfig */
/** @typedef {NonNullable<TestConfig['projects']>} Projects */

/**
 * @param {TestConfig | undefined} test
 * @returns {TestConfig}
 */
const withConformanceSetup = (test) => {
  const setupFiles = test?.setupFiles === undefined ? [] : [test.setupFiles].flat()
  return { ...test, globals: true, setupFiles: [...setupFiles, CONFORMANCE_SETUP] }
}

/**
 * An inline project gets the setup file itself: vitest does not carry the
 * root's setup files into `test.projects`, and a project without it records
 * sites but never hands them to the reporter.
 * @param {unknown} project
 * @returns {unknown}
 */
const projectWithSetup = (project) => {
  if (typeof project !== 'object' || project === null || !('test' in project)) return project
  return { ...project, test: withConformanceSetup(/** @type {TestConfig | undefined} */ (project.test)) }
}

/**
 * Vitest's `defineConfig` with the conformance coverage gate added to the
 * config's own plugins and its per-test handoff added to the root and every
 * inline project, so no package config can leave it out by setting `plugins`
 * or `setupFiles` after spreading `sharedConfig`.
 * @param {ViteUserConfig} config
 * @returns {ViteUserConfig}
 */
export const defineConfig = (config) => {
  const test = withConformanceSetup(config.test)
  const projects = config.test?.projects
  return defineVitestConfig({
    ...config,
    plugins: [...(config.plugins ?? []), conformanceCoverage()],
    test: projects === undefined
      ? test
      : { ...test, projects: /** @type {Projects} */ (projects.map(projectWithSetup)) },
  })
}

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
  test: {
    globals: true,
    environment: 'node',
    includeSource: ['src/**/*.{js,ts}'],
    exclude: ['**/.stryker-tmp/**', '**/node_modules/**', '**/.repo/**'],
    passWithNoTests: true,
    testTimeout: sharedTestTimeout,
    silent: isAgent ? 'passed-only' : false,
    ...(isAgent ? { bail: 1 } : {}),
    coverage: {
      enabled: isCI || process.env['COVERAGE'] === 'true',
      provider: 'v8',
      reporter: ['json', 'html', 'lcov'],
    },
  },
}
