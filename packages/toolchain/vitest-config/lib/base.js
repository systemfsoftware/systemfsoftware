import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { defaultClientConditions, defaultServerConditions } from 'vite'
import { defineConfig as defineVitestConfig } from 'vitest/config'

import { CONFORMANCE_SETUP, conformanceCoverage } from './conformance-coverage.js'

/** @typedef {import('vitest/config').ViteUserConfig} ViteUserConfig */
/** @typedef {NonNullable<ViteUserConfig['test']>} TestConfig */
/** @typedef {NonNullable<TestConfig['projects']>} Projects */

/**
 * @param {string} path
 * @returns {unknown}
 */
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'))

/**
 * @param {unknown} value
 * @param {string} key
 * @returns {string}
 */
const stringField = (value, key) => {
  const field = typeof value === 'object' && value !== null ? Reflect.get(value, key) : undefined
  return typeof field === 'string' ? field : ''
}

// The fork is declared under this name: `pnpm-workspace.yaml`'s catalog aliases it to this repo's
// `@systemfsoftware/vitest` package. A package that cannot resolve it must not run unguarded.
const forkDependency = '@systemfsoftware/vitest'

// The setup file that installs the fork's guard (KTD8), published by the fork under this subpath.
const forkGuardSpecifier = `${forkDependency}/guard`

// The fork's own package. It holds no dependency on itself, so it loads its guard from source instead.
const forkPackage = '@systemfsoftware/vitest'

/**
 * The one table that takes a package's tests out from under the guard. A package is exempt only by being
 * listed here, together with the runner that registers its tests: vitest's own `it` is what the guard
 * refuses, so every test another runner registers must not load it. `projects` is `'*'` when the whole
 * package is exempt, otherwise the names of the exempt inline test projects.
 *
 * @type {Readonly<Record<string, { readonly projects: readonly string[] | '*', readonly registrar: string }>>}
 */
const guardExemptions = {
  '@systemfsoftware/oxlint-plugin-cell-architecture': {
    projects: '*',
    registrar: "oxlint's RuleTester registers every case with vitest's it",
  },
  '@systemfsoftware/oxlint-plugin-dmmf-workflow': {
    projects: '*',
    registrar: "oxlint's RuleTester registers every case with vitest's it",
  },
  '@systemfsoftware/oxlint-plugin-effect-platform': {
    projects: '*',
    registrar: "oxlint's RuleTester registers every case with vitest's it",
  },
  '@systemfsoftware/oxlint-plugin-effect-schema': {
    projects: '*',
    registrar: "oxlint's RuleTester registers every case with vitest's it",
  },
  '@systemfsoftware/oxlint-plugin-test-discipline': {
    projects: '*',
    registrar: "oxlint's RuleTester registers every case with vitest's it",
  },
  '@systemfsoftware/storybook-gherkin': {
    projects: ['storybook'],
    registrar: "Storybook's vitest plugin registers every story",
  },
}

/**
 * The setup file that installs the guard, resolved from the package's own directory so a package that
 * cannot resolve the fork fails config load instead of running unguarded. The fork resolves its own
 * source, since it holds no dependency on itself.
 *
 * @param {string} cwd
 * @param {string} name
 * @returns {string}
 */
const guardSetupFile = (cwd, name) => {
  if (name === forkPackage) return join(cwd, 'src', 'guard.ts')
  try {
    return createRequire(join(cwd, 'package.json')).resolve(forkGuardSpecifier)
  } catch (cause) {
    throw new Error(
      `[@systemfsoftware/vitest-config] ${name} cannot resolve "${forkGuardSpecifier}", so its tests would run without the KTD8 guard. ` +
        `Declare "@systemfsoftware/vitest": "workspace:^" in devDependencies of ${join(cwd, 'package.json')}, ` +
        `or name the exempt test project in vitest-config's guard exemption table.`,
      { cause },
    )
  }
}

// A package config is evaluated with the package directory as the working directory (`pnpm --filter <pkg>
// test`, and turbo's per-package task), so `<cwd>/package.json` is the package this config belongs to.
const packageName = stringField(readJson(join(process.cwd(), 'package.json')), 'name')
const packageExemption = guardExemptions[packageName]

/**
 * The setup files that install the fork's guard (KTD8). Empty only for a package the exemption table
 * names in full; a package config that reaches the fork without a guard in this list throws while it
 * loads, naming the package and the dependency that fixes it.
 *
 * @type {ReadonlyArray<string>}
 */
export const guardSetupFiles = packageExemption?.projects === '*' ? [] : [guardSetupFile(process.cwd(), packageName)]

/**
 * A test block with `guardSetupFiles` and the conformance handoff added on top of its own setup files,
 * each at most once. `guard` is false for an exempt project, which still takes the handoff.
 *
 * @param {TestConfig | undefined} test
 * @param {boolean} guard
 * @returns {TestConfig}
 */
const withSetupFiles = (test, guard) => {
  const own = test?.setupFiles === undefined ? [] : [test.setupFiles].flat()
  return {
    ...test,
    setupFiles: [...new Set([...own, ...(guard ? guardSetupFiles : []), CONFORMANCE_SETUP])],
  }
}

/**
 * Whether a project's tests are registered by a runner the guard does not apply to.
 *
 * @param {TestConfig | undefined} test
 * @returns {boolean}
 */
const isExemptProject = (test) => {
  const names = packageExemption?.projects
  if (names === undefined || names === '*') return false
  const name = test?.name
  return typeof name === 'string' && names.includes(name)
}

/**
 * An inline project gets the setup files itself: vitest does not carry the root's setup files into
 * `test.projects`, and a project without them records sites but never hands them to the reporter. A
 * project the exemption table names is the one exception: the runner that registers its tests is not
 * vitest's, so it takes the handoff without the guard.
 *
 * @param {unknown} project
 * @returns {unknown}
 */
const projectWithSetup = (project) => {
  if (typeof project !== 'object' || project === null || !('test' in project)) return project
  const test = /** @type {TestConfig | undefined} */ (project.test)
  return { ...project, test: withSetupFiles(test, !isExemptProject(test)) }
}

/**
 * Vitest's `defineConfig` with the conformance coverage gate added to the
 * config's own plugins and its per-test handoff and the guard added to the root and every
 * inline project, so no package config can leave either out by setting `plugins`
 * or `setupFiles` after spreading `sharedConfig`.
 * @param {ViteUserConfig} config
 * @returns {ViteUserConfig}
 */
export const defineConfig = (config) => {
  const test = withSetupFiles(config.test, true)
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
    alias: { 'effect/TestClock': '@systemfsoftware/vitest/TestClock' },
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
