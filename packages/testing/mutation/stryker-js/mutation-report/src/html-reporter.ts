import fs from 'fs'
import path from 'path'

import { createRequire } from 'module'

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
import { buildReportHtml } from './html-kernel.js'
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

export class HtmlReporter implements ReporterService {
  constructor(
    private readonly options?: StrykerOptions,
    private readonly log: Logger = noopLogger(),
  ) {}

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
        this.log.debug(`Using file "${this.options.htmlReporter.fileName}"`)
        const require = createRequire(import.meta.url)
        const scriptContent = await fs.promises.readFile(
          require.resolve('mutation-testing-elements/dist/mutation-test-elements.js'),
          'utf-8',
        )
        const html = buildReportHtml(report, scriptContent)
        await reporterUtil.writeFile(this.options.htmlReporter.fileName, html)
        this.log.info(
          `Your report can be found at: ${pathToFileURL(path.resolve(this.options.htmlReporter.fileName)).href}`,
        )
      },
      catch: (cause) => new ReporterFailed({ reporterName: 'html', event: 'onMutationTestReportReady', cause }),
    })

  public readonly wrapUp = Effect.void
}
