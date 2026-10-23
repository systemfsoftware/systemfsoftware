import * as Arr from 'effect/Array'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Option from 'effect/Option'
import * as Path from 'effect/Path'
import type { PlatformError } from 'effect/PlatformError'
import * as Random from 'effect/Random'
import type * as Schema from 'effect/Schema'

import type { ReporterConfig } from '../Config/config.schema.js'
import { ArtifactWriteFailed } from '../verdict/failure.schema.js'
import type { Report1 } from './report.schema.js'
import { renderJson } from './reporters/json.js'
import { renderJunit } from './reporters/junit.js'
import { renderList } from './reporters/list.js'
import { renderMarkdown } from './reporters/markdown.js'

export interface EmitReportsRequest {
  readonly report: Report1
  readonly reporters: ReporterConfig
  readonly root: string
  readonly output: string
}

interface Reporter {
  readonly render: (report: Report1) => Effect.Effect<string, Schema.SchemaError>
  readonly file: Option.Option<string>
}

const REPORTERS: { readonly [Name in ReporterConfig[number]]: Reporter } = {
  list: { render: (report) => Effect.succeed(renderList(report)), file: Option.none() },
  json: { render: renderJson, file: Option.none() },
  junit: { render: (report) => Effect.succeed(renderJunit(report)), file: Option.some('junit.xml') },
  markdown: { render: (report) => Effect.succeed(renderMarkdown(report)), file: Option.some('summary.md') },
}

const REPORT_FILE_MODE = 0o644

const writeFailed = (relative: string) => (error: PlatformError): ArtifactWriteFailed =>
  new ArtifactWriteFailed({
    message: `the report file ${relative} could not be written: ${error.message}`,
    evidence: [{ _tag: 'LogEvidence', text: relative }],
  })

const writtenAtomically = (
  request: EmitReportsRequest,
  file: string,
  text: string,
): Effect.Effect<void, ArtifactWriteFailed, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const relative = path.join(request.output, file)
    const directory = path.join(request.root, request.output)
    const temporary = path.join(directory, `.${file}.${(yield* Random.nextInt).toString(36)}.tmp`)
    yield* fs.makeDirectory(directory, { recursive: true }).pipe(
      Effect.andThen(fs.writeFileString(temporary, text, { flag: 'wx', mode: REPORT_FILE_MODE })),
      Effect.andThen(fs.rename(temporary, path.join(directory, file))),
      Effect.onError(() => Effect.ignore(fs.remove(temporary))),
      Effect.mapError(writeFailed(relative)),
    )
  })

const emitted = (request: EmitReportsRequest) =>
(
  name: ReporterConfig[number],
): Effect.Effect<Option.Option<string>, ArtifactWriteFailed | Schema.SchemaError, FileSystem.FileSystem | Path.Path> =>
  Effect.flatMap(
    REPORTERS[name].render(request.report),
    (text) =>
      Option.match(REPORTERS[name].file, {
        onNone: () => Effect.succeedSome(text),
        onSome: (file) => Effect.as(writtenAtomically(request, file, text), Option.none()),
      }),
  )

/**
 * Writes `junit.xml` and `summary.md` for the reporters that name them and returns, in reporter order, the text the
 * `list` and `json` reporters give the terminal; the CLI edge prints it.
 */
export const emitReports = (
  request: EmitReportsRequest,
): Effect.Effect<ReadonlyArray<string>, ArtifactWriteFailed | Schema.SchemaError, FileSystem.FileSystem | Path.Path> =>
  Effect.map(Effect.forEach(request.reporters, emitted(request)), Arr.getSomes)
