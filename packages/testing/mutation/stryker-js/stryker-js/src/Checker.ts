import * as Context from 'effect/Context'
import type * as Effect from 'effect/Effect'
import type * as HashMap from 'effect/HashMap'

import type { CheckerFailed } from './Checker.schema.js'
import type { Mutant } from './Mutant.js'

export { CheckerFailed, CheckResultSchema, CheckStatus } from './Checker.schema.js'

export interface FailedCheckResult {
  readonly reason: string
  readonly status: 'compileError'
}

export interface PassedCheckResult {
  readonly status: 'passed'
}

export type CheckResult = FailedCheckResult | PassedCheckResult

export interface CheckerService {
  readonly init: Effect.Effect<void, CheckerFailed>
  readonly check: (
    mutants: readonly Mutant[],
  ) => Effect.Effect<HashMap.HashMap<string, CheckResult>, CheckerFailed>
  readonly group: (
    mutants: readonly Mutant[],
  ) => Effect.Effect<readonly (readonly string[])[], CheckerFailed>
}

export class Checker extends Context.Service<Checker, CheckerService>()('~@systemfsoftware/stryker-js/Checker') {}
