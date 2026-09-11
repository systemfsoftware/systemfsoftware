import { Wire } from '@systemfsoftware/effect-cell-types'
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

const RunTimingSchema = Wire.wire({
  net: Wire.mint(S.Finite),
  overhead: Wire.mint(S.Finite),
})
export type RunTiming = typeof RunTimingSchema.Type

const ReporterPlanKind = S.Literals(['EarlyResult', 'Run'])

const ReporterPlanDescriptorSchema = Wire.wire({
  mutantId: Wire.mint(S.String),
  plan: Wire.mint(ReporterPlanKind),
  netTime: Wire.mint(S.Finite),
  reloadEnvironment: Wire.mint(S.Boolean),
})
export type ReporterPlanDescriptor = typeof ReporterPlanDescriptorSchema.Type

export class DryRunCompleted extends S.TaggedClass<DryRunCompleted>()('dryRunCompleted', {
  timing: RunTimingSchema,
  capabilities: TestRunnerCapabilitiesSchema,
  testCount: Wire.mint(S.Finite),
  tests: S.Array(TestResultSchema),
}) {}

export class MutationTestingPlanReady extends S.TaggedClass<MutationTestingPlanReady>()(
  'mutationTestingPlanReady',
  {
    total: Wire.mint(S.Finite),
    plans: S.Array(ReporterPlanDescriptorSchema),
  },
) {}

export class MutantTested extends S.TaggedClass<MutantTested>()('mutantTested', {
  id: Wire.mint(S.String),
  status: MutantStatus,
  file: Wire.mint(S.String),
  location: LocationSchema,
  mutator: Wire.mint(S.String),
  replacement: Wire.mint(S.NullOr(Wire.mint(S.String))),
  completed: Wire.mint(S.Finite),
  total: Wire.mint(S.Finite),
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
