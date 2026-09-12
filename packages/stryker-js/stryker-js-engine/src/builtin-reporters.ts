import type { ReporterFactory } from '@systemfsoftware/stryker-js'

import { makeClearTextReporter } from './clear-text-report.js'
import { type JsonReporterDeps, makeJsonReporter } from './json-reporter.js'
import { makeProgressBarReporter, makeProgressStreamReporter } from './progress-reporter.js'

export type { JsonReporterDeps }

export const makeBuiltinReporterFactories = (
  services: JsonReporterDeps,
): Record<string, ReporterFactory> => ({
  'json': makeJsonReporter(services),
  'clear-text': makeClearTextReporter,
  'progress': makeProgressBarReporter,
  'progress-stream': makeProgressStreamReporter,
})
