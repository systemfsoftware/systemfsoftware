export {
  CoverageAnalysisSchema,
  DryRunOptionsSchema,
  DryRunResultSchema,
  DryRunStatusSchema,
  MutantActivationSchema,
  MutantCoverageSchema,
  MutantRunOptionsSchema,
  MutantRunResultSchema,
  MutantRunStatusSchema,
  RunOptionsSchema,
  TestResultSchema,
  TestRunnerCapabilitiesSchema,
  TestRunnerFailedSchema,
  TestStatusSchema,
} from './TestRunner.schema.js'

export type {
  CompleteDryRunResult,
  CoverageAnalysis,
  DryRunOptions,
  DryRunResult,
  DryRunStatus,
  ErrorDryRunResult,
  ErrorMutantRunResult,
  FailedTestResult,
  KilledMutantRunResult,
  MutantActivation,
  MutantCoverage,
  MutantRunOptions,
  MutantRunResult,
  MutantRunStatus,
  RunOptions,
  SkippedTestResult,
  SuccessTestResult,
  SurvivedMutantRunResult,
  TestResult,
  TestRunnerCapabilities,
  TestRunnerFailed,
  TestStatus,
  TimeoutDryRunResult,
  TimeoutMutantRunResult,
} from './TestRunner.schema.js'

import type { PluginInit, StrykerOptions } from './Options.js'
import type {
  CompleteDryRunResult,
  DryRunOptions,
  DryRunResult,
  ErrorDryRunResult,
  ErrorMutantRunResult,
  FailedTestResult,
  KilledMutantRunResult,
  MutantRunOptions,
  MutantRunResult,
  SurvivedMutantRunResult,
  TestResult,
  TestRunnerCapabilities,
  TimeoutDryRunResult,
  TimeoutMutantRunResult,
} from './TestRunner.schema.js'

export interface TestRunner {
  readonly init?: (() => void | Promise<void>) | undefined
  readonly dispose?: (() => void | Promise<void>) | undefined
  readonly capabilities?: (() => TestRunnerCapabilities | Promise<TestRunnerCapabilities>) | undefined
  readonly dryRun?: ((options: DryRunOptions) => DryRunResult | Promise<DryRunResult>) | undefined
  readonly mutantRun?: ((options: MutantRunOptions) => MutantRunResult | Promise<MutantRunResult>) | undefined
}

export type TestRunnerFactory = (options: StrykerOptions, init: PluginInit) => TestRunner

const failedTests = (tests: readonly TestResult[]): readonly FailedTestResult[] =>
  tests.filter((test): test is FailedTestResult => test.status === 'failed')

const countedTests = (tests: readonly TestResult[]): number => tests.filter((test) => test.status !== 'skipped').length

const killerIds = (failed: readonly FailedTestResult[], reportAllKillers: boolean): readonly string[] => {
  if (reportAllKillers) return failed.map((test) => test.id)
  return failed.slice(0, 1).map((test) => test.id)
}

const completeResult = (
  complete: CompleteDryRunResult,
  reportAllKillers: boolean,
): KilledMutantRunResult | SurvivedMutantRunResult => {
  const failed = failedTests(complete.tests)
  const nrOfTests = countedTests(complete.tests)
  const first = failed.at(0)
  if (first === undefined) return { status: 'survived', nrOfTests }
  return {
    status: 'killed',
    killedBy: killerIds(failed, reportAllKillers),
    failureMessage: first.failureMessage,
    nrOfTests,
  }
}

const timeoutResult = (timedOut: TimeoutDryRunResult): TimeoutMutantRunResult => {
  if (timedOut.reason === undefined) return { status: 'timeout' }
  return { status: 'timeout', reason: timedOut.reason }
}

const incompleteResult = (
  result: ErrorDryRunResult | TimeoutDryRunResult,
): ErrorMutantRunResult | TimeoutMutantRunResult => {
  if (result.status === 'error') return { status: 'error', errorMessage: result.errorMessage }
  return timeoutResult(result)
}

export const toMutantRunResult = (dryRunResult: DryRunResult, reportAllKillers: boolean): MutantRunResult => {
  if (dryRunResult.status === 'complete') return completeResult(dryRunResult, reportAllKillers)
  return incompleteResult(dryRunResult)
}

export const testFilesProvided = (options: { readonly testFiles?: readonly string[] }): boolean =>
  options.testFiles !== undefined && options.testFiles.length > 0
