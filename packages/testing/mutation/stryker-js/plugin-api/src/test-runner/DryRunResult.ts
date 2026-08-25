import * as Option from 'effect/Option'
import { MutantCoverage } from '../core/index.js'

import { DryRunStatus } from './DryRunStatus.js'
import { TestResult } from './TestResult.js'

export type DryRunResult =
  | CompleteDryRunResult
  | ErrorDryRunResult
  | TimeoutDryRunResult

export interface CompleteDryRunResult {
  /**
   * The individual test results.
   */
  tests: TestResult[]

  mutantCoverage?: MutantCoverage

  /**
   * The status of the run
   */
  status: DryRunStatus.Complete
}
export interface TimeoutDryRunResult {
  /**
   * The status of the run
   */
  status: DryRunStatus.Timeout
  /**
   * An optional reason for the timeout
   */
  reason?: string
}

export interface ErrorDryRunResult {
  /**
   * The status of the run
   */
  status: DryRunStatus.Error

  /**
   * If `state` is `error`, this collection should contain the error messages
   */
  errorMessage: string
}

/**
 * Whether the hit limit was reached.
 *
 * `Option` is used instead of `undefined` so callers cannot collapse "limit not
 * reached" with "value absent" via `??` — the two cases have different
 * meanings (continue vs no limit configured) and a falsy-coalescing conflation
 * would silently continue a run that should time out.
 *
 * This is the type's own algebra rather than a `Workflow` decision: a total
 * definitional map over two numbers with no I/O, no clock and no policy input,
 * so there is no decision to brand and no error channel to type. The gate is
 * law property tests, not the decision brand — they exist to kill the `>` vs
 * `>=` mutation on the boundary.
 */
// Owed law once DryRunResult is Schema (findings F10/F11/F25/F26/F28): Some iff both defined and hitCount > hitLimit, boundary hitCount==hitLimit => None kills >= mutation, and Some carries Timeout status with reason `Hit limit reached (hitCount/hitLimit)`.
export function determineHitLimitReached(
  hitCount: number | undefined,
  hitLimit: number | undefined,
): Option.Option<TimeoutDryRunResult> {
  if (hitCount !== undefined && hitLimit !== undefined && hitCount > hitLimit) {
    return Option.some({
      status: DryRunStatus.Timeout,
      reason: `Hit limit reached (${hitCount}/${hitLimit})`,
    })
  }
  return Option.none()
}
