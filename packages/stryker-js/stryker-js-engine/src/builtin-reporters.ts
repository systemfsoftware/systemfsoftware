import type { ReporterFactory } from '@systemfsoftware/stryker-js/Reporter'

import {
  type JsonReporterDeps,
  makeClearTextReporter,
  makeJsonReporter,
  makeProgressBarReporter,
  makeProgressStreamReporter,
} from './Reporter.js'

export type { JsonReporterDeps }

export const makeBuiltinReporterFactories = (
  services: JsonReporterDeps,
): Record<string, ReporterFactory> => ({
  'json': makeJsonReporter(services),
  'clear-text': makeClearTextReporter,
  'progress': makeProgressBarReporter,
  'progress-stream': makeProgressStreamReporter,
})
