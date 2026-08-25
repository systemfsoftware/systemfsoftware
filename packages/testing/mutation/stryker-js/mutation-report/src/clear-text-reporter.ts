import os from 'os'

import type { schema, StrykerOptions } from '@systemfsoftware/stryker-js-plugin-api/core'
import type { MutantResult } from '@systemfsoftware/stryker-js-plugin-api/core'
import type { Logger } from '@systemfsoftware/stryker-js-plugin-api/logging'
import type {
  DryRunCompletedEvent,
  MutationTestingPlanReadyEvent,
  MutationTestMetricsResult,
  ReporterService,
} from '@systemfsoftware/stryker-js-plugin-api/report'
import { ReporterFailed } from '@systemfsoftware/stryker-js-plugin-api/report'
import * as Effect from 'effect/Effect'

import { renderClearText } from './clear-text-render.js'
import type { ProvidedStrykerOptions } from './provided-options.js'

function noopLogger(): Logger {
  return {
    isTraceEnabled: () => false,
    isDebugEnabled: () => false,
    isInfoEnabled: () => false,
    isWarnEnabled: () => false,
    isErrorEnabled: () => false,
    isFatalEnabled: () => false,
    trace: () => {},
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    fatal: () => {},
  }
}

export const makeClearTextReporter = (params: {
  readonly options?: ProvidedStrykerOptions
  readonly log?: Logger
  readonly out?: NodeJS.WritableStream
}): ReporterService => {
  const options = params.options
  const log = params.log ?? noopLogger()
  const out = params.out ?? process.stdout
  return {
    onDryRunCompleted: (_event: DryRunCompletedEvent) => Effect.void,

    onMutationTestingPlanReady: (_event: MutationTestingPlanReadyEvent) => Effect.void,

    onMutantTested: (_result: MutantResult) => Effect.void,

    onMutationTestReportReady: (
      report: schema.MutationTestResult,
      metrics: MutationTestMetricsResult,
    ) =>
      Effect.try({
        try: () => {
          if (options === undefined) return
          const { stdout, debug } = renderClearText(report, metrics, options)
          for (const line of stdout) {
            out.write(`${line}${os.EOL}`)
          }
          for (const line of debug) {
            log.debug(line)
          }
        },
        catch: (cause) => new ReporterFailed({ reporterName: 'clear-text', event: 'onMutationTestReportReady', cause }),
      }),

    wrapUp: Effect.void,
  }
}
