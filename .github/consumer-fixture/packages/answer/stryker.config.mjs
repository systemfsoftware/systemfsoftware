export default {
  testRunner: 'vitest',
  plugins: [import.meta.resolve('@systemfsoftware/stryker-js-vitest-runner')],
  mutate: ['src/**/*.js'],
  reporters: ['json', 'clear-text'],
  jsonReporter: { fileName: 'reports/mutation/mutation.json' },
  coverageAnalysis: 'perTest',
  incremental: true,
  thresholds: { high: 100, low: 100, break: 100 },
}
