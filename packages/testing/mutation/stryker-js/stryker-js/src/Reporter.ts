import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import type * as schema from 'mutation-testing-report-schema/api'
import type { MutantResult } from './Mutant.js'
import type { TestPlan } from './Mutant.js'
import type { ReporterFailed } from './Reporter.schema.js'
export { ReporterFailed } from './Reporter.schema.js'

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

export interface RunTiming {
  readonly net: number
  readonly overhead: number
}

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
