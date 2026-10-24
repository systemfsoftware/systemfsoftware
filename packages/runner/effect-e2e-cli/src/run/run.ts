import * as Console from 'effect/Console'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Option from 'effect/Option'
import * as Path from 'effect/Path'
import * as Predicate from 'effect/Predicate'
import * as Schema from 'effect/Schema'
import type { ProvidedContext } from 'vitest'
import { type CliOptions, createVitest, type Vitest } from 'vitest/node'

import { type E2EConfigInput, RUN_OVERRIDE_ENV } from '@systemfsoftware/effect-e2e'
import { emitReports, Report1 } from '@systemfsoftware/effect-e2e/report'
import { RUN_OUTPUT_KEY, RUN_REFUSAL_KEY } from '@systemfsoftware/effect-e2e/runner'

import { channelsOf, type Reporter, type RunChannels, type RunFlagValues } from './flags.js'
import { lastFailedOf } from './last-failed.js'
import { RunConfigRefused, RunEnded, RunFailed, type RunRefused } from './run-failure.schema.js'
import { Selection } from './selection.schema.js'
import { runRootOf, SUITE_CONFIG } from './suite-root.js'

export interface RunRequest {
  readonly dir: Option.Option<string>
  readonly flags: RunFlagValues
}

type RunError = RunRefused | RunConfigRefused | RunFailed | RunEnded

type Services = FileSystem.FileSystem | Path.Path

type Provided = Partial<ProvidedContext>

interface SuiteConfigModule {
  readonly default: E2EConfigInput
}

const DEFAULT_OUTPUT = '.e2e'
const REPORT = 'report.json'
const NO_GLOBAL_SETUP = "the suite's vitest.config.ts registers no effect-e2e global setup, so the run left no report"

const decodeReport = Schema.decodeEffect(Schema.fromJsonString(Report1))

// The suite's e2e.config.ts reads the overrides in this process (global setup) and Vitest copies this process's
// environment into every worker, so the CLI's own environment is the one channel both sides read (design §15.2).
const exported = (env: Readonly<Record<string, string>>): Effect.Effect<void> =>
  Effect.sync(() => {
    Object.assign(process.env, env)
  })

const optionsOf = (root: string, channels: RunChannels): CliOptions => ({
  ...channels.vitest,
  root,
  run: true,
  watch: false,
  reporters: [{}],
})

const failedWith = (fallback: string) => <Cause>(cause: Cause): RunFailed =>
  new RunFailed({ message: Predicate.isError(cause) ? cause.message : fallback })

const created = (root: string, channels: RunChannels): Effect.Effect<Vitest, RunFailed> =>
  Effect.tryPromise({
    try: () => createVitest(optionsOf(root, channels)),
    catch: failedWith(`Vitest could not load the suite at ${root}`),
  })

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

const configuredOutputOf = (config: E2EConfigInput): string => config.output ?? DEFAULT_OUTPUT

const previousOutputOf = (
  vitest: Vitest,
  root: string,
  env: Readonly<Record<string, string>>,
): Effect.Effect<string, RunFailed, Path.Path> =>
  Effect.flatMap(Path.Path, (path) =>
    Effect.tryPromise({
      try: () => vitest.import<SuiteConfigModule>(path.join(root, SUITE_CONFIG)),
      catch: failedWith(`Vitest could not load ${SUITE_CONFIG} at ${root}`),
    })).pipe(
      Effect.map((module) => env[RUN_OVERRIDE_ENV.output] ?? configuredOutputOf(module.default)),
    )

const selectedFailures = (
  vitest: Vitest,
  file: string,
): Effect.Effect<Option.Option<ReadonlyArray<string>>, RunFailed, FileSystem.FileSystem> =>
  Effect.flatMap(existingReportAt(file), (previous) =>
    Option.match(Option.flatMap(previous, lastFailedOf), {
      onNone: () =>
        Effect.as(
          Console.error(
            Option.isSome(previous)
              ? `${file} holds no failed test to rerun`
              : `no previous report at ${file}, so there is no failed test to rerun`,
          ),
          Option.none(),
        ),
      onSome: (selected) =>
        Effect.sync(() => {
          vitest.setGlobalTestNamePattern(selected.testNamePattern)
          return Option.some(selected.files)
        }),
    }))

