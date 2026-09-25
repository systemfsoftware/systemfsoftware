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

export interface Shard {
  readonly index: number
  readonly count: number
}

/** The shard `STRYKER_SHARD` names, or `undefined` when it is unset or empty; throws on a malformed value. */
export function parseShard(raw: string | undefined): Shard | undefined

/** The files `shard` owns; over every shard of a count, the slices partition `files`. */
export function sliceFiles(files: readonly string[], packageName: string, shard: Shard): string[]

/**
 * `patterns` for the shard `STRYKER_SHARD=<index>/<count>` names, negating every file
 * another shard owns; `patterns` unchanged when `STRYKER_SHARD` is unset.
 */
export function shardMutate(patterns: readonly string[]): string[]
