import * as Arr from 'effect/Array'
import * as Effect from 'effect/Effect'
import type * as FileSystem from 'effect/FileSystem'
import * as Option from 'effect/Option'
import type * as Path from 'effect/Path'
import type * as Schema from 'effect/Schema'

import type { ReporterConfig } from '../Config/config.schema.js'
import type { ArtifactWriteFailed } from '../verdict/failure.schema.js'
import type { Report1 } from './report.schema.js'
import { renderJson } from './reporters/json.js'
import { renderJunit } from './reporters/junit.js'
import { renderList } from './reporters/list.js'
import { renderMarkdown } from './reporters/markdown.js'
import { writeAtomically } from './write-atomically.js'

export interface EmitReportsRequest {
  readonly report: Report1
  readonly reporters: ReporterConfig
  readonly root: string
  readonly output: string
}

interface Reporter {
  readonly render: (request: EmitReportsRequest) => Effect.Effect<string, Schema.SchemaError>
  readonly file: Option.Option<string>
}

const REPORTERS: { readonly [Name in ReporterConfig[number]]: Reporter } = {
  list: { render: ({ report }) => Effect.succeed(renderList(report)), file: Option.none() },
  json: { render: ({ report }) => renderJson(report), file: Option.none() },
  junit: { render: ({ report }) => Effect.succeed(renderJunit(report)), file: Option.some('junit.xml') },
  markdown: { render: (request) => Effect.succeed(renderMarkdown(request)), file: Option.some('summary.md') },
}

const emitted = (request: EmitReportsRequest) =>
(
  name: ReporterConfig[number],
): Effect.Effect<Option.Option<string>, ArtifactWriteFailed | Schema.SchemaError, FileSystem.FileSystem | Path.Path> =>
  Effect.flatMap(
    REPORTERS[name].render(request),
    (text) =>
      Option.match(REPORTERS[name].file, {
        onNone: () => Effect.succeedSome(text),
        onSome: (file) =>
          Effect.as(writeAtomically({ root: request.root, output: request.output, file, text }), Option.none()),
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
