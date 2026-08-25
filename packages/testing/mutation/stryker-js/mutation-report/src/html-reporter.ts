// node:url — no Effect Path equivalent for file URL conversion
import { pathToFileURL } from 'url'
// node:module — require.resolve for bundled script lookup
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
import * as FileSystem from 'effect/FileSystem'
import * as Path from 'effect/Path'

import { buildReportHtml } from './html-document.js'
import { writeOutputFile } from './output-file.js'
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

export const makeHtmlReporter = (params: {
  readonly options?: ProvidedStrykerOptions
  readonly log?: Logger
  readonly fs: FileSystem.FileSystem
  readonly path: Path.Path
}): ReporterService => {
  const options = params.options
  const log = params.log ?? noopLogger()
  const fs = params.fs
  const path = params.path

  return {
    onDryRunCompleted: (_event: DryRunCompletedEvent) => Effect.void,

    onMutationTestingPlanReady: (_event: MutationTestingPlanReadyEvent) => Effect.void,

    onMutantTested: (_result: MutantResult) => Effect.void,

    onMutationTestReportReady: (
      report: schema.MutationTestResult,
      _metrics: MutationTestMetricsResult,
    ) =>
      Effect.gen(function*() {
        if (options === undefined) return
        log.debug(`Using file "${options.htmlReporter.fileName}"`)
        const require = createRequire(import.meta.url)
        const scriptPath = require.resolve('mutation-testing-elements/dist/mutation-test-elements.js')
        const scriptContent = yield* fs.readFileString(scriptPath)
        const html = buildReportHtml(report, scriptContent)
        yield* writeOutputFile(fs, path, options.htmlReporter.fileName, html)
        log.info(
          `Your report can be found at: ${pathToFileURL(path.resolve(options.htmlReporter.fileName)).href}`,
        )
      }).pipe(
        Effect.catchCause(
          (cause) =>
            Effect.fail(new ReporterFailed({ reporterName: 'html', event: 'onMutationTestReportReady', cause })),
        ),
      ),

    wrapUp: Effect.void,
  }
}
