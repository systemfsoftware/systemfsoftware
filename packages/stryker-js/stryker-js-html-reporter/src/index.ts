import type { MutantResult } from '@systemfsoftware/stryker-js/Mutant'
import { OutputFile, OutputFileLive } from '@systemfsoftware/stryker-js/output-file'
import { declarePlugin, RunConfiguration } from '@systemfsoftware/stryker-js/Plugin'
import { Reporter, ReporterFailed } from '@systemfsoftware/stryker-js/Reporter'
import type {
  DryRunCompletedEvent,
  MutationTestingPlanReadyEvent,
  MutationTestMetricsResult,
  ReporterService,
} from '@systemfsoftware/stryker-js/Reporter'
import * as Cause from 'effect/Cause'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Layer from 'effect/Layer'
import * as Path from 'effect/Path'
import type * as schema from 'mutation-testing-report-schema/api'

import { buildHtmlDocument } from './Reporter.js'
import { HtmlReportCommand } from './Reporter.schema.js'

export const strykerPlugins = [
  declarePlugin(
    'Reporter',
    'html',
    Layer.effect(
      Reporter,
      Effect.gen(function*() {
        const options = yield* RunConfiguration
        const fs = yield* FileSystem.FileSystem
        const path = yield* Path.Path
        const outputFile = yield* OutputFile
        const service: ReporterService = {
          onDryRunCompleted: (_event: DryRunCompletedEvent) => Effect.void,
          onMutationTestingPlanReady: (_event: MutationTestingPlanReadyEvent) => Effect.void,
          onMutantTested: (_result: MutantResult) => Effect.void,
          onMutationTestReportReady: (
            report: Readonly<schema.MutationTestResult>,
            metrics: Readonly<MutationTestMetricsResult>,
          ) =>
            Effect.gen(function*() {
              const scriptPath = yield* path.fromFileUrl(
                new URL(import.meta.resolve('mutation-testing-elements/dist/mutation-test-elements.js')),
              )
              const scriptContent = yield* fs.readFileString(scriptPath)
              void metrics
              const html = buildHtmlDocument(HtmlReportCommand.make({ report, scriptContent })).html
              const fileName = options.htmlReporter.fileName
              yield* Effect.logDebug(`Using file "${fileName}"`)
              yield* outputFile.writeOutputFile(fileName, html)
              const fileUrl = yield* path.toFileUrl(path.resolve(fileName))
              yield* Effect.logInfo(`Your report can be found at: ${fileUrl.href}`)
            }).pipe(
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
        return service
      }),
    ).pipe(Layer.provide(OutputFileLive)),
  ),
]
