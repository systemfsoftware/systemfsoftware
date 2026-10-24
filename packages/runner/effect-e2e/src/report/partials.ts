import { Sandwich } from '@systemfsoftware/effect-cell-types'
import * as Arr from 'effect/Array'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Option from 'effect/Option'
import * as Order from 'effect/Order'
import * as Path from 'effect/Path'
import type { PlatformError } from 'effect/PlatformError'
import * as Predicate from 'effect/Predicate'
import * as Schema from 'effect/Schema'

import type { AttemptEntry } from '../run/attempt.js'
import { failureClassOf } from '../verdict/failure-class.schema.js'
import type { ArtifactWriteFailed } from '../verdict/failure.schema.js'
import { buildReport } from './build.js'
import { mergeReports, ResultsOverlap, RunsDisagree } from './merge-reports.workflow.js'
import { EncodedPartial, type PartialState } from './partials.schema.js'
import { type RunErrors, type RunId, type RunRecord, TestId } from './report.schema.js'
import { renderJson } from './reporters/json.js'
import { writeAtomically } from './write-atomically.js'

/** The suite root and its configured output directory, under which `partials/` and `report.json` live. */
export interface PartialsLocation {
  readonly root: string
  readonly output: string
}

/** The run every worker's partial is stamped with; the global setup hands one run id to every worker. */
export interface PartialRun {
  readonly id: RunId
  readonly project: RunRecord['project']
  readonly startedAt: DateTime.Utc
}

export interface WritePartialRequest {
  readonly location: PartialsLocation
  readonly run: PartialRun
  /** Names this worker's partial file; unique per runner instance. */
  readonly worker: string
  readonly state: PartialState
  readonly entries: ReadonlyArray<AttemptEntry>
}

const PARTIALS = 'partials'
const REPORT = 'report.json'

const unfinished = (worker: string): RunErrors => [{
  code: 'INTERNAL_ERROR',
  cause: failureClassOf('INTERNAL_ERROR').cause,
  evidence: [{ _tag: 'LogEvidence', text: `worker ${worker} stopped before it finished its test files` }],
}]

const RUN_ERRORS: { readonly [State in PartialState]: (worker: string) => RunErrors } = {
  'in-progress': unfinished,
  finished: () => [],
}

/**
 * Writes one worker's `Report1` partial to `<output>/partials/<worker>.json`, replacing its previous snapshot
 * atomically. An `in-progress` partial carries an `INTERNAL_ERROR` run error, so a merge that includes a worker which
 * never finished ends with run status `error`.
 */
export const writePartial = (
  request: WritePartialRequest,
): Effect.Effect<void, ArtifactWriteFailed | Schema.SchemaError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const path = yield* Path.Path
    const report = buildReport({
      run: {
        id: request.run.id,
        project: request.run.project,
        startedAt: request.run.startedAt,
        finishedAt: yield* DateTime.now,
        errors: RUN_ERRORS[request.state](request.worker),
      },
      entries: request.entries,
    })
    yield* writeAtomically({
      root: request.location.root,
      output: request.location.output,
      file: path.join(PARTIALS, `${request.worker}.json`),
      text: yield* renderJson(report),
    })
  })

/** Removes the previous run's partials and merged report; the cache, results, and other artifacts stay. */
export const clearPartials = (
  location: PartialsLocation,
): Effect.Effect<void, PlatformError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    yield* fs.remove(path.join(location.root, location.output, PARTIALS), { recursive: true, force: true })
    yield* fs.remove(path.join(location.root, location.output, REPORT), { force: true })
  })

const isNotFound = (error: PlatformError): boolean => Predicate.isTagged(error.reason, 'NotFound')

const isPartialFile = (name: string): boolean => name.endsWith('.json') && !name.startsWith('.')

const partialsDirectoryOf = (path: Path.Path, location: PartialsLocation): string =>
  path.join(location.root, location.output, PARTIALS)

const partialNamesOf = (location: PartialsLocation) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const names = yield* fs.readDirectory(partialsDirectoryOf(path, location)).pipe(
      Effect.catchIf(isNotFound, () => Effect.succeed<ReadonlyArray<string>>([])),
    )
    return Arr.sort(Arr.filter(names, isPartialFile), Order.String)
  })

const encodedPartialOf = (location: PartialsLocation) => (name: string) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const text = yield* fs.readFileString(path.join(partialsDirectoryOf(path, location), name))
    return yield* Schema.decodeEffect(EncodedPartial)(text)
  })

const readPartials = (location: PartialsLocation) => (names: Arr.NonEmptyReadonlyArray<string>) =>
  Effect.gen(function*() {
    const [head, ...tail] = names
    const read = encodedPartialOf(location)
    return {
      _tag: 'MergeReports' as const,
      partials: [yield* read(head), ...(yield* Effect.forEach(tail, read))] as const,
    }
  })

const mergeCellOf = (location: PartialsLocation) =>
  Sandwich.named('e2e/merge-partials')(readPartials(location)).decide(mergeReports).write({
    ReportsMerged: (merged) =>
      writeAtomically({
        root: location.root,
        output: location.output,
        file: REPORT,
        text: `${JSON.stringify(merged.report, null, 2)}\n`,
      }),
    RunsDisagree: (disagreement) => Effect.fail(new RunsDisagree({ field: disagreement.field })),
    ResultsOverlap: (overlap) =>
      Effect.fail(
        new ResultsOverlap({ test: TestId.make(overlap.test), target: overlap.target, agent: overlap.agent }),
      ),
    CommandRejected: (rejected) => Effect.fail(new Sandwich.CommandRejected({ issue: rejected.issue })),
  })

/**
 * Merges every partial under `<output>/partials/` into `<output>/report.json` with `mergeReports`, and answers whether
 * a report was written: with no partial there is nothing to merge and no report. Partials of different runs, a result
 * two partials both hold, or a file that is not a `report-1` document fail the merge, and no report is written.
 */
export const mergePartials = (location: PartialsLocation) =>
  Effect.flatMap(
    partialNamesOf(location),
    (names) =>
      Option.match(Arr.isReadonlyArrayNonEmpty(names) ? Option.some(names) : Option.none(), {
        onNone: () => Effect.succeed(false),
        onSome: (present) => Effect.as(mergeCellOf(location).run(present), true),
      }),
  )
