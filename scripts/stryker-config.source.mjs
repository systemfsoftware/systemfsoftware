// Single source of truth for every stryker.config.json in this repo.
//
// The per-package files are GENERATED. Edit this module, run
// `pnpm generate:stryker-config`, and commit the result. `pnpm check` fails if
// the two ever disagree (scripts/check-stryker-config.mjs).
//
// Why generated rather than a shared `stryker.config.mjs` that each package
// imports: a `.mjs` config has to be EXECUTED to be read. Every static
// consumer -- the Locked scripts/guard-mutate-scope.mjs, the drift gate, any
// future audit -- would have to run package-authored code just to answer "what
// does this config say", which puts config-time code execution inside
// `pnpm check`. Generation keeps the artifact inert and readable by anything
// that can parse JSON. Same reasoning REPO-S4 already applies to
// package.json#exports being produced from tsdown.config.ts.
//
// This file exists because copy-paste put a never-loading plugin into 13
// configs and nothing noticed for the life of it:
// `@systemfsoftware/stryker-plugins/lint-rule-helper-ignorer`. No file, export,
// or commit by that name has ever existed. It was not written 13 times -- one
// template was copied 13 times and the error rode along, which is why the fix
// is a table you can read in one screen rather than 24 files you must diff.
// Stryker logs a plugin load failure as a WARN and continues, so nothing
// downstream ever went red.
//
// `@systemfsoftware/stryker-plugins/effect-schema-ignorer` looks like the same
// defect and is NOT: 16 packages declare it without depending on the package
// that provides it, so it resolves MODULE_NOT_FOUND *from the consumer* -- yet
// it loads. pnpm's generated `stryker` bin shim exports
// `node_modules/.pnpm/node_modules` as NODE_PATH, and the plugin resolves from
// there. Deleting it on the strength of the consumer-side resolution was a real
// mistake, made and reverted on 2026-08-05; `check-stryker-config.mjs` now
// resolves through the same fallback so the gate cannot repeat it.
//
// The undeclared dependency is still a latent fragility -- it survives only
// while pnpm hoists -- but that is a dependency fix, not a config deletion.

/**
 * Marks a key as deliberately ABSENT for a package, as distinct from "same as
 * default". The generator omits the key entirely.
 */
export const ABSENT = Symbol.for('stryker-config.absent')

/**
 * Canonical key order for generated output. Run control first, then what gets
 * mutated, then the thresholds that judge it. Any key absent from this list is
 * a programming error the generator refuses rather than silently appending, so
 * adding a stryker option is a deliberate edit here.
 */
export const KEY_ORDER = [
  '$schema',
  'packageManager',
  'testRunner',
  'checkers',
  'plugins',
  'reporters',
  'htmlReporter',
  'jsonReporter',
  'vitest',
  'typescriptChecker',
  'coverageAnalysis',
  'disableBail',
  'incremental',
  'incrementalFile',
  'mutate',
  'mutator',
  'ignorePatterns',
  'ignorers',
  'thresholds',
]

/**
 * The shape 16 of 24 packages use verbatim. Derived from the tree, not
 * designed: every value here is the modal value across all 24 configs.
 */
export const defaults = {
  $schema: './node_modules/@systemfsoftware/stryker-js-core/schema/stryker-schema.json',
  packageManager: 'pnpm',
  testRunner: 'vitest',
  checkers: ['typescript'],
  plugins: [
    '@stryker-mutator/vitest-runner',
    '@systemfsoftware/stryker-js-typescript-checker',
    '@systemfsoftware/stryker-plugins/effect-schema-ignorer',
  ],
  reporters: ['progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation-report.html' },
  jsonReporter: { fileName: 'reports/mutation-report.json' },
  vitest: { configFile: 'vitest.config.ts', dir: '.', related: true },
  typescriptChecker: { prioritizePerformanceOverAccuracy: false },
  coverageAnalysis: 'perTest',
  incremental: false,
  incrementalFile: 'reports/stryker-incremental.json',
  mutate: ['src/rules/*.ts', '!src/rules/**/*.test.ts', '!src/rules/*.config.ts'],
  ignorePatterns: ['reports', 'coverage'],
  ignorers: ['effect-schema-declarations'],
  thresholds: { high: 100, low: 80, break: 100 },
}

