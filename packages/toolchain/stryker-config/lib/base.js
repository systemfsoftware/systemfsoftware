const isAgent = process.env['AGENT'] !== undefined
const isCI = !isAgent && typeof process.env['CI'] === 'string' && process.env['CI'].length > 0

const envConcurrency = process.env['STRYKER_CONCURRENCY'] ??
  (isAgent ? '50%' : isCI ? '100%' : undefined)

export const sharedConfig = {
  packageManager: 'pnpm',
  reporters: isAgent || isCI ? ['json', 'html'] : ['progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/mutation.html' },
  jsonReporter: { fileName: 'reports/mutation/mutation.json' },
  coverageAnalysis: 'perTest',
  incremental: true,
  incrementalFile: 'reports/stryker-incremental.json',
  ignorePatterns: ['reports', 'coverage'],
  disableBail: true,
  cleanTempDir: 'always',
  thresholds: { high: 100, low: 80, break: 100 },
  ...(envConcurrency !== undefined ? { concurrency: envConcurrency } : {}),
}
