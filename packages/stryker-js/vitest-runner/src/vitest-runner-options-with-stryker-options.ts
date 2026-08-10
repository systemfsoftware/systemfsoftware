import type { StrykerOptions } from '@systemfsoftware/stryker-js-plugin-api/core'

export interface VitestRunnerOptions {
  /**
   * The directory from which Vitest scans for test files (the `--dir <path>` command line option),
   * resolved against the project root. A relative value like `'packages'` keeps working. The
   * project root is Stryker's sandbox directory and is not user-configurable.
   */
  dir?: string
  related?: boolean
  configFile?: string
}

export interface StrykerVitestRunnerOptions {
  vitest: VitestRunnerOptions
}

export interface VitestRunnerOptionsWithStrykerOptions extends StrykerVitestRunnerOptions, StrykerOptions {}