/**
 * The plugin list minus the schema ignorer, for packages that declare no Effect
 * Schema and so have nothing for it to ignore. Named rather than repeated so
 * the exception is one edit, which is the whole point of this file.
 */
const WITHOUT_IGNORER = [
  '@stryker-mutator/vitest-runner',
  '@systemfsoftware/stryker-js-typescript-checker',
]

/**
 * Per-package deviations, keyed by package directory relative to the repo root.
 *
 * Every entry states a `reason`. An entry that RELAXES the mutation gate --
 * `thresholds.break` below 100, or a non-empty `mutator.excludedMutations` --
 * additionally requires `issue` and `expires`, and the gate rejects it once
 * that date passes. CONSTITUTION §III.3 bans reaching a score both by lowering
 * the gate and by narrowing the mutated set, so both forms are treated as the
 * same kind of exception: time-boxed and tracked, never permanent.
 *
 * A package absent from this table generates `defaults` verbatim.
 */
export const overrides = {
  'omp/plugins/omp-claude-compat': {
    reason:
      'Plugin package, not a rule package: the only pure decisions are *.workflow.ts. `dist` joins ignorePatterns because the built output ships in-tree here.',
    config: {
      mutate: ['src/*.workflow.ts'],
      ignorePatterns: ['reports', 'coverage', 'dist'],
    },
  },

  'packages/effect-daemon-spec': {
    reason:
      'Mutation debt, measured 2026-08-05: 45 Ignored, 4 Survived. `break: 0` means the run cannot fail on score, and excludedMutations narrows the operator set -- both are §III.3 relaxations, so both expire together. Loads the stryker-plugins root export rather than the effect-schema-ignorer subpath.',
    issue: 'https://github.com/systemfsoftware/systemfsoftware/issues/47',
    expires: '2026-11-03',
    config: {
      plugins: [
        '@stryker-mutator/vitest-runner',
        '@systemfsoftware/stryker-js-typescript-checker',
        '@systemfsoftware/stryker-plugins',
      ],
      incremental: true,
      mutate: ['src/**/*.schema.ts'],
      mutator: { excludedMutations: ['StringLiteral', 'Regex', 'ObjectLiteral', 'UpdateOperator'] },
      ignorePatterns: ABSENT,
      ignorers: ['effect-schema-declarations'],
      thresholds: { high: 100, low: 100, break: 0 },
    },
  },

  'packages/hex-schema': {
    reason:
      'Tests live in-source, so `in-source-vitest-block` joins the ignorers. `excludedMutations: []` is explicit: this package runs the FULL operator set and is not a relaxation. Its 104 Ignored mutants are OX-MG1 debt, not a threshold relaxation -- break stays 100.',
    config: {
      plugins: [
        '@stryker-mutator/vitest-runner',
        '@systemfsoftware/stryker-js-typescript-checker',
        '@systemfsoftware/stryker-plugins',
      ],
      incremental: true,
      mutate: ['src/**/*.ts', '!src/**/*.test.ts', '!src/**/*.d.ts', '!src/mod.ts'],
      mutator: { excludedMutations: [] },
      ignorePatterns: ABSENT,
      ignorers: ['effect-schema-declarations', 'in-source-vitest-block'],
      thresholds: { high: 100, low: 100, break: 100 },
    },
  },

  'packages/oxlint-plugins/cell-taxonomy': {
    reason:
      'RuleTester suites report no per-test coverage, so `related: false` runs the whole suite per mutant and coverageAnalysis is off.',
    config: {
      plugins: WITHOUT_IGNORER,
      ignorers: ABSENT,
      vitest: { configFile: 'vitest.config.ts', dir: '.', related: false },
      coverageAnalysis: 'off',
    },
  },

  'packages/oxlint-plugins/core': {
    reason:
      'General rule set: mutates all of src rather than src/rules only. Runs non-incrementally with no incremental file.',
    config: {
      plugins: WITHOUT_IGNORER,
      ignorers: ABSENT,
      incremental: ABSENT,
      incrementalFile: ABSENT,
      mutate: ['src/**/*.ts', '!src/**/*.test.ts', '!src/**/*.config.ts', '!src/index.ts'],
    },
  },

  'packages/oxlint-plugins/effect-executor': {
    reason: 'RuleTester suites report no per-test coverage: whole suite per mutant, coverage off.',
    config: {
      vitest: { configFile: 'vitest.config.ts', dir: '.', related: false },
      coverageAnalysis: 'off',
    },
  },

  'packages/oxlint-plugins/effect-schema': {
    reason:
      'Rules live under src/rules/** with a __tests__ directory rather than colocated *.test.ts, so the mutate glob differs.',
    config: {
      plugins: WITHOUT_IGNORER,
      ignorers: ABSENT,
      incremental: true,
      mutate: ['src/rules/**/*.ts', '!src/rules/__tests__/**', '!src/rules/**/*.config.ts'],
      thresholds: { high: 100, low: 100, break: 100 },
    },
  },

  'packages/oxlint-plugins/property-testing': {
    reason: 'RuleTester suites report no per-test coverage: whole suite per mutant, coverage off.',
    config: {
      vitest: { configFile: 'vitest.config.ts', dir: '.', related: false },
      coverageAnalysis: 'off',
    },
  },

  'packages/oxlint-plugins/test-hygiene': {
    reason:
      '`disableBail: true` buys the exact per-file kill attribution the test-contribution check needs -- under bail a second killer goes unrecorded (root AGENTS.md). coverageAnalysis "all" pairs with it. Mutates all of src.',
    config: {
      plugins: WITHOUT_IGNORER,
      ignorers: ABSENT,
      coverageAnalysis: 'all',
      disableBail: true,
      incremental: ABSENT,
      incrementalFile: ABSENT,
      mutate: ['src/**/*.ts', '!src/**/*.test.ts', '!src/**/*.config.ts', '!src/index.ts'],
    },
  },

  'packages/oxlint-plugins/test-placement': {
    reason: 'RuleTester suites report no per-test coverage: whole suite per mutant, coverage off.',
    config: {
      vitest: { configFile: 'vitest.config.ts', dir: '.', related: false },
      coverageAnalysis: 'off',
    },
  },

  'packages/stryker-js/core': {
    reason:
      'This package OWNS the schema, so $schema is a repo-relative path into its own source rather than a node_modules path. It is the fork itself: no typescript checker, no HTML report, and the mutate surface is the one evaluation gate it ships.',
    config: {
      $schema: './schema/stryker-schema.json',
      checkers: ABSENT,
      plugins: ['@stryker-mutator/vitest-runner'],
      ignorers: ABSENT,
      reporters: ['progress', 'json'],
      htmlReporter: ABSENT,
      typescriptChecker: ABSENT,
      incrementalFile: ABSENT,
      mutate: ['src/reporters/test-contribution.ts'],
      ignorePatterns: ['reports', 'coverage', 'dist'],
      thresholds: { high: 100, low: 100, break: 100 },
    },
  },
}

