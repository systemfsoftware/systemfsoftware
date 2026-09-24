/**
 * Runs nested Vitest over the probe fixtures and hands back the JSON report it produced (KTD14).
 *
 * The fork's runner behaviour is only observable from the outside: a probe file written the lazy way
 * either passes, fails with a named refusal, or fails as leaked state. Each feature starts one nested run
 * and asserts on the report, so every claim here is about what the runner did with a suite, not about how
 * the runner is built.
 *
 * The run is in-process through `vitest/node` on the worker-threads pool: no child process, no browser.
 * Fixtures resolve `@effect/vitest` to this worktree's fork source directly, so a report always describes
 * the code under conformance rather than an installed copy.
 *
 * Fixtures live in `tests/__fixtures__/probes/**`. A glob handed to {@link runFixtures} is matched relative
 * to that directory; a glob that already starts with `tests/` or `/` is matched relative to the package root.
 * Every fixture suite carries the `*.test.ts` suffix: it is a Vitest suite, and that suffix is what the repo's
 * lint reads as a place where the fork's `it.effect` bodies may hold `expect` calls.
 */
import { Effect, Function, Schema } from 'effect'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { startVitest } from 'vitest/node'

const packageRoot = fileURLToPath(new URL('../..', import.meta.url))
// The fork is a sibling package; resolving by path keeps the conformance run independent of install state.
const forkEntry = fileURLToPath(new URL('../../../vitest/src/mod.ts', import.meta.url))
const forkTestClock = fileURLToPath(new URL('../../../vitest/src/TestClock.ts', import.meta.url))

const AssertionSchema = Schema.Struct({
  title: Schema.String,
  fullName: Schema.String,
  ancestorTitles: Schema.Array(Schema.String),
  status: Schema.Literals(['passed', 'failed', 'skipped', 'pending', 'todo', 'disabled']),
  failureMessages: Schema.Array(Schema.String),
  meta: Schema.Record(Schema.String, Schema.Unknown),
})

/** One assertion of the nested report, as the JSON reporter writes it. */
export interface JsonAssertionResult extends Schema.Schema.Type<typeof AssertionSchema> {}

const TestFileSchema = Schema.Struct({
  name: Schema.String,
  status: Schema.Literals(['passed', 'failed']),
  message: Schema.String,
  assertionResults: Schema.Array(AssertionSchema),
})

export interface JsonTestFile extends Schema.Schema.Type<typeof TestFileSchema> {}

const ReportShape = Schema.Struct({
  success: Schema.Boolean,
  numTotalTests: Schema.Finite,
  numPassedTests: Schema.Finite,
  numFailedTests: Schema.Finite,
  testResults: Schema.Array(TestFileSchema),
})

/** The nested Vitest report, narrowed to the fields the features assert on. */
export interface JsonReport extends Schema.Schema.Type<typeof ReportShape> {}

/** A nested run plus what it exposed beyond the report: the seed it shuffled with, if it shuffled. */
export interface ProbeRun {
  readonly report: JsonReport
  /** The shuffle seed the run used, or null when the run did not shuffle. */
  readonly seed: number | null
}

export interface ProbeRunOptions {
  readonly globs: ReadonlyArray<string>
  /** Replays a specific shuffle order; omit to let the runner draw one. */
  readonly seed?: number | undefined
  /** Shuffles within suites; the fork's `describe` defaults this on, so tests opt out explicitly. */
  readonly shuffle?: boolean | undefined
  readonly env?: Readonly<Record<string, string>> | undefined
}

/** Every nested-run failure carries this: what failed, and why. */
export class ProbeFailure extends Schema.TaggedError<ProbeFailure>()('ProbeFailure', {
  stage: Schema.String,
  detail: Schema.String,
  cause: Schema.optional(Schema.Unknown),
}) {}

const claimFileName = (file: JsonTestFile): string => file.name

/** Every test file of the nested run, by the path Vitest recorded for it. */
export const fileNamesOf = (report: JsonReport): ReadonlyArray<string> => report.testResults.map(claimFileName)

/** Every assertion of the nested run, flattened across files. */
export const namesOf = (report: JsonReport): ReadonlyArray<string> =>
  report.testResults.flatMap((file) => file.assertionResults.map((assertion) => assertion.fullName))

export const fileOf: {
  (suffix: string): (report: JsonReport) => JsonTestFile
  (report: JsonReport, suffix: string): JsonTestFile
} = Function.dual(2, (report: JsonReport, suffix: string): JsonTestFile => {
  const found = report.testResults.find((file) => file.name.endsWith(suffix))
  if (found !== undefined) return found
  throw new ProbeFailure({
    stage: 'locate file',
    detail: `the nested run reported no file ending in ${JSON.stringify(suffix)}; it reported ${
      fileNamesOf(report).length
    } file(s)`,
  })
})

