export interface SharedConfig {
  [key: string]: unknown
  packageManager: 'pnpm'
  reporters: string[]
  htmlReporter: { fileName: string }
  jsonReporter: { fileName: string }
  coverageAnalysis: 'perTest'
  incremental: boolean
  incrementalFile: string
  incrementalSources: string[]
  ignorePatterns: string[]
  disableBail: boolean
  dryRunTimeoutMinutes: number
  cleanTempDir: 'always'
  thresholds: { high: number; low: number; break: number }
  /** `workflowMutate`, the same array on every read. */
  readonly mutate: string[]
  concurrency?: string | number
}

/** The files mutation testing mutates: `src/**\/*.workflow.ts`, minus the `__tests__`, `__fixtures__` and `__mocks__` directories. */
export const workflowMutate: readonly string[]

export const sharedConfig: SharedConfig