/**
 * True when an override relaxes the mutation gate and therefore owes `issue`
 * and `expires`. Two relaxation forms, because §III.3 bans two:
 *   - lowering the gate      -> thresholds.break < 100
 *   - narrowing the mutants  -> non-empty mutator.excludedMutations
 * An explicit empty excludedMutations is the opposite of a relaxation and does
 * not trigger the requirement.
 */
export const isRelaxation = (config) => {
  if (!config) return false
  const brk = config.thresholds?.break
  if (typeof brk === 'number' && brk < 100) return true
  const excluded = config.mutator?.excludedMutations
  return Array.isArray(excluded) && excluded.length > 0
}

/**
 * Merge one package's config. Objects merge one level deep; arrays replace
 * wholesale, because concatenating a mutate glob or a plugin list silently
 * produces a config nobody wrote.
 */
export const resolveConfig = (packageDir) => {
  const patch = overrides[packageDir]?.config ?? {}
  const merged = {}
  for (const key of KEY_ORDER) {
    const value = key in patch ? patch[key] : defaults[key]
    if (value === ABSENT || value === undefined) continue
    merged[key] = value
  }
  const unknown = Object.keys(patch).filter((k) => !KEY_ORDER.includes(k))
  if (unknown.length > 0) {
    throw new Error(
      `stryker-config.source: override for ${packageDir} sets key(s) missing from KEY_ORDER: ${unknown.join(', ')}`,
    )
  }
  return merged
}
