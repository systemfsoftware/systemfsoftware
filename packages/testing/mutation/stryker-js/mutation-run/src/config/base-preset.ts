import { type StrykerOptionsSchema } from '@systemfsoftware/stryker-js-plugin-api/core'
import type * as S from 'effect/Schema'

/**
 * The document a config file holds: the schema's INPUT side, before
 * defaults are applied. Typed against the schema instead of the decoded
 * `StrykerOptions` because this file is a template for user config files,
 * not a resolved option set — and the deep-partial of the decoded type
 * collapses array fields (`never[]`) that this document legitimately sets.
 */
type BasePreset = S.Codec.Encoded<typeof StrykerOptionsSchema>
type RepoBasePreset = BasePreset & {
  requireTestContribution: readonly string[]
}

/**
 * Modal Stryker options, inherited via
 * `"extends": "@systemfsoftware/stryker-js-mutation-run/config/base"`.
 *
 * Relative paths below resolve against the working directory of the run that
 * reads them — the consuming package — not against this file.
 */
const basePreset: RepoBasePreset = {
  packageManager: 'pnpm',
  testRunner: 'vitest',
  checkers: ['typescript'],
  plugins: [
    '@systemfsoftware/stryker-js-vitest-runner',
    '@systemfsoftware/stryker-js-typescript-checker',
    '@systemfsoftware/stryker-plugins/effect-schema-ignorer',
    '@systemfsoftware/stryker-plugins/workflow-make-ignorer',
    '@systemfsoftware/stryker-test-contribution',
  ],
  reporters: ['progress', 'html', 'json', 'progress-stream'],
  htmlReporter: { fileName: 'reports/mutation-report.html' },
  jsonReporter: { fileName: 'reports/mutation-report.json' },
  vitest: { configFile: 'vitest.config.ts', dir: '.', related: true },
  typescriptChecker: { prioritizePerformanceOverAccuracy: true },
  coverageAnalysis: 'perTest',
  incremental: true,
  incrementalFile: 'reports/stryker-incremental.json',
  ignorePatterns: ['reports', 'coverage'],
  disableBail: true,
  // KTD1 carve-out: the base activates ONLY the declaration ignorer, so library
  // packages keep their declaration populations. workflow-make-boundary is a
  // sandwich-package opt-in listed in the consuming config's own `ignorers`;
  // its loader plugin stays here so every inheriting config can name it.
  ignorers: ['effect-schema-declarations'],
  thresholds: { high: 100, low: 80, break: 100 },
  requireTestContribution: [
    '.workflow.property.test.ts',
    '.policy.property.test.ts',
    '.kernel.property.test.ts',
  ],
}

export default basePreset
