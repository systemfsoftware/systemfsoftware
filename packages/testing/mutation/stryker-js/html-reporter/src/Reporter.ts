import type { MutantResult } from '@systemfsoftware/stryker-js/Mutant'
import { writeOutputFile } from '@systemfsoftware/stryker-js/output-file'
import type { ProvidedStrykerOptions } from '@systemfsoftware/stryker-js/provided-options'
import type {
  DryRunCompletedEvent,
  MutationTestingPlanReadyEvent,
  MutationTestMetricsResult,
} from '@systemfsoftware/stryker-js/Reporter'
import { ReporterFailed } from '@systemfsoftware/stryker-js/Reporter'
import type { ReporterService } from '@systemfsoftware/stryker-js/Reporter'
import * as Cause from 'effect/Cause'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Path from 'effect/Path'
import type * as schema from 'mutation-testing-report-schema/api'

import { buildHtmlDocument } from './Reporter.kernel.js'
import { HtmlReportCommand } from './Reporter.schema.js'

export const makeHtmlReporter = (params: {
  readonly options?: ProvidedStrykerOptions
  readonly fs: FileSystem.FileSystem
  readonly path: Path.Path
}): ReporterService => {
  const options = params.options

  return {
    onDryRunCompleted: (_event: DryRunCompletedEvent) => Effect.void,
    onMutationTestingPlanReady: (_event: MutationTestingPlanReadyEvent) => Effect.void,
    onMutantTested: (_result: MutantResult) => Effect.void,
    onMutationTestReportReady: (report: schema.MutationTestResult, metrics: MutationTestMetricsResult) =>
      Effect.gen(function*() {
        const path = yield* Path.Path
        const fs = yield* FileSystem.FileSystem
        const scriptPath = yield* path.fromFileUrl(
          new URL(import.meta.resolve('mutation-testing-elements/dist/mutation-test-elements.js')),
        )
        const scriptContent = yield* fs.readFileString(scriptPath)
        void metrics
        const html = buildHtmlDocument(HtmlReportCommand.make({ report, scriptContent })).html
        if (options === undefined) return
        const fileName = options.htmlReporter.fileName
        yield* Effect.logDebug(`Using file "${fileName}"`)
        yield* writeOutputFile(fs, path, fileName, html)
        const fileUrl = yield* path.toFileUrl(path.resolve(fileName))
        yield* Effect.logInfo(`Your report can be found at: ${fileUrl.href}`)
      }).pipe(
        Effect.provideService(FileSystem.FileSystem, params.fs),
        Effect.provideService(Path.Path, params.path),
        Effect.catchCause((cause) =>
          Effect.fail(
            new ReporterFailed({
              reporterName: 'html',
              event: 'onMutationTestReportReady',
              cause: Cause.pretty(cause),
            }),
          )
        ),
      ),
    wrapUp: Effect.void,
  }
}
