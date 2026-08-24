import fs from 'fs'
import path from 'path'
import { pathToFileURL } from 'url'

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
import { createRequire } from 'module'

import { buildReportHtml } from './html-kernel.js'
import { writeOutputFile } from './output-file.js'

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

export const makeHtmlReporter = (params: {
  readonly options?: StrykerOptions
  readonly log?: Logger
}): ReporterService => {
  const options = params.options
  const log = params.log ?? noopLogger()

  return {
    onDryRunCompleted: (_event: DryRunCompletedEvent) => Effect.void,

    onMutationTestingPlanReady: (_event: MutationTestingPlanReadyEvent) => Effect.void,

    onMutantTested: (_result: MutantResult) => Effect.void,

    onMutationTestReportReady: (
      report: schema.MutationTestResult,
      _metrics: MutationTestMetricsResult,
    ) =>
      Effect.tryPromise({
        try: async () => {
          if (options === undefined) return
          log.debug(`Using file "${options.htmlReporter.fileName}"`)
          const require = createRequire(import.meta.url)
          const scriptContent = await fs.promises.readFile(
            require.resolve('mutation-testing-elements/dist/mutation-test-elements.js'),
            'utf-8',
          )
          const html = buildReportHtml(report, scriptContent)
          await writeOutputFile(options.htmlReporter.fileName, html)
          log.info(
            `Your report can be found at: ${pathToFileURL(path.resolve(options.htmlReporter.fileName)).href}`,
          )
        },
        catch: (cause) => new ReporterFailed({ reporterName: 'html', event: 'onMutationTestReportReady', cause }),
      }),

    wrapUp: Effect.void,
  }
}
