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
  /**
   * `workflowMutate`, narrowed to the files this shard owns when `STRYKER_SHARD=<index>/<count>` is set. Computed on
   * first read, so importing the module touches no file; every read returns the same array.
   */
  readonly mutate: string[]
  concurrency?: string
}

/** The files mutation testing mutates: `src/**\/*.workflow.ts`, minus `src/**\/__tests__/**`. */
export const workflowMutate: readonly string[]

export const sharedConfig: SharedConfig
