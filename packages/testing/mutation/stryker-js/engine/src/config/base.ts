import { StrykerOptionsSchema } from '@systemfsoftware/stryker-js/Schema'
import type * as S from 'effect/Schema'

/**
 * The document a config file holds: the schema's INPUT side, before defaults
 * are applied. Typed against the schema instead of the decoded
 * `StrykerOptions` because this file is a template for user config files, not
 * a resolved option set — and the deep-partial of the decoded type collapses
 * array fields (`never[]`) that this document legitimately sets.
 */
type BasePreset = S.Codec.Encoded<typeof StrykerOptionsSchema>

const basePreset: BasePreset = {
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
  ignorers: ['effect-schema-declarations'],
  thresholds: { high: 100, low: 80, break: 100 },
}

export default basePreset
