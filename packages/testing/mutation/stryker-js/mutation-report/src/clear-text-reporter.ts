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

import { renderClearText } from './clear-text-kernel.js'

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

export class ClearTextReporter implements ReporterService {
  private readonly out: NodeJS.WritableStream
  constructor(
    private readonly options?: StrykerOptions,
    private readonly log: Logger = noopLogger(),
    out: NodeJS.WritableStream = process.stdout,
  ) {
    this.out = out
  }

  public readonly onDryRunCompleted = (_event: DryRunCompletedEvent) => Effect.void

  public readonly onMutationTestingPlanReady = (_event: MutationTestingPlanReadyEvent) => Effect.void

  public readonly onMutantTested = (_result: MutantResult) => Effect.void

  public readonly onMutationTestReportReady = (
    report: schema.MutationTestResult,
    metrics: MutationTestMetricsResult,
  ) =>
    Effect.try({
      try: () => {
        if (this.options === undefined) return
        const { stdout, debug } = renderClearText(report, metrics, this.options)
        for (const line of stdout) {
          this.out.write(`${line}${os.EOL}`)
        }
        for (const line of debug) {
          this.log.debug(line)
        }
      },
      catch: (cause) => new ReporterFailed({ reporterName: 'clear-text', event: 'onMutationTestReportReady', cause }),
    })

  public readonly wrapUp = Effect.void
}
