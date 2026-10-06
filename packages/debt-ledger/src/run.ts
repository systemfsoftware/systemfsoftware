import { Array as Arr, Effect, Match, Option, Path } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import { dual } from 'effect/Function'
import type { PlatformError } from 'effect/PlatformError'
import { build, type BuildEnv, type BuildError, type BuildResult } from './build.js'
import {
  ArtifactDrift,
  ArtifactMissing,
  type DebtLedgerError,
  StaleDeclarations,
  UndeclaredEntries,
} from './DebtLedgerError.schema.js'
import type { LedgerEntry, Status } from './Entry.schema.js'
import { renderJson } from './render-json.js'
import { renderMarkdown } from './render-md.js'

export type RunError = BuildError | ArtifactMissing | ArtifactDrift

export interface RunResult {
  readonly result: BuildResult
  readonly markdown: string
  readonly json: string
}

const statusNames = (status: Status, select: Status['_tag']): Option.Option<string> =>
  Match.value(status).pipe(
    Match.tag(select, () => Option.some('')),
    Match.orElse(() => Option.none()),
  )

const labelsOf = (entries: ReadonlyArray<LedgerEntry>, select: 'Undeclared' | 'Stale'): ReadonlyArray<string> =>
  Arr.flatMap(
    entries,
    (entry) =>
      Option.match(statusNames(entry.status, select), {
        onNone: () => [],
        onSome: () => [entry.id],
      }),
  )

const failWhenAny = <E>(
  labels: ReadonlyArray<string>,
  errorOf: (labels: ReadonlyArray<string>) => E,
): Effect.Effect<void, E> => labels.length === 0 ? Effect.void : Effect.fail(errorOf(labels))

const emitFile = (
  check: boolean,
  path: string,
  expected: string,
): Effect.Effect<void, ArtifactMissing | ArtifactDrift | PlatformError, FileSystem.FileSystem | Path.Path> =>
  check
    ? Effect.gen(function*() {
      const fs = yield* Effect.service(FileSystem.FileSystem)
      const actual = yield* fs.readFileString(path).pipe(Effect.option)
      return yield* Option.match(actual, {
        onNone: () => Effect.fail(ArtifactMissing.make({ path })),
        onSome: (content) => content === expected ? Effect.void : Effect.fail(ArtifactDrift.make({ path })),
      })
    })
    : Effect.gen(function*() {
      const fs = yield* Effect.service(FileSystem.FileSystem)
      const pathService = yield* Effect.service(Path.Path)
      yield* fs.makeDirectory(pathService.dirname(path), { recursive: true })
      yield* fs.writeFileString(path, expected)
    })

const audit = (
  result: BuildResult,
  markdown: string,
  json: string,
  check: boolean,
): Effect.Effect<
  void,
  DebtLedgerError | ArtifactMissing | ArtifactDrift | PlatformError,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function*() {
    yield* failWhenAny(
      labelsOf(result.ledger.entries, 'Undeclared'),
      (labels) => UndeclaredEntries.make({ entries: [...labels] }),
    )
    yield* failWhenAny(
      labelsOf(result.ledger.entries, 'Stale'),
      (labels) => StaleDeclarations.make({ entries: [...labels] }),
    )
    yield* emitFile(check, result.mdPath, markdown)
    yield* emitFile(check, result.jsonPath, json)
  })

export const run = dual<
  (check: boolean) => (dir: string) => Effect.Effect<RunResult, RunError, BuildEnv>,
  (dir: string, check: boolean) => Effect.Effect<RunResult, RunError, BuildEnv>
>(
  2,
  (dir: string, check: boolean): Effect.Effect<RunResult, RunError, BuildEnv> =>
    Effect.gen(function*() {
      const result = yield* build(dir)
      const markdown = renderMarkdown(result.ledger)
      const json = renderJson(result.ledger)
      yield* audit(result, markdown, json, check)
      return { result, markdown, json }
    }),
)
