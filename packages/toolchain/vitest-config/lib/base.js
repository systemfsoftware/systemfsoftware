import { realpath } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { defaultClientConditions, defaultServerConditions } from 'vite'
import { defineConfig as defineVitestConfig } from 'vitest/config'

import { exists, firstExisting, readJson } from './files.js'

/** @typedef {import('vitest/config').ViteUserConfig} ViteUserConfig */
/** @typedef {NonNullable<ViteUserConfig['test']>} TestConfig */
/** @typedef {NonNullable<TestConfig['projects']>} Projects */
/**
 * What one config load reads from disk about its own package: the exemption table entry that decides
 * where the guard applies, the guard setup files its projects take, and the name and workspace root the
 * fork's provided context carries.
 *
 * @typedef {{
 *   readonly exemption: { readonly projects: readonly string[] | '*', readonly registrar: string } | undefined,
 *   readonly guardSetupFiles: ReadonlyArray<string>,
 *   readonly name: string,
 *   readonly root: string,
 * }} PackageFacts
 */

/**
 * @param {unknown} value
 * @param {string} key
 * @returns {string}
 */
const stringField = (value, key) => {
  const field = typeof value === 'object' && value !== null ? Reflect.get(value, key) : undefined
  return typeof field === 'string' ? field : ''
}

// Workspace packages expose their source under this condition in `exports`, so a
// test resolves a sibling's `src/` instead of a `dist/` this run may not have built.
// Both pipelines need it: node-environment tests resolve through the SSR resolver,
// while browser tests use the client one. Vite replaces the default conditions when
// they are set, so the defaults are spread back in rather than dropped.
export const sourceCondition = '@systemfsoftware/source'

// The fork's package. Its own tests load its guard from source, since it holds no dependency on itself.
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
 * The setup file that installs the guard, as an absolute path. The fork is looked up only where pnpm
 * links a package's declared dependencies, `<package>/node_modules/<fork>`: Node resolution is not
 * used because pnpm's bin shims put the whole virtual store on `NODE_PATH`, so it finds the fork from
 * a package that never declared it. Vitest reads a setup-file specifier without the project's resolve
 * conditions, so the fork's `./guard` export is resolved here: its source entry when that file exists,
 * so an unbuilt fork still guards, otherwise its built entry. A package that has not declared the fork,
 * or whose fork has no guard on disk, fails config load instead of running unguarded. Resolving it
 * reads the file system, so the config a package exports is a promise.
 *
 * @param {string} cwd
 * @param {string} name
 * @returns {Promise<string>}
 */
const guardSetupFile = async (cwd, name) => {
  if (name === forkPackage) return join(cwd, 'src', 'guard.ts')
  const refuse = (/** @type {string} */ what) =>
    new Error(
      `[@systemfsoftware/vitest-config] ${name} ${what}, so its tests would run without the KTD8 guard. ` +
        `Declare "${forkPackage}": "workspace:^" in devDependencies of ${join(cwd, 'package.json')}, ` +
        `or name the exempt test project in vitest-config's guard exemption table.`,
    )
  const forkDir = join(cwd, 'node_modules', forkPackage)
  const manifestPath = join(forkDir, 'package.json')
  if (!(await exists(manifestPath))) throw refuse(`has no "${forkPackage}" linked in its own node_modules`)
  const exportsField = Reflect.get(Object(await readJson(manifestPath)), 'exports')
  const guardEntry = Reflect.get(Object(exportsField), './guard')
  const found = await firstExisting(
    [stringField(guardEntry, sourceCondition), stringField(guardEntry, 'default')]
      .filter((entry) => entry.length > 0)
      .map((entry) => join(forkDir, entry)),
  )
  if (found === undefined) throw refuse(`links a "${forkPackage}" whose "./guard" export has no file on disk`)
  return realpath(found)
}

// A package config is evaluated with the package directory as the working directory (`pnpm --filter <pkg>
// test`, and turbo's per-package task), so `<cwd>/package.json` is the package this config belongs to.
/**
 * The facts about the package this config belongs to, read from disk once.
 *
 * @param {string} cwd
 * @returns {Promise<PackageFacts>}
 */
const packageFacts = async (cwd) => {
  const name = stringField(await readJson(join(cwd, 'package.json')), 'name')
  const exemption = guardExemptions[name]
  const guardFiles = exemption?.projects === '*' ? [] : [await guardSetupFile(cwd, name)]
  const root = await workspaceRoot(cwd)
  return { exemption, guardSetupFiles: guardFiles, name, root }
}

/**
 * The workspace root: the nearest ancestor of `cwd` that holds `pnpm-workspace.yaml`, or `cwd` when none does.
 *
 * @param {string} cwd
 * @returns {Promise<string>}
 */
const workspaceRoot = async (cwd) => {
  let dir = cwd
  while (!(await exists(join(dir, 'pnpm-workspace.yaml')))) {
    const parent = dirname(dir)
    if (parent === dir) return cwd
    dir = parent
  }
  return dir
}

