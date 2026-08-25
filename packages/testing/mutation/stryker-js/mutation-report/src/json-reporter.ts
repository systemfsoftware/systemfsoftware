// node:url — no Effect Path equivalent for file URL conversion
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
import type * as FileSystem from 'effect/FileSystem'
import * as Path from 'effect/Path'

import { buildJsonReport } from './json-document.js'
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

export const makeJsonReporter = (params: {
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
        const filePath = path.normalize(options.jsonReporter.fileName)
        log.debug(`Using relative path ${filePath}`)
        yield* writeOutputFile(fs, path, path.resolve(filePath), buildJsonReport(report))
        log.info(`Your report can be found at: ${pathToFileURL(filePath).href}`)
      }).pipe(
        Effect.catchCause(
          (cause) =>
            Effect.fail(new ReporterFailed({ reporterName: 'json', event: 'onMutationTestReportReady', cause })),
        ),
      ),

    wrapUp: Effect.void,
  }
}
