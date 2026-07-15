import type { StrykerOptions } from '@stryker-mutator/api/core'

export interface TypescriptCheckerPluginOptions {
  typescriptChecker: {
    prioritizePerformanceOverAccuracy?: boolean
  }
}

export interface TypescriptCheckerOptionsWithStrykerOptions extends TypescriptCheckerPluginOptions, StrykerOptions {}
