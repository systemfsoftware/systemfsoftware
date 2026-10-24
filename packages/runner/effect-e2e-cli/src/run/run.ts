import * as Console from 'effect/Console'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Option from 'effect/Option'
import * as Path from 'effect/Path'
import * as Predicate from 'effect/Predicate'
import * as Ref from 'effect/Ref'
import * as Schema from 'effect/Schema'
import { type CliOptions, createVitest, type Vitest } from 'vitest/node'

import { type ConfigInvalid, RUN_OVERRIDE_ENV } from '@systemfsoftware/effect-e2e'
import { emitReports, Report1 } from '@systemfsoftware/effect-e2e/report'
import { exitCodeReporter } from '@systemfsoftware/effect-e2e/runner'

import { channelsOf, type Reporter, type RunChannels, type RunFlagValues } from './flags.js'
import { lastFailedOf } from './last-failed.js'
import { RunConfigRefused, RunEnded, RunFailed, type RunRefused } from './run-failure.schema.js'
import { runRootOf } from './suite-root.js'

export interface RunRequest {
  readonly dir: Option.Option<string>
  readonly flags: RunFlagValues
}

type RunError = RunRefused | RunConfigRefused | RunFailed | RunEnded

type Refusal = Ref.Ref<Option.Option<ConfigInvalid>>

type Services = FileSystem.FileSystem | Path.Path

const DEFAULT_OUTPUT = '.e2e'
const REPORT = 'report.json'
const NOTHING_TO_RERUN = 'the previous run left no failed test to rerun'

const decodeReport = Schema.decodeEffect(Schema.fromJsonString(Report1))

// The suite's e2e.config.ts reads the overrides in this process (global setup) and Vitest copies this process's
// environment into every worker, so the CLI's own environment is the one channel both sides read (design §15.2).
const exported = (env: Readonly<Record<string, string>>): Effect.Effect<void> =>
  Effect.sync(() => {
    Object.assign(process.env, env)
  })

const watcherOf = (refused: Refusal) =>
  exitCodeReporter((_code, refusal) => {
    Effect.runSync(Ref.set(refused, Option.some(refusal)))
  })

const optionsOf = (root: string, channels: RunChannels, refused: Refusal): CliOptions => ({
  ...channels.vitest,
  root,
  run: true,
  watch: false,
  reporters: [watcherOf(refused)],
})

const created = (root: string, channels: RunChannels, refused: Refusal): Effect.Effect<Vitest, RunFailed> =>
  Effect.tryPromise({
    try: () => createVitest(optionsOf(root, channels, refused)),
    catch: (cause) =>
      new RunFailed({
        message: Predicate.isError(cause) ? cause.message : `Vitest could not load the suite at ${root}`,
      }),
  })

const outputOf = (vitest: Vitest): string =>
  Option.getOrElse(Option.fromNullishOr(vitest.config.env[RUN_OVERRIDE_ENV.output]), () => DEFAULT_OUTPUT)

const reportPathOf = (root: string, output: string): Effect.Effect<string, never, Path.Path> =>
  Effect.map(Path.Path, (path) => path.resolve(root, output, REPORT))

const reportAt = (file: string): Effect.Effect<Report1, RunFailed, FileSystem.FileSystem> =>
  Effect.flatMap(FileSystem.FileSystem, (fs) => fs.readFileString(file)).pipe(
    Effect.flatMap(decodeReport),
    Effect.mapError((error) => new RunFailed({ message: `${file} holds no readable report: ${error.message}` })),
  )

const existingReportAt = (file: string): Effect.Effect<Option.Option<Report1>, RunFailed, FileSystem.FileSystem> =>
  Effect.flatMap(FileSystem.FileSystem, (fs) => Effect.orElseSucceed(fs.exists(file), () => false)).pipe(
    Effect.flatMap((exists) => (exists ? Effect.asSome(reportAt(file)) : Effect.succeedNone)),
  )

const selectedFailures = (
  vitest: Vitest,
  file: string,
): Effect.Effect<Option.Option<ReadonlyArray<string>>, RunFailed, FileSystem.FileSystem> =>
  Effect.map(existingReportAt(file), (previous) =>
    Option.map(Option.flatMap(previous, lastFailedOf), (selected) => {
      vitest.setGlobalTestNamePattern(selected.testNamePattern)
      return selected.files
    }))

