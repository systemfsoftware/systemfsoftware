import { Wire } from '@systemfsoftware/effect-cell-types'
import * as S from 'effect/Schema'
import type { StandardSchemaV1 } from 'effect/StandardSchema'
import type * as reportApi from 'mutation-testing-report-schema/api'

import { LocationSchema } from './Mutant.schema.js'
import { MutantStatus } from './Run.schema.js'
import type { StrykerOptions } from './Schema.js'
import { TestResultSchema, TestRunnerCapabilitiesSchema } from './TestRunner.schema.js'

// ---------------------------------------------------------------------------
// Kind union — the closed four-kind vocabulary (R1, KTD5). Reporter.schema.ts
// pins ReporterFailed's event field to exactly these kinds.
// ---------------------------------------------------------------------------

export const ReporterEventKind = S.Literals([
  'dryRunCompleted',
  'mutationTestingPlanReady',
  'mutantTested',
  'mutationTestReportReady',
])
export type ReporterEventKind = typeof ReporterEventKind.Type

// ---------------------------------------------------------------------------
// Metrics — moved here from Reporter.ts so the protocol module is the single
// source; Reporter.ts re-exports them unchanged.
// ---------------------------------------------------------------------------

export interface Metrics {
  readonly pending: number
  readonly killed: number
  readonly timeout: number
  readonly survived: number
  readonly noCoverage: number
  readonly runtimeErrors: number
  readonly compileErrors: number
  readonly ignored: number
  readonly totalDetected: number
  readonly totalUndetected: number
  readonly totalInvalid: number
  readonly totalValid: number
  readonly totalMutants: number
  readonly totalCovered: number
  readonly mutationScore: number
  readonly mutationScoreBasedOnCoveredCode: number
}

export interface TestMetrics {
  readonly total: number
  readonly killing: number
  readonly covering: number
  readonly notCovering: number
}

export interface MetricsResult<TMetrics> {
  readonly name: string
  readonly metrics: TMetrics
  readonly childResults: readonly MetricsResult<TMetrics>[]
}

export interface MutationTestMetricsResult {
  readonly systemUnderTestMetrics: MetricsResult<Metrics>
  readonly testMetrics: MetricsResult<TestMetrics> | undefined
}

// ---------------------------------------------------------------------------
// Shared members
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Events — the four kinds as TaggedClass variants with the KTD1 reduced
// payloads. dryRunCompleted carries timing, capabilities, and test
// count/metadata without mutantCoverage; mutationTestingPlanReady carries the
// plan count plus reduced descriptors; mutantTested mirrors the RunEvent
// MutantTested shape with completed/total counters; mutationTestReportReady
// carries the full report document plus calculated metrics.
// ---------------------------------------------------------------------------

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

const isMutationTestResult = (_value: unknown): _value is reportApi.MutationTestResult => true
const MutationTestResultSchema = Wire.mint(S.Unknown.pipe(S.refine(isMutationTestResult)))
const isMutationTestMetricsResult = (_value: unknown): _value is MutationTestMetricsResult => true
const MutationTestMetricsResultSchema = Wire.mint(S.Unknown.pipe(S.refine(isMutationTestMetricsResult)))

export class MutationTestReportReady extends S.TaggedClass<MutationTestReportReady>()(
  'mutationTestReportReady',
  {
    report: MutationTestResultSchema,
    metrics: MutationTestMetricsResultSchema,
  },
) {}

// ---------------------------------------------------------------------------
// Union, Standard Schema face, and factory types
// ---------------------------------------------------------------------------

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
