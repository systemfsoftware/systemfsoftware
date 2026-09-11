import { errorToString } from '@systemfsoftware/stryker-js/Mutant'
import type * as schema from '@systemfsoftware/stryker-js/Report'
import type { ReporterFactory } from '@systemfsoftware/stryker-js/Reporter'
import { ReporterFailed } from '@systemfsoftware/stryker-js/Reporter'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Match from 'effect/Match'
import * as Path from 'effect/Path'

export interface JsonReporterDeps {
  readonly fileSystem: FileSystem.FileSystem
  readonly path: Path.Path
}

export const makeJsonReporter = (services: JsonReporterDeps): ReporterFactory => (options) => async (events) => {
  const seen: { report?: schema.MutationTestResult } = {}
  for await (const event of events) {
    Match.value(event).pipe(
      Match.tag('mutationTestReportReady', (ready) => {
        seen.report = ready.report
      }),
      Match.orElse(() => undefined),
    )
  }
  if (seen.report === undefined) {
    return
  }
  const json = JSON.stringify(seen.report, null, 0)
  const writeReport = Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const fileName = path.resolve(path.normalize(options.jsonReporter.fileName))
    if (options.logLevel === 'debug') {
      process.stderr.write(`Using relative path ${path.normalize(options.jsonReporter.fileName)}\n`)
    }
    const failAsJsonReporter = (cause: unknown): ReporterFailed =>
      new ReporterFailed({
        reporterName: 'json',
        event: 'mutationTestReportReady',
        cause: errorToString(cause),
      })
    yield* fs.makeDirectory(path.dirname(fileName), { recursive: true }).pipe(
      Effect.mapError(failAsJsonReporter),
    )
    yield* fs.writeFileString(fileName, json).pipe(Effect.mapError(failAsJsonReporter))
    const url = yield* path.toFileUrl(fileName).pipe(Effect.mapError(failAsJsonReporter))
    process.stdout.write(`Your report can be found at: ${url.href}\n`)
  })
  await Effect.runPromise(
    writeReport.pipe(
      Effect.provideService(FileSystem.FileSystem, services.fileSystem),
      Effect.provideService(Path.Path, services.path),
    ),
  )
}