const filtersOf = (
  vitest: Vitest,
  root: string,
  channels: RunChannels,
): Effect.Effect<Option.Option<ReadonlyArray<string>>, RunFailed, Services> =>
  Selection.match(channels.selection, {
    Files: ({ filters }) => Effect.succeedSome(filters),
    LastFailed: () =>
      previousOutputOf(vitest, root, channels.env).pipe(
        Effect.flatMap((output) => reportPathOf(root, output)),
        Effect.flatMap((file) => selectedFailures(vitest, file)),
      ),
  })

// What the run's global setup provided: its refusal, or the output its report merges into. Vitest clears a
// project's provided context while it closes, so this is read after the run and before the close.
const providedBy = (vitest: Vitest): Provided =>
  [vitest.getRootProject(), ...vitest.projects].reduce<Provided>(
    (provided, project) => ({ ...provided, ...project.getProvidedContext() }),
    {},
  )

const started = (vitest: Vitest, filters: ReadonlyArray<string>): Effect.Effect<Provided, RunFailed> =>
  Effect.tryPromise({ try: () => vitest.start([...filters]), catch: failedWith('Vitest could not start') }).pipe(
    Effect.andThen(Effect.sync(() => providedBy(vitest))),
  )

const ranIn = (root: string, channels: RunChannels) =>
(
  vitest: Vitest,
): Effect.Effect<Option.Option<Provided>, RunFailed, Services> =>
  Effect.flatMap(filtersOf(vitest, root, channels), (filters) =>
    Option.match(filters, {
      onNone: () => Effect.succeedNone,
      onSome: (files) => Effect.asSome(started(vitest, files)),
    }))

// Vitest runs the global setup's teardown, and so the report merge, while it closes.
const closed = (vitest: Vitest): Effect.Effect<void> =>
  Effect.tryPromise(() => vitest.close()).pipe(
    Effect.catch((error) => Console.error(`Vitest did not close cleanly: ${error.message}`)),
  )

// The global setup clears the previous report before the run, so the report under the provided output is this
// run's; a refused config clears nothing, and its older report is never read (requirements AC-12.4).
const outputOf = (provided: Provided): Effect.Effect<string, RunConfigRefused | RunFailed> =>
  Option.match(Option.fromNullishOr(provided[RUN_REFUSAL_KEY]), {
    onSome: (message) => Effect.fail(new RunConfigRefused({ message })),
    onNone: () =>
      Effect.fromOption(Option.fromNullishOr(provided[RUN_OUTPUT_KEY])).pipe(
        Effect.mapError(() => new RunFailed({ message: NO_GLOBAL_SETUP })),
      ),
  })

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

const runIn = (root: string, channels: RunChannels): Effect.Effect<void, RunError, Services> =>
  Effect.gen(function*() {
    yield* exported(channels.env)
    const provided = yield* Effect.acquireUseRelease(created(root, channels), ranIn(root, channels), closed)
    return yield* Option.match(provided, {
      onNone: () => Effect.void,
      onSome: (context) => Effect.flatMap(outputOf(context), (output) => reported(root, output, channels.reporter)),
    })
  })

const printed = (error: RunError): Effect.Effect<void> =>
  error instanceof RunEnded ? Effect.void : Console.error(error.message)

/**
 * `effect-e2e run` (design §15.2): resolves the suite root, maps the flags onto the suite environment and Vitest,
 * runs Vitest in this process with its own reporters silenced, then renders the merged report with the selected
 * reporter and exits with the report's code. Everything before a report exits 2.
 */
export const run = (request: RunRequest): Effect.Effect<void, RunError, Services> =>
  Effect.gen(function*() {
    const root = yield* runRootOf(request.dir)
    const channels = yield* Effect.fromResult(channelsOf(request.flags))
    return yield* runIn(root, channels)
  }).pipe(Effect.tapError(printed))
