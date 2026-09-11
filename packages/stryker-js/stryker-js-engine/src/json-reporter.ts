import { errorToString } from '@systemfsoftware/stryker-js/Mutant'
import type * as schema from '@systemfsoftware/stryker-js/Report'
import type { ReporterFactory } from '@systemfsoftware/stryker-js/Reporter'
import { ReporterFailed } from '@systemfsoftware/stryker-js/Reporter'
import type { StrykerOptions } from '@systemfsoftware/stryker-js/Schema'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Path from 'effect/Path'

export interface JsonReporterDeps {
  readonly fileSystem: FileSystem.FileSystem
  readonly path: Path.Path
}

const writeReport = (
  services: JsonReporterDeps,
  options: StrykerOptions,
  report: schema.MutationTestResult,
): Promise<void> => {
  const json = JSON.stringify(report, null, 0)
  const write = Effect.gen(function*() {
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
  return Effect.runPromise(
    write.pipe(
      Effect.provideService(FileSystem.FileSystem, services.fileSystem),
      Effect.provideService(Path.Path, services.path),
    ),
  )
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
  return Option.match(Option.fromUndefinedOr(seen.report), {
    onNone: () => undefined,
    onSome: (report) => writeReport(services, options, report),
  })
}