/**
 * The facts a run's provided context carries for the fork: this package's npm name and the workspace root every
 * rendered path is relativized against. The runner reads them with Vitest's `inject`, so a rerun line names the
 * package without the fork ever reading a built-in.
 *
 * @param {PackageFacts} facts
 * @returns {Record<string, string>}
 */
const packageProvide = (facts) => {
  /** @type {Record<string, string>} */
  const provided = {}
  if (facts.name.length > 0) provided['@systemfsoftware/vitest:package'] = facts.name
  if (facts.root.length > 0) provided['@systemfsoftware/vitest:workspace-root'] = facts.root
  return provided
}

/**
 * A test block with the package's own provided values merged over whatever it already provides.
 *
 * @param {TestConfig | undefined} test
 * @param {PackageFacts} facts
 * @returns {TestConfig}
 */
const withProvide = (test, facts) => ({ ...test, provide: { ...test?.provide, ...packageProvide(facts) } })

/**
 * A test block with the package's guard setup files added on top of its own, each at most once.
 * `guard` true adds them; false leaves them out, which an exempt project — one whose tests another
 * runner registers — must not carry.
 *
 * @param {TestConfig | undefined} test
 * @param {boolean} guard
 * @param {PackageFacts} facts
 * @returns {TestConfig}
 */
const withSetupFiles = (test, guard, facts) => {
  const own = (test?.setupFiles === undefined ? [] : [test.setupFiles].flat())
    .filter((file) => guard || !facts.guardSetupFiles.includes(file))
  return {
    ...test,
    setupFiles: [...new Set([...own, ...(guard ? facts.guardSetupFiles : [])])],
  }
}

/**
 * Whether a project's tests are registered by a runner the guard does not apply to.
 *
 * @param {TestConfig | undefined} test
 * @param {PackageFacts} facts
 * @returns {boolean}
 */
const isExemptProject = (test, facts) => {
  const names = facts.exemption?.projects
  if (names === undefined || names === '*') return false
  const name = test?.name
  return typeof name === 'string' && names.includes(name)
}

/**
 * Whether a value is an inline project with a test block.
 *
 * @param {unknown} value
 * @returns {value is { readonly test?: TestConfig }}
 */
const isTestProject = (value) => typeof value === 'object' && value !== null && 'test' in value

/**
 * An inline project gets the setup files itself. A project the exemption table names is the one
 * exception: the runner that registers its tests is not vitest's, so it takes the handoff without the
 * guard.
 *
 * @param {unknown} project
 * @param {PackageFacts} facts
 * @returns {unknown}
 */
const projectWithSetup = (project, facts) => {
  if (!isTestProject(project)) return project
  const test = project.test
  return { ...project, test: withProvide(withSetupFiles(test, !isExemptProject(test, facts), facts), facts) }
}

/**
 * Vitest's `defineConfig` with the guard and the fork's provided context added to every block that runs
 * tests: the root when the config declares no projects, otherwise each inline project. The root of a
 * config with projects runs no tests of its own, and a project with `extends: true` inherits the root's
 * setup files, so a guard on that root would reach an exempt project. The config it builds is a promise,
 * because resolving the guard reads the file system.
 *
 * @param {ViteUserConfig} config
 * @returns {Promise<ViteUserConfig>}
 */
export const defineConfig = async (config) => {
  const facts = await packageFacts(process.cwd())
  const declared = config.test?.projects
  const base = withProvide(withSetupFiles(config.test, declared === undefined, facts), facts)
  return defineVitestConfig({
    ...config,
    test: declared === undefined
      ? base
      : { ...base, projects: /** @type {Projects} */ (declared.map((project) => projectWithSetup(project, facts))) },
  })
}

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
const isMutationWorker = process.env['STRYKER_MUTATOR_WORKER'] !== undefined

const propertyRuns = isMutationWorker ? 30 : isCI ? 1000 : 100

// The fork reads these under `inject`; the key is its published `ProvidedContext` key. CI and Stryker workers
// never write the fork's seed store: a CI checkout is discarded, and a mutation worker fails on purpose.
const propertyCheckDefaults = isMutationWorker || isCI ? { runs: propertyRuns, record: false } : { runs: propertyRuns }

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
    // The guard and the conformance handoff are added to every test block that runs tests by
    // `defineConfig`, which resolves the guard asynchronously; a config that spreads this object
    // still carries both.
    setupFiles: [],
    includeSource: ['src/**/*.{js,ts}'],
    exclude: ['**/.stryker-tmp/**', '**/node_modules/**', '**/.repo/**'],
    passWithNoTests: true,
    testTimeout: sharedTestTimeout,
    silent: isAgent || isCI ? 'passed-only' : false,
    ...(isCI ? { reporters: ['agent', 'github-actions'] } : {}),
    provide: { '@systemfsoftware/vitest:property-check': propertyCheckDefaults },
    ...(isAgent ? { bail: 1 } : {}),
    coverage: {
      enabled: process.env['COVERAGE'] === 'true',
      provider: 'v8',
      reporter: ['json', 'html', 'lcov'],
    },
  },
}
