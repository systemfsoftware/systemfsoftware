import { ReporterEventKind } from './ReporterEvent.schema.js'
export { ReporterFailed } from './Reporter.schema.js'

export { ReporterEventKind }
export type { Metrics, MetricsResult } from './Metrics.schema.js'
export {
  DryRunCompleted,
  MutantTested,
  MutationTestingPlanReady,
  MutationTestReportReady,
  ReporterEventSchema,
  ReporterEventUnion,
} from './ReporterEvent.schema.js'
export type {
  ReporterEvent,
  ReporterFactory,
  ReporterInit,
  ReporterPlanDescriptor,
  RunTiming,
} from './ReporterEvent.schema.js'

export const REPORTER_SCHEMA_VERSION = '1.0'
