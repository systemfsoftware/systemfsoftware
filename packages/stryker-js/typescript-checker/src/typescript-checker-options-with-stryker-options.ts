import type { StrykerOptions } from '@systemfsoftware/stryker-js-plugin-api/core'

export interface TypescriptCheckerPluginOptions {
  typescriptChecker?: {
    prioritizePerformanceOverAccuracy?: boolean
  }
}

export interface TypescriptCheckerOptionsWithStrykerOptions extends TypescriptCheckerPluginOptions, StrykerOptions {}
