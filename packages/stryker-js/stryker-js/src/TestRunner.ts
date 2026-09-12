import * as Context from 'effect/Context'
import type * as Effect from 'effect/Effect'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'

import type { Mutant } from './Mutant.js'
import type { Position } from './Report.schema.js'
import type { TestRunnerFailed } from './TestRunner.schema.js'

export {
  CoverageAnalysisSchema,
  DryRunOptionsSchema,
  DryRunResultSchema,
  DryRunStatus,
  MutantActivationSchema,
  MutantCoverageSchema,
  MutantRunOptionsSchema,
  MutantRunResultSchema,
  MutantRunStatus,
  TestResultSchema,
  TestRunnerCapabilitiesSchema,
  TestRunnerFailed,
  TestStatus,
} from './TestRunner.schema.js'

export interface BaseTestResult {
  readonly id: string
  readonly name: string
  readonly timeSpentMs: number
  readonly fileName?: string
  readonly startPosition?: Position
}

export interface FailedTestResult extends BaseTestResult {
  readonly status: 'failed'
  readonly failureMessage: string
}

export interface SkippedTestResult extends BaseTestResult {
  readonly status: 'skipped'
}

export interface SuccessTestResult extends BaseTestResult {
  readonly status: 'success'
}

export type TestResult = FailedTestResult | SkippedTestResult | SuccessTestResult

export interface MutantCoverage {
  readonly perTest: Record<string, Record<string, number>>
  readonly static: Record<string, number>
}

export interface CompleteDryRunResult {
  readonly tests: readonly TestResult[]
  readonly mutantCoverage?: MutantCoverage
  readonly status: 'complete'
}

export interface TimeoutDryRunResult {
  readonly status: 'timeout'
  readonly reason?: string
}

export interface ErrorDryRunResult {
  readonly status: 'error'
  readonly errorMessage: string
}

export type DryRunResult = CompleteDryRunResult | ErrorDryRunResult | TimeoutDryRunResult

export interface TimeoutMutantRunResult {
  readonly status: 'timeout'
  readonly reason?: string
}

export interface KilledMutantRunResult {
  readonly status: 'killed'
  readonly killedBy: readonly string[]
  readonly failureMessage: string
  readonly nrOfTests: number
}

export interface SurvivedMutantRunResult {
  readonly status: 'survived'
  readonly nrOfTests: number
}

export interface ErrorMutantRunResult {
  readonly status: 'error'
  readonly errorMessage: string
}

export type MutantRunResult =
  | ErrorMutantRunResult
  | KilledMutantRunResult
  | SurvivedMutantRunResult
  | TimeoutMutantRunResult

export type CoverageAnalysis = 'off' | 'all' | 'perTest'

export interface RunOptions {
  readonly timeout: number
  readonly disableBail: boolean
}

export interface DryRunOptions extends RunOptions {
  readonly coverageAnalysis: CoverageAnalysis
  readonly files?: readonly string[]
  readonly testFiles?: readonly string[]
}

export type MutantActivation = 'runtime' | 'static'

export interface MutantRunOptions extends RunOptions {
  readonly testFilter?: readonly string[]
  readonly hitLimit?: number
  readonly activeMutant: Mutant
  readonly sandboxFileName: string
  readonly mutantActivation: MutantActivation
  readonly reloadEnvironment: boolean
}

export interface TestRunnerCapabilities {
  readonly reloadEnvironment: boolean
}

export function toMutantRunResult(
  dryRunResult: DryRunResult,
  reportAllKillers: boolean,
): MutantRunResult {
  return Match.value(dryRunResult).pipe(
    Match.discriminator('status')('complete', (complete): KilledMutantRunResult | SurvivedMutantRunResult => {
      const failed = complete.tests.filter(
        (t): t is FailedTestResult => t.status === 'failed',
      )
      const nrOfTests = complete.tests.filter((t) => t.status !== 'skipped').length
      return Option.match(Option.fromUndefinedOr(failed.at(0)), {
        onNone: (): SurvivedMutantRunResult => ({ nrOfTests, status: 'survived' }),
        onSome: (firstFailed): KilledMutantRunResult => ({
          failureMessage: firstFailed.failureMessage,
          killedBy: Match.value(reportAllKillers).pipe(
            Match.when(true, () => failed.map((t) => t.id)),
            Match.when(false, () => [firstFailed.id]),
            Match.exhaustive,
          ),
          nrOfTests,
          status: 'killed',
        }),
      })
    }),
    Match.discriminator('status')('error', (errored): ErrorMutantRunResult => ({
      errorMessage: errored.errorMessage,
      status: 'error',
    })),
    Match.discriminator('status')(
      'timeout',
      (timedOut): TimeoutMutantRunResult =>
        Option.match(Option.fromUndefinedOr(timedOut.reason), {
          onNone: (): TimeoutMutantRunResult => ({ status: 'timeout' }),
          onSome: (reason): TimeoutMutantRunResult => ({ reason, status: 'timeout' }),
        }),
    ),
    Match.exhaustive,
  )
}

export interface TestRunnerService {
  readonly capabilities: Effect.Effect<TestRunnerCapabilities, TestRunnerFailed>
  readonly init: Effect.Effect<void, TestRunnerFailed>
  readonly dryRun: (options: DryRunOptions) => Effect.Effect<DryRunResult, TestRunnerFailed>
  readonly mutantRun: (options: MutantRunOptions) => Effect.Effect<MutantRunResult, TestRunnerFailed>
  readonly dispose: Effect.Effect<void, TestRunnerFailed>
}

export class TestRunner
  extends Context.Service<TestRunner, TestRunnerService>()('~@systemfsoftware/stryker-js/TestRunner')
{}

export function testFilesProvided(options: { readonly testFiles?: readonly string[] }): boolean {
  return options.testFiles !== undefined && options.testFiles.length > 0
}
