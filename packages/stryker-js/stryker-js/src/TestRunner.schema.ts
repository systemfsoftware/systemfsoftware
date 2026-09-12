import * as S from 'effect/Schema'

import { MutantCodec, PositionCodec } from './Mutant.schema.js'
import type { StandardSchemaV1 } from './Plugin.schema.js'

export const TestStatusCodec = S.Literals(['success', 'failed', 'skipped'])
export type TestStatus = S.Schema.Type<typeof TestStatusCodec>

export const TestStatusSchema: StandardSchemaV1<unknown, TestStatus> = S.toStandardSchemaV1(TestStatusCodec)

const TestResultBase = {
  id: S.String,
  name: S.String,
  timeSpentMs: S.Finite,
  fileName: S.optionalKey(S.String),
  startPosition: S.optionalKey(PositionCodec),
}

const FailedTestResultCodec = S.Struct({
  ...TestResultBase,
  status: S.Literal('failed'),
  failureMessage: S.String,
})
export type FailedTestResult = S.Schema.Type<typeof FailedTestResultCodec>

const SkippedTestResultCodec = S.Struct({ ...TestResultBase, status: S.Literal('skipped') })
export type SkippedTestResult = S.Schema.Type<typeof SkippedTestResultCodec>

const SuccessTestResultCodec = S.Struct({ ...TestResultBase, status: S.Literal('success') })
export type SuccessTestResult = S.Schema.Type<typeof SuccessTestResultCodec>

export const TestResultCodec = S.Union([FailedTestResultCodec, SkippedTestResultCodec, SuccessTestResultCodec])
export type TestResult = S.Schema.Type<typeof TestResultCodec>

export const TestResultSchema: StandardSchemaV1<unknown, TestResult> = S.toStandardSchemaV1(TestResultCodec)

export const DryRunStatusCodec = S.Literals(['complete', 'error', 'timeout'])
export type DryRunStatus = S.Schema.Type<typeof DryRunStatusCodec>

export const DryRunStatusSchema: StandardSchemaV1<unknown, DryRunStatus> = S.toStandardSchemaV1(DryRunStatusCodec)

export const MutantRunStatusCodec = S.Literals(['killed', 'survived', 'timeout', 'error'])
export type MutantRunStatus = S.Schema.Type<typeof MutantRunStatusCodec>

export const MutantRunStatusSchema: StandardSchemaV1<unknown, MutantRunStatus> = S.toStandardSchemaV1(
  MutantRunStatusCodec,
)

const MutantCoverageCodec = S.Struct({
  perTest: S.Record(S.String, S.Record(S.String, S.Finite)),
  static: S.Record(S.String, S.Finite),
})
export type MutantCoverage = S.Schema.Type<typeof MutantCoverageCodec>

export const MutantCoverageSchema: StandardSchemaV1<unknown, MutantCoverage> = S.toStandardSchemaV1(
  MutantCoverageCodec,
)

const CompleteDryRunResultCodec = S.Struct({
  status: S.Literal('complete'),
  tests: S.Array(TestResultCodec),
  mutantCoverage: S.optionalKey(MutantCoverageCodec),
})
export type CompleteDryRunResult = S.Schema.Type<typeof CompleteDryRunResultCodec>

const TimeoutDryRunResultCodec = S.Struct({
  status: S.Literal('timeout'),
  reason: S.optionalKey(S.String),
})
export type TimeoutDryRunResult = S.Schema.Type<typeof TimeoutDryRunResultCodec>

const ErrorDryRunResultCodec = S.Struct({
  status: S.Literal('error'),
  errorMessage: S.String,
})
export type ErrorDryRunResult = S.Schema.Type<typeof ErrorDryRunResultCodec>

const DryRunResultCodec = S.Union([CompleteDryRunResultCodec, TimeoutDryRunResultCodec, ErrorDryRunResultCodec])
export type DryRunResult = S.Schema.Type<typeof DryRunResultCodec>

export const DryRunResultSchema: StandardSchemaV1<unknown, DryRunResult> = S.toStandardSchemaV1(DryRunResultCodec)

const KilledMutantRunResultCodec = S.Struct({
  status: S.Literal('killed'),
  killedBy: S.Array(S.String),
  failureMessage: S.String,
  nrOfTests: S.Finite,
})
export type KilledMutantRunResult = S.Schema.Type<typeof KilledMutantRunResultCodec>

