import { readFileSync } from 'node:fs'
import { join } from 'node:path'
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
  return { ...test, setupFiles: [...setupFiles, CONFORMANCE_SETUP] }
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

// One tier table decides how many draws every property gets: a Stryker worker wants fast mutant runs,
// CI wants the thorough tier, and a local run sits between them. The fork merges this over its own
// `runs: 100` unless a property sets its own.
const propertyRuns = process.env['STRYKER_MUTATOR_WORKER'] !== undefined ? 30 : isCI ? 1000 : 100

// The fork reads these under `inject`; the key is its published `ProvidedContext` key.
const propertyCheckDefaults = { runs: propertyRuns }

// The fork is declared under this name: `pnpm-workspace.yaml`'s catalog aliases it to this repo's
// `@systemfsoftware/vitest` package. A package that cannot resolve the fork must not list its setup file.
const forkDependency = '@effect/vitest'

// A package config is evaluated with the package directory as the working directory (`pnpm --filter <pkg>
// test`, and turbo's per-package task), so `<cwd>/package.json` is the package this config belongs to.
/**
 * @param {string} root
 */
const dependenciesOf = (root) => {
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  return {
    ...manifest.dependencies,
    ...manifest.devDependencies,
    ...manifest.peerDependencies,
    ...manifest.optionalDependencies,
  }
}

/**
 * The setup file that installs the fork's guard (KTD8), or nothing for a package that cannot resolve the fork:
 * `oxlint-plugin/*`, `oxlint-presets/*`, `toolchain/*` and the fork itself register through Vitest's own `it`,
 * which the guard refuses. A config that replaces `test.setupFiles` spreads this in.
 *
 * @type {ReadonlyArray<string>}
 */
export const guardSetupFiles = Object.hasOwn(dependenciesOf(process.cwd()), forkDependency)
  ? ['@effect/vitest/guard']
  : []

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
    setupFiles: [...guardSetupFiles],
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
