import { DryRunResult } from './DryRunResult.js'
import { DryRunStatus } from './DryRunStatus.js'
import { FailedTestResult } from './TestResult.js'
import { TestStatus } from './TestStatus.js'

export enum MutantRunStatus {
  Killed = 'killed',
  Survived = 'survived',
  Timeout = 'timeout',
  Error = 'error',
}

export type MutantRunResult =
  | ErrorMutantRunResult
  | KilledMutantRunResult
  | SurvivedMutantRunResult
  | TimeoutMutantRunResult

export interface TimeoutMutantRunResult {
  status: MutantRunStatus.Timeout
  /**
   * An optional reason for the timeout
   */
  reason?: string
}

export interface KilledMutantRunResult {
  status: MutantRunStatus.Killed
  /**
   * An array with the ids of the tests that killed this mutant
   */
  killedBy: string[]
  /**
   * The failure message that was reported by first the test
   */
  failureMessage: string
  /**
   * The number of total tests ran in this test run.
   */
  nrOfTests: number
}

export interface SurvivedMutantRunResult {
  status: MutantRunStatus.Survived
  /**
   * The number of total tests ran in this test run.
   */
  nrOfTests: number
}

export interface ErrorMutantRunResult {
  status: MutantRunStatus.Error
  errorMessage: string
}

/**
 * Map a dry-run outcome to the mutant-run outcome.
 *
 * A failing test, a surviving mutant, or a timeout in the code under test are
 * values on the success channel — the error channel is only for the runner
 * itself breaking (environment could not be created, worker died).
 *
 * `reportAllKillers` is required (no default) so every call site states the
 * policy it wants: a default here would silently change every consumer's report
 * when the default changes, and callers would have no visible policy to audit.
 *
 * This is the type's own algebra rather than a `Workflow` decision: a total
 * definitional map over a tagged union with no I/O, no clock and no policy
 * input once `reportAllKillers` is supplied, so there is no decision to brand
 * and no error channel to type. The gate is law property tests, not the
 * decision brand.
 */
// Owed laws once DryRunResult/MutantRunResult are Schema (findings F10/F11/F25/F26/F28): status totality (Complete+failures->Killed, Complete+no failures->Survived, Error->Error, Timeout->Timeout); nrOfTests counts non-skipped only and never exceeds tests.length; reportAllKillers:true => killedBy.length==failedTests.length, false => exactly 1, first killer id stable between both.
export function toMutantRunResult(
  dryRunResult: DryRunResult,
  reportAllKillers: boolean,
): MutantRunResult {
  switch (dryRunResult.status) {
    case DryRunStatus.Complete: {
      const failedTests = dryRunResult.tests.filter<FailedTestResult>(
        (test): test is FailedTestResult => test.status === TestStatus.Failed,
      )
      const nrOfTests = dryRunResult.tests.filter(
        (test) => test.status !== TestStatus.Skipped,
      ).length

      if (failedTests.length > 0) {
        return {
          status: MutantRunStatus.Killed,
          failureMessage: failedTests[0].failureMessage,
          killedBy: reportAllKillers
            ? failedTests.map<string>((test) => test.id)
            : [failedTests[0].id],
          nrOfTests,
        }
      } else {
        return {
          status: MutantRunStatus.Survived,
          nrOfTests,
        }
      }
    }
    case DryRunStatus.Error:
      return {
        status: MutantRunStatus.Error,
        errorMessage: dryRunResult.errorMessage,
      }
    case DryRunStatus.Timeout:
      return {
        status: MutantRunStatus.Timeout,
        reason: dryRunResult.reason,
      }
  }
}
