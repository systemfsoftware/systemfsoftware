import * as Context from 'effect/Context'
import type * as Effect from 'effect/Effect'
import type * as S from 'effect/Schema'

import type { PositionSchema } from './Mutant.schema.js'
import type { TestRunnerFailed } from './TestRunner.schema.js'
import {
  CoverageAnalysisSchema,
  DryRunOptionsSchema,
  DryRunResultSchema,
  MutantActivationSchema,
  MutantRunOptionsSchema,
  MutantRunResultSchema,
  TestResultSchema,
  TestRunnerCapabilitiesSchema,
} from './TestRunner.schema.js'

export type CoverageAnalysis = S.Schema.Type<typeof CoverageAnalysisSchema>

export { TestId } from './Mutant.schema.js'
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
export type TestResult = S.Schema.Type<typeof TestResultSchema>

export type DryRunResult = S.Schema.Type<typeof DryRunResultSchema>

export type MutantRunResult = S.Schema.Type<typeof MutantRunResultSchema>

export type DryRunOptions = S.Schema.Type<typeof DryRunOptionsSchema>

export type MutantActivation = S.Schema.Type<typeof MutantActivationSchema>

export type MutantRunOptions = S.Schema.Type<typeof MutantRunOptionsSchema>

export type TestRunnerCapabilities = S.Schema.Type<typeof TestRunnerCapabilitiesSchema>

/**
 * Written out concretely: the nested record lazy does not survive the
 * declaration rollup, so consumers would read `unknown` through
 * `S.Schema.Type<typeof MutantCoverageSchema>`. Kept adjacent to the schema
 * it mirrors.
 */
export type MutantCoverage = {
  readonly perTest: { readonly [testId: string]: { readonly [mutantId: string]: number } }
  readonly static: { readonly [mutantId: string]: number }
}

export type CompleteDryRunResult = Extract<DryRunResult, { readonly status: 'complete' }>
export type TimeoutDryRunResult = Extract<DryRunResult, { readonly status: 'timeout' }>
export type ErrorDryRunResult = Extract<DryRunResult, { readonly status: 'error' }>
export type FailedTestResult = Extract<TestResult, { readonly status: 'failed' }>
export type SkippedTestResult = Extract<TestResult, { readonly status: 'skipped' }>
export type SuccessTestResult = Extract<TestResult, { readonly status: 'success' }>
export type KilledMutantRunResult = Extract<MutantRunResult, { readonly status: 'killed' }>
export type SurvivedMutantRunResult = Extract<MutantRunResult, { readonly status: 'survived' }>
export type TimeoutMutantRunResult = Extract<MutantRunResult, { readonly status: 'timeout' }>
export type ErrorMutantRunResult = Extract<MutantRunResult, { readonly status: 'error' }>
export type Position = S.Schema.Type<typeof PositionSchema>

export interface TestRunnerService {
  readonly capabilities: Effect.Effect<TestRunnerCapabilities, TestRunnerFailed>
  readonly dryRun: (options: DryRunOptions) => Effect.Effect<DryRunResult, TestRunnerFailed>
  readonly mutantRun: (options: MutantRunOptions) => Effect.Effect<MutantRunResult, TestRunnerFailed>
}

export class TestRunner
  extends Context.Service<TestRunner, TestRunnerService>()('~@systemfsoftware/stryker-js/TestRunner')
{}
