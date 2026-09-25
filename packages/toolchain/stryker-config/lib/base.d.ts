export interface SharedConfig {
  [key: string]: unknown
  packageManager: 'pnpm'
  reporters: string[]
  htmlReporter: { fileName: string }
  jsonReporter: { fileName: string }
  coverageAnalysis: 'perTest'
  incremental: boolean
  incrementalFile: string
  ignorePatterns: string[]
  disableBail: boolean
  cleanTempDir: 'always'
  thresholds: { high: number; low: number; break: number }
  concurrency?: string
}

export const sharedConfig: SharedConfig

/**
 * The slice of `patterns` that shard `STRYKER_SHARD=<index>/<count>` mutates;
 * `patterns` unchanged when `STRYKER_SHARD` is unset.
 */
export function shardMutate(patterns: readonly string[]): string[]
