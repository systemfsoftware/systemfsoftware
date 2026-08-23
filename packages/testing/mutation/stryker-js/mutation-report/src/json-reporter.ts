import path from 'path'

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

import { pathToFileURL } from 'url'
import { buildJsonReport } from './json-kernel.js'
import { reporterUtil } from './reporter-util.js'

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

export class JsonReporter implements ReporterService {
  constructor(
    private readonly options?: StrykerOptions,
    private readonly log: Logger = noopLogger(),
  ) {
    if (this.options !== undefined) {
      reporterUtil.removeFileSync(path.resolve(path.normalize(this.options.jsonReporter.fileName)))
    }
  }

  public readonly onDryRunCompleted = (_event: DryRunCompletedEvent) => Effect.void

  public readonly onMutationTestingPlanReady = (_event: MutationTestingPlanReadyEvent) => Effect.void

  public readonly onMutantTested = (_result: MutantResult) => Effect.void

  public readonly onMutationTestReportReady = (
    report: schema.MutationTestResult,
    _metrics: MutationTestMetricsResult,
  ) =>
    Effect.tryPromise({
      try: async () => {
        if (this.options === undefined) return
        const filePath = path.normalize(this.options.jsonReporter.fileName)
        this.log.debug(`Using relative path ${filePath}`)
        await reporterUtil.writeFile(
          path.resolve(filePath),
          buildJsonReport(report),
        )
        this.log.info(
          `Your report can be found at: ${pathToFileURL(filePath).href}`,
        )
      },
      catch: (cause) => new ReporterFailed({ reporterName: 'json', event: 'onMutationTestReportReady', cause }),
    })

  public readonly wrapUp = Effect.void
}
