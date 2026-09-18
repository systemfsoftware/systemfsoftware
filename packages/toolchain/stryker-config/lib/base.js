// The shared mutation-run options every package config extends. A consumer names
// this module in `extends`, so it stays a plain data module with no imports and
// no runtime dependency on the engine.

/**
 * @type {Record<string, unknown>}
 */
export default {
  packageManager: 'pnpm',
  testRunner: 'vitest',
  checkers: ['typescript'],
  plugins: [
    '@systemfsoftware/stryker-js-vitest-runner',
    '@systemfsoftware/stryker-js-typescript-checker',
    '@systemfsoftware/stryker-ignorer-effect-schema-declarations',
    '@systemfsoftware/stryker-test-contribution',
  ],
  ignorers: ['effect-schema-declarations'],
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
  thresholds: { high: 100, low: 80, break: 100 },
}