const filtersOf = (
  vitest: Vitest,
  root: string,
  channels: RunChannels,
): Effect.Effect<Option.Option<ReadonlyArray<string>>, RunFailed, Services> =>
  channels.lastFailed
    ? Effect.flatMap(reportPathOf(root, outputOf(vitest)), (file) => selectedFailures(vitest, file))
    : Effect.succeedSome(channels.files)

const started = (vitest: Vitest, filters: ReadonlyArray<string>): Effect.Effect<string, RunFailed> =>
  Effect.as(
    Effect.tryPromise({
      try: () => vitest.start([...filters]),
      catch: (cause) => new RunFailed({ message: Predicate.isError(cause) ? cause.message : 'Vitest could not start' }),
    }),
    outputOf(vitest),
  )

/** Runs the selection and answers the output directory the run wrote to, or none when nothing ran. */
const ranIn = (root: string, channels: RunChannels) =>
(
  vitest: Vitest,
): Effect.Effect<Option.Option<string>, RunFailed, Services> =>
  Effect.flatMap(filtersOf(vitest, root, channels), (filters) =>
    Option.match(filters, {
      onNone: () => Effect.as(Console.error(NOTHING_TO_RERUN), Option.none()),
      onSome: (files) => Effect.asSome(started(vitest, files)),
    }))

// Vitest runs the global setup's teardown, and so the report merge, while it closes.
const closed = (vitest: Vitest): Effect.Effect<void> =>
  Effect.tryPromise(() => vitest.close()).pipe(
    Effect.catch((error) => Console.error(`Vitest did not close cleanly: ${error.message}`)),
  )

const verdictOf = (report: Report1): Effect.Effect<void, RunEnded> =>
  report.run.exitCode === 0
    ? Effect.void
    : Effect.fail(new RunEnded({ status: report.run.status, exitCode: report.run.exitCode }))

const reported = (
  root: string,
  output: string,
  reporter: Reporter,
): Effect.Effect<void, RunFailed | RunEnded, Services> =>
  Effect.gen(function*() {
    const report = yield* Effect.flatMap(reportPathOf(root, output), reportAt)
    const texts = yield* emitReports({ report, reporters: [reporter], root, output }).pipe(
      Effect.mapError((error) => new RunFailed({ message: error.message })),
    )
    yield* Effect.forEach(texts, (text) => Console.log(text), { discard: true })
    return yield* verdictOf(report)
  })

type Ended = Effect.Effect<void, RunConfigRefused | RunFailed | RunEnded, Services>

const endedIn = (root: string, reporter: Reporter, refused: Refusal) => (output: string): Ended =>
  Effect.flatMap(Ref.get(refused), (refusal) =>
    Option.match(refusal, {
      onNone: (): Ended => reported(root, output, reporter),
      onSome: (invalid): Ended => Effect.fail(new RunConfigRefused({ refusal: invalid })),
    }))

const runIn = (root: string, channels: RunChannels): Effect.Effect<void, RunError, Services> =>
  Effect.gen(function*() {
    const refused: Refusal = yield* Ref.make(Option.none<ConfigInvalid>())
    yield* exported(channels.env)
    const output = yield* Effect.acquireUseRelease(created(root, channels, refused), ranIn(root, channels), closed)
    return yield* Option.match(output, {
      onNone: () => Effect.void,
      onSome: endedIn(root, channels.reporter, refused),
    })
  })

const printed = (error: RunError): Effect.Effect<void> =>
  error instanceof RunEnded ? Effect.void : Console.error(error.message)

/**
 * `effect-e2e run` (design §15.2): resolves the suite root, maps the flags onto the suite environment and Vitest,
 * runs Vitest in this process with its own reporters replaced by one refusal watcher, then renders the merged
 * report with the selected reporter and exits with the report's code. Everything before a report exits 2.
 */
export const run = (request: RunRequest): Effect.Effect<void, RunError, Services> =>
  Effect.gen(function*() {
    const root = yield* runRootOf(request.dir)
    const channels = yield* Effect.fromResult(channelsOf(request.flags))
    return yield* runIn(root, channels)
  }).pipe(Effect.tapError(printed))
