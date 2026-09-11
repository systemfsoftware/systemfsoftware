export { CheckerFailedSchema, CheckResultSchema, CheckStatusSchema } from './Checker.schema.js'
export type { CheckerFailed, CheckResult, CheckStatus, FailedCheckResult, PassedCheckResult } from './Checker.schema.js'

import type { CheckResult } from './Checker.schema.js'
import type { Mutant } from './Mutant.js'
import type { PluginInit, StrykerOptions } from './Options.js'

export type CheckResultMap = Record<string, CheckResult>

export type CheckerInit = () => void | Promise<void>

export type CheckerCheck = (mutants: readonly Mutant[]) => CheckResultMap | Promise<CheckResultMap>

export type CheckerGroup = (
  mutants: readonly Mutant[],
) => readonly (readonly string[])[] | Promise<readonly (readonly string[])[]>

export interface Checker {
  readonly init?: CheckerInit | undefined
  readonly check?: CheckerCheck | undefined
  readonly group?: CheckerGroup | undefined
}

export type CheckerFactory = (options: StrykerOptions, init: PluginInit) => Checker
