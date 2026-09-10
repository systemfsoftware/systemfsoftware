import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import type * as schema from 'mutation-testing-report-schema/api'
import type { MutantResult } from './Mutant.js'
import type { TestPlan } from './Mutant.js'
import type { ReporterFailed } from './Reporter.schema.js'
export { ReporterFailed } from './Reporter.schema.js'
import { ReporterEventKind } from './ReporterEvent.schema.js'
import type { MutationTestMetricsResult, RunTiming } from './ReporterEvent.schema.js'

export { ReporterEventKind }
export {
  DryRunCompleted,
  MutantTested,
  MutationTestingPlanReady,
  MutationTestReportReady,
  ReporterEventSchema,
  ReporterEventUnion,
} from './ReporterEvent.schema.js'
export type {
  Metrics,
  MetricsResult,
  MutationTestMetricsResult,
  ReporterEvent,
  ReporterFactory,
  ReporterInit,
  ReporterPlanDescriptor,
  RunTiming,
  TestMetrics,
} from './ReporterEvent.schema.js'

// ---------------------------------------------------------------------------
// Protocol version — plain string following the STREAM_SCHEMA_VERSION
// precedent. It lives here rather than in ReporterEvent.schema.ts because a
// *.schema.ts file may export only schema declarations and type vocabulary.
// ---------------------------------------------------------------------------
export const REPORTER_SCHEMA_VERSION = '1.0'

export interface CompleteDryRunResultForReporter {
  readonly tests: readonly unknown[]
  readonly status: 'complete'
}

export interface TestRunnerCapabilities {
  readonly reloadEnvironment: boolean
}

export interface DryRunCompletedEvent {
  readonly result: CompleteDryRunResultForReporter
  readonly timing: RunTiming
  readonly capabilities: TestRunnerCapabilities
}

export interface MutationTestingPlanReadyEvent {
  readonly mutantPlans: readonly TestPlan[]
}

export interface ReporterService {
  readonly onDryRunCompleted: (event: DryRunCompletedEvent) => Effect.Effect<void, ReporterFailed>
  readonly onMutationTestingPlanReady: (event: MutationTestingPlanReadyEvent) => Effect.Effect<void, ReporterFailed>
  readonly onMutantTested: (result: Readonly<MutantResult>) => Effect.Effect<void, ReporterFailed>
  readonly onMutationTestReportReady: (
    report: Readonly<schema.MutationTestResult>,
    metrics: Readonly<MutationTestMetricsResult>,
  ) => Effect.Effect<void, ReporterFailed>
  readonly wrapUp: Effect.Effect<void, ReporterFailed>
}

export interface NamedReporter {
  readonly name: string
  readonly reporter: ReporterService
}

export class Reporter extends Context.Service<Reporter, ReporterService>()('~@systemfsoftware/stryker-js/Reporter') {}

export const broadcastReporter = (reporters: readonly NamedReporter[]): ReporterService => ({
  onDryRunCompleted: (event) =>
    Effect.forEach(reporters, (r) => r.reporter.onDryRunCompleted(event), { discard: true }),
  onMutationTestingPlanReady: (event) =>
    Effect.forEach(reporters, (r) => r.reporter.onMutationTestingPlanReady(event), { discard: true }),
  onMutantTested: (result) => Effect.forEach(reporters, (r) => r.reporter.onMutantTested(result), { discard: true }),
  onMutationTestReportReady: (report, metrics) =>
    Effect.forEach(reporters, (r) => r.reporter.onMutationTestReportReady(report, metrics), {
      discard: true,
    }),
  wrapUp: Effect.forEach(reporters, (r) => r.reporter.wrapUp, { discard: true }).pipe(Effect.asVoid),
})
