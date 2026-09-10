import { ReporterEventKind } from './ReporterEvent.schema.js'
export { ReporterFailed } from './Reporter.schema.js'

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

export const REPORTER_SCHEMA_VERSION = '1.0'

export interface TestRunnerCapabilities {
  readonly reloadEnvironment: boolean
}
