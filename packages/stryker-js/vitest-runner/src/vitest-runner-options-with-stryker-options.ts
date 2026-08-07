import type { StrykerOptions } from '@stryker-mutator/api/core'

export interface VitestRunnerOptions {
  dir?: string
  related?: boolean
  configFile?: string
}

export interface StrykerVitestRunnerOptions {
  vitest: VitestRunnerOptions
}

export interface VitestRunnerOptionsWithStrykerOptions extends StrykerVitestRunnerOptions, StrykerOptions {}
