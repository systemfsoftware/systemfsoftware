import type { PartialStrykerOptions } from '@systemfsoftware/stryker-js-plugin-api/core'

/**
 * Modal Stryker options, inherited via
 * `"extends": "@systemfsoftware/stryker-js-mutation-run/config/base"`.
 *
 * Relative paths below resolve against the working directory of the run that
 * reads them — the consuming package — not against this file.
 */
const basePreset: PartialStrykerOptions = {
  packageManager: 'pnpm',
  testRunner: 'vitest',
  checkers: ['typescript'],
  plugins: [
    '@systemfsoftware/stryker-js-vitest-runner',
    '@systemfsoftware/stryker-js-typescript-checker',
    '@systemfsoftware/stryker-plugins/effect-schema-ignorer',
    '@systemfsoftware/stryker-plugins/workflow-make-ignorer',
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
}

export default basePreset