const SurvivedMutantRunResultCodec = S.Struct({
  status: S.Literal('survived'),
  nrOfTests: S.Finite,
})
export type SurvivedMutantRunResult = S.Schema.Type<typeof SurvivedMutantRunResultCodec>

const TimeoutMutantRunResultCodec = S.Struct({
  status: S.Literal('timeout'),
  reason: S.optionalKey(S.String),
})
export type TimeoutMutantRunResult = S.Schema.Type<typeof TimeoutMutantRunResultCodec>

const ErrorMutantRunResultCodec = S.Struct({
  status: S.Literal('error'),
  errorMessage: S.String,
})
export type ErrorMutantRunResult = S.Schema.Type<typeof ErrorMutantRunResultCodec>

const MutantRunResultCodec = S.Union([
  KilledMutantRunResultCodec,
  SurvivedMutantRunResultCodec,
  TimeoutMutantRunResultCodec,
  ErrorMutantRunResultCodec,
])
export type MutantRunResult = S.Schema.Type<typeof MutantRunResultCodec>

export const MutantRunResultSchema: StandardSchemaV1<unknown, MutantRunResult> = S.toStandardSchemaV1(
  MutantRunResultCodec,
)

export const CoverageAnalysisCodec = S.Literals(['off', 'all', 'perTest'])
export type CoverageAnalysis = S.Schema.Type<typeof CoverageAnalysisCodec>

export const CoverageAnalysisSchema: StandardSchemaV1<unknown, CoverageAnalysis> = S.toStandardSchemaV1(
  CoverageAnalysisCodec,
)

export const MutantActivationCodec = S.Literals(['runtime', 'static'])
export type MutantActivation = S.Schema.Type<typeof MutantActivationCodec>

export const MutantActivationSchema: StandardSchemaV1<unknown, MutantActivation> = S.toStandardSchemaV1(
  MutantActivationCodec,
)

const RunOptionsFields = {
  timeout: S.Finite,
  disableBail: S.Boolean,
}

const RunOptionsCodec = S.Struct(RunOptionsFields)
export type RunOptions = S.Schema.Type<typeof RunOptionsCodec>

export const RunOptionsSchema: StandardSchemaV1<unknown, RunOptions> = S.toStandardSchemaV1(RunOptionsCodec)

const DryRunOptionsCodec = S.Struct({
  ...RunOptionsFields,
  coverageAnalysis: CoverageAnalysisCodec,
  files: S.optionalKey(S.Array(S.String)),
  testFiles: S.optionalKey(S.Array(S.String)),
})
export type DryRunOptions = S.Schema.Type<typeof DryRunOptionsCodec>

export const DryRunOptionsSchema: StandardSchemaV1<unknown, DryRunOptions> = S.toStandardSchemaV1(DryRunOptionsCodec)

const MutantRunOptionsCodec = S.Struct({
  ...RunOptionsFields,
  activeMutant: MutantCodec,
  sandboxFileName: S.String,
  mutantActivation: MutantActivationCodec,
  reloadEnvironment: S.Boolean,
  testFilter: S.optionalKey(S.Array(S.String)),
  hitLimit: S.optionalKey(S.Finite),
})
export type MutantRunOptions = S.Schema.Type<typeof MutantRunOptionsCodec>

export const MutantRunOptionsSchema: StandardSchemaV1<unknown, MutantRunOptions> = S.toStandardSchemaV1(
  MutantRunOptionsCodec,
)

export const TestRunnerCapabilitiesCodec = S.Struct({
  reloadEnvironment: S.Boolean,
})
export type TestRunnerCapabilities = S.Schema.Type<typeof TestRunnerCapabilitiesCodec>

export const TestRunnerCapabilitiesSchema: StandardSchemaV1<unknown, TestRunnerCapabilities> = S.toStandardSchemaV1(
  TestRunnerCapabilitiesCodec,
)

const TestRunnerFailedCodec = S.TaggedStruct('TestRunnerFailed', {
  cause: S.String,
  phase: S.Literals(['capabilities', 'dispose', 'dryRun', 'init', 'mutantRun']),
  runnerName: S.String,
})
export type TestRunnerFailed = S.Schema.Type<typeof TestRunnerFailedCodec>

export const TestRunnerFailedSchema: StandardSchemaV1<unknown, TestRunnerFailed> = S.toStandardSchemaV1(
  TestRunnerFailedCodec,
)
