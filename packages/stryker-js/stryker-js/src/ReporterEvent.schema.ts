import * as S from 'effect/Schema'
import type { StandardSchemaV1 } from 'effect/StandardSchema'

import { MetricsResultSchema } from './Metrics.schema.js'
import { LocationSchema } from './Mutant.schema.js'
import { MutationTestResultSchema } from './Report.schema.js'
import { MutantStatus } from './Run.schema.js'
import type { StrykerOptions } from './Schema.js'
import { TestResultSchema, TestRunnerCapabilitiesSchema } from './TestRunner.schema.js'

export const ReporterEventKind = S.Literals([
  'dryRunCompleted',
  'mutationTestingPlanReady',
  'mutantTested',
  'mutationTestReportReady',
])
export type ReporterEventKind = typeof ReporterEventKind.Type

const RunTimingSchema = S.Struct({
  net: S.Finite,
  overhead: S.Finite,
})
export type RunTiming = typeof RunTimingSchema.Type

const ReporterPlanKind = S.Literals(['EarlyResult', 'Run'])

const ReporterPlanDescriptorSchema = S.Struct({
  mutantId: S.String,
  plan: ReporterPlanKind,
  netTime: S.Finite,
  reloadEnvironment: S.Boolean,
})
export type ReporterPlanDescriptor = typeof ReporterPlanDescriptorSchema.Type

export class DryRunCompleted extends S.TaggedClass<DryRunCompleted>()('dryRunCompleted', {
  timing: RunTimingSchema,
  capabilities: TestRunnerCapabilitiesSchema,
  testCount: S.Finite,
  tests: S.Array(TestResultSchema),
}) {}

export class MutationTestingPlanReady extends S.TaggedClass<MutationTestingPlanReady>()(
  'mutationTestingPlanReady',
  {
    total: S.Finite,
    plans: S.Array(ReporterPlanDescriptorSchema),
  },
) {}

export class MutantTested extends S.TaggedClass<MutantTested>()('mutantTested', {
  id: S.String,
  status: MutantStatus,
  file: S.String,
  location: LocationSchema,
  mutator: S.String,
  replacement: S.NullOr(S.String),
  completed: S.Finite,
  total: S.Finite,
}) {}

export class MutationTestReportReady extends S.TaggedClass<MutationTestReportReady>()(
  'mutationTestReportReady',
  {
    report: MutationTestResultSchema,
    metrics: MetricsResultSchema,
  },
) {}

export const ReporterEventUnion = S.Union([
  DryRunCompleted,
  MutationTestingPlanReady,
  MutantTested,
  MutationTestReportReady,
])

export type ReporterEvent = DryRunCompleted | MutationTestingPlanReady | MutantTested | MutationTestReportReady

const standardReporterEvents = S.toStandardSchemaV1(ReporterEventUnion)

export const ReporterEventSchema: StandardSchemaV1<unknown, ReporterEvent> = standardReporterEvents

export interface ReporterInit {
  readonly traceparent?: string | undefined
  readonly tracestate?: string | undefined
}

export type ReporterFactory = (
  options: StrykerOptions,
  init: ReporterInit,
) => (events: AsyncIterable<ReporterEvent>) => Promise<void>

export class ReporterFailed extends S.TaggedError<ReporterFailed>()('ReporterFailed', {
  cause: S.String,
  event: ReporterEventKind,
  reporterName: S.String,
}) {}
