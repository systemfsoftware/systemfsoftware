export {
  DryRunCompletedSchema,
  MutantTestedSchema,
  MutationTestingPlanReadySchema,
  MutationTestReportReadySchema,
  ReporterEventKindSchema,
  ReporterEventSchema,
  ReporterFailedSchema,
} from './Reporter.schema.js'

export type {
  DryRunCompleted,
  MutantTested,
  MutationTestingPlanReady,
  MutationTestReportReady,
  ReporterEvent,
  ReporterEventKind,
  ReporterFailed,
  ReporterPlanDescriptor,
  RunTiming,
} from './Reporter.schema.js'

import type { PluginInit, StrykerOptions } from './Options.js'
import type { ReporterEvent } from './Reporter.schema.js'

export const REPORTER_SCHEMA_VERSION = '1.0'

export type ReporterInit = PluginInit

export type ReporterFactory = (
  options: StrykerOptions,
  init: ReporterInit,
) => (events: AsyncIterable<ReporterEvent>) => Promise<void>