export const assertionOf: {
  (fullName: string): (report: JsonReport) => JsonAssertionResult
  (report: JsonReport, fullName: string): JsonAssertionResult
} = Function.dual(2, (report: JsonReport, fullName: string): JsonAssertionResult => {
  const found = report
    .testResults.flatMap((file) => file.assertionResults)
    .find((assertion) => assertion.fullName === fullName)
  if (found !== undefined) return found
  throw new ProbeFailure({
    stage: 'locate assertion',
    detail: `the nested run reported no test named ${JSON.stringify(fullName)}; it reported ${
      namesOf(report).length
    } assertion(s)`,
  })
})

/** Every failure message the named assertion collected, joined for a `toContain` check. */
export const messagesOf: {
  (fullName: string): (report: JsonReport) => string
  (report: JsonReport, fullName: string): string
} = Function.dual(2, (report: JsonReport, fullName: string): string =>
  report
    .testResults.flatMap((file) => file.assertionResults)
    .filter((assertion) => assertion.fullName === fullName)
    .flatMap((assertion) => assertion.failureMessages)
    .join('\n'))

const asInclude = (glob: string): string => {
  if (glob.startsWith('/') || glob.startsWith('tests/')) return glob
  return `tests/__fixtures__/probes/${glob}`
}

/** Runs the named probe fixtures in one nested Vitest run and returns everything it exposed. */
export const runProbes = (options: ProbeRunOptions): Effect.Effect<ProbeRun, ProbeFailure> =>
  Effect.gen(function*() {
    if (options.globs.length === 0) {
      return yield* new ProbeFailure({ stage: 'prepare', detail: 'probes: name at least one fixture glob' })
    }
    const report = yield* Effect.acquireUseRelease(
      Effect.gen(function*() {
        const workdir = yield* Effect.tryPromise({
          try: () => mkdtemp(join(tmpdir(), 'vitest-conformance-')),
          catch: (cause) => new ProbeFailure({ stage: 'prepare', detail: 'probes: no report directory', cause }),
        })
        const outputFile = join(workdir, 'report.json')
        const vitest = yield* Effect.tryPromise({
          try: () =>
            startVitest(
              'test',
              [],
              {
                root: packageRoot,
                config: false,
                include: options.globs.map(asInclude),
                run: true,
                watch: false,
                pool: 'threads',
                passWithNoTests: false,
                bail: 0,
                silent: true,
                reporters: [['json', { outputFile }]],
                testTimeout: 60_000,
                hookTimeout: 60_000,
                sequence: {
                  shuffle: options.shuffle ?? false,
                  ...(options.seed === undefined ? {} : { seed: options.seed }),
                },
                ...(options.env === undefined ? {} : { env: options.env }),
              },
              {
                resolve: {
                  alias: { '@effect/vitest': forkEntry, 'effect/TestClock': forkTestClock },
                },
              },
            ),
          catch: (cause) => new ProbeFailure({ stage: 'start', detail: 'nested run failed to start', cause }),
        })
        const seed = vitest.getSeed()
        yield* Effect.tryPromise({
          try: () => vitest.close(),
          catch: (cause) => new ProbeFailure({ stage: 'close', detail: 'nested run failed to close', cause }),
        })
        return { cleanup: Effect.promise(() => rm(workdir, { recursive: true, force: true })), outputFile, seed }
      }),
      (run) =>
        Effect.gen(function*() {
          const json = yield* Effect.tryPromise({
            try: () => readFile(run.outputFile, 'utf8'),
            catch: (cause) => new ProbeFailure({ stage: 'report', detail: 'nested run wrote no JSON report', cause }),
          })
          const decoded = yield* Schema.decodeEffect(Schema.fromJsonString(ReportShape))(json).pipe(
            Effect.mapError(() =>
              new ProbeFailure({ stage: 'report', detail: 'nested report has an unexpected shape' })
            ),
          )
          return { report: decoded, seed: run.seed }
        }),
      (run, exit) => run.cleanup.pipe(Effect.andThen(exit)),
    )
    return report
  })

/** Runs the named probe fixtures in one nested Vitest run and returns its JSON report. */
export const runFixtures = (globs: ReadonlyArray<string>): Effect.Effect<JsonReport, ProbeFailure> =>
  runProbes({ globs }).pipe(Effect.map((run) => run.report))
