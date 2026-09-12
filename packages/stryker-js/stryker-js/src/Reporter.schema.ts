import * as S from 'effect/Schema'

import { LocationCodec, MutantStatusCodec } from './Mutant.schema.js'
import type { StandardSchemaV1 } from './Plugin.schema.js'
import { MetricsResultCodec, MutationTestResultCodec } from './Report.schema.js'
import { TestResultCodec, TestRunnerCapabilitiesCodec } from './TestRunner.schema.js'

export const ReporterEventKindCodec = S.Literals([
  'dryRunCompleted',
  'mutationTestingPlanReady',
  'mutantTested',
  'mutationTestReportReady',
])
export type ReporterEventKind = S.Schema.Type<typeof ReporterEventKindCodec>

export const ReporterEventKindSchema: StandardSchemaV1<unknown, ReporterEventKind> = S.toStandardSchemaV1(
  ReporterEventKindCodec,
)

const RunTimingCodec = S.Struct({
  net: S.Finite,
  overhead: S.Finite,
})
export type RunTiming = S.Schema.Type<typeof RunTimingCodec>

const ReporterPlanDescriptorCodec = S.Struct({
  mutantId: S.String,
  plan: S.Literals(['EarlyResult', 'Run']),
  netTime: S.Finite,
  reloadEnvironment: S.Boolean,
})
export type ReporterPlanDescriptor = S.Schema.Type<typeof ReporterPlanDescriptorCodec>

export const DryRunCompletedCodec = S.TaggedStruct('dryRunCompleted', {
  timing: RunTimingCodec,
  capabilities: TestRunnerCapabilitiesCodec,
  testCount: S.Finite,
  tests: S.Array(TestResultCodec),
})
export type DryRunCompleted = S.Schema.Type<typeof DryRunCompletedCodec>

export const DryRunCompletedSchema: StandardSchemaV1<unknown, DryRunCompleted> = S.toStandardSchemaV1(
  DryRunCompletedCodec,
)

const MutationTestingPlanReadyCodec = S.TaggedStruct('mutationTestingPlanReady', {
  total: S.Finite,
  plans: S.Array(ReporterPlanDescriptorCodec),
})
export type MutationTestingPlanReady = S.Schema.Type<typeof MutationTestingPlanReadyCodec>

export const MutationTestingPlanReadySchema: StandardSchemaV1<unknown, MutationTestingPlanReady> = S.toStandardSchemaV1(
  MutationTestingPlanReadyCodec,
)

export const MutantTestedCodec = S.TaggedStruct('mutantTested', {
  id: S.String,
  status: MutantStatusCodec,
  file: S.String,
  location: LocationCodec,
  mutator: S.String,
  replacement: S.NullOr(S.String),
  completed: S.Finite,
  total: S.Finite,
})
export type MutantTested = S.Schema.Type<typeof MutantTestedCodec>

export const MutantTestedSchema: StandardSchemaV1<unknown, MutantTested> = S.toStandardSchemaV1(MutantTestedCodec)

const MutationTestReportReadyCodec = S.TaggedStruct('mutationTestReportReady', {
  report: MutationTestResultCodec,
  metrics: MetricsResultCodec,
})
export type MutationTestReportReady = S.Schema.Type<typeof MutationTestReportReadyCodec>

export const MutationTestReportReadySchema: StandardSchemaV1<unknown, MutationTestReportReady> = S.toStandardSchemaV1(
  MutationTestReportReadyCodec,
)

export const ReporterEventCodec = S.Union([
  DryRunCompletedCodec,
  MutationTestingPlanReadyCodec,
  MutantTestedCodec,
  MutationTestReportReadyCodec,
])
export type ReporterEvent =
  | DryRunCompleted
  | MutationTestingPlanReady
  | MutantTested
  | MutationTestReportReady

export const ReporterEventSchema: StandardSchemaV1<unknown, ReporterEvent> = S.toStandardSchemaV1(ReporterEventCodec)

const ReporterFailedCodec = S.TaggedStruct('ReporterFailed', {
  cause: S.String,
  event: ReporterEventKindCodec,
  reporterName: S.String,
})
export type ReporterFailed = S.Schema.Type<typeof ReporterFailedCodec>

export const ReporterFailedSchema: StandardSchemaV1<unknown, ReporterFailed> = S.toStandardSchemaV1(
  ReporterFailedCodec,
)
