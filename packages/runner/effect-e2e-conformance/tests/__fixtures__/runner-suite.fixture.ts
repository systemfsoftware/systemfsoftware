import { NodeServices } from '@effect/platform-node'
import { buildReport, renderJson, Report1, RunId } from '@systemfsoftware/effect-e2e/report'
import * as Config from 'effect/Config'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Option from 'effect/Option'
import { ChildProcess, ChildProcessSpawner } from 'effect/process'
import * as Schema from 'effect/Schema'

const SUITE_ROOT = `${import.meta.dirname}/runner-suite`
const OUTPUT = `${SUITE_ROOT}/.e2e`

const AssertionResult = Schema.Struct({
  title: Schema.String,
  status: Schema.String,
  duration: Schema.optionalKey(Schema.Finite.pipe(Schema.NullOr)),
  failureMessages: Schema.Array(Schema.String),
})

const VitestReport = Schema.fromJsonString(
  Schema.Struct({ testResults: Schema.Array(Schema.Struct({ assertionResults: Schema.Array(AssertionResult) })) }),
)

/** One test as the nested `vitest run` reported it. */
export interface VitestTest {
  readonly title: string
  readonly status: string
  readonly durationMs: number
  /** The first line of the first failure message; empty when the test did not fail. */
  readonly failure: string
}

export interface E2ETest {
  readonly title: string
  readonly status: string
}

export interface MergedReport {
  readonly runId: string
  readonly status: string
  readonly exitCode: number
  readonly errors: ReadonlyArray<string>
  readonly tests: ReadonlyArray<E2ETest>
}

export interface PartialFile {
  readonly runId: string
  readonly titles: ReadonlyArray<string>
}

/** What one nested run of the fixture suite left behind, read from outside the runner. */
export interface SuiteRun {
  readonly exitCode: number
  readonly tests: ReadonlyArray<VitestTest>
  readonly engineOpens: number
  readonly report: Option.Option<MergedReport>
  readonly partials: ReadonlyArray<PartialFile>
}

export interface SuiteRequest {
  /** The suite's Vitest config file; `vitest.config.ts` selects the runner over the valid suite config. */
  readonly config: 'vitest.config.ts' | 'vitest.refused.config.ts'
  readonly files: ReadonlyArray<string>
  readonly stale?: boolean
}

const firstLineOf = (messages: ReadonlyArray<string>): string =>
  Option.getOrElse(Option.fromNullishOr(messages[0]?.split('\n')[0]), () => '')

const testOf = (result: typeof AssertionResult.Type): VitestTest => ({
  title: result.title,
  status: result.status,
  durationMs: Option.getOrElse(Option.fromNullishOr(result.duration), () => 0),
  failure: firstLineOf(result.failureMessages),
})

const byTitle = <A extends { readonly title: string }>(left: A, right: A): number =>
  left.title.localeCompare(right.title)

const vitestTestsOf = (fs: FileSystem.FileSystem) =>
  Effect.map(
    Effect.option(Effect.flatMap(fs.readFileString(`${OUTPUT}/vitest.json`), Schema.decodeEffect(VitestReport))),
    Option.match({
      onNone: (): ReadonlyArray<VitestTest> => [],
      onSome: (report) => report.testResults.flatMap((file) => file.assertionResults.map(testOf)).toSorted(byTitle),
    }),
  )

const engineOpensOf = (fs: FileSystem.FileSystem) =>
  Effect.map(
    Effect.option(fs.readFileString(`${OUTPUT}/engine-opens`)),
    Option.match({ onNone: () => 0, onSome: (text) => text.trim().split('\n').length }),
  )

const decodedReport = (text: string) => Schema.decodeEffect(Schema.fromJsonString(Report1))(text)

const mergedReportOf = (report: Report1): MergedReport => ({
  runId: report.run.id,
  status: report.run.status,
  exitCode: report.run.exitCode,
  errors: report.run.errors.map((error) => error.code),
  tests: report.results.map((result): E2ETest => ({ title: result.title, status: result.status })).toSorted(byTitle),
})

const reportOf = (fs: FileSystem.FileSystem) =>
  Effect.flatMap(
    Effect.option(fs.readFileString(`${OUTPUT}/report.json`)),
    Option.match({
      onNone: () => Effect.succeedNone,
      onSome: (text) => Effect.map(decodedReport(text), (report) => Option.some(mergedReportOf(report))),
    }),
  )

const partialOf = (fs: FileSystem.FileSystem) => (name: string) =>
  fs.readFileString(`${OUTPUT}/partials/${name}`).pipe(
    Effect.flatMap(decodedReport),
    Effect.map((report): PartialFile => ({
      runId: report.run.id,
      titles: report.results.map((result) => result.title).toSorted(),
    })),
  )

const byFirstTitle = (left: PartialFile, right: PartialFile): number =>
  (left.titles[0] ?? '').localeCompare(right.titles[0] ?? '')

const partialsOf = (fs: FileSystem.FileSystem) =>
  Effect.option(fs.readDirectory(`${OUTPUT}/partials`)).pipe(
    Effect.map(Option.getOrElse((): ReadonlyArray<string> => [])),
    Effect.map((names) => names.filter((name) => name.endsWith('.json') && !name.startsWith('.'))),
    Effect.flatMap((names) => Effect.forEach(names, partialOf(fs))),
    Effect.map((partials) => partials.toSorted(byFirstTitle)),
  )

const STALE_RUN = RunId.make('runner-suite-previous-run')

const staleOutputWritten = (fs: FileSystem.FileSystem) =>
  Effect.gen(function*() {
    const at = DateTime.makeUnsafe('2026-10-23T09:00:00.000Z')
    const previous = buildReport({
      run: {
        id: STALE_RUN,
        project: Report1.fields.run.fields.project.make('runner-suite'),
        startedAt: at,
        finishedAt: at,
        errors: [],
      },
      entries: [],
    })
    yield* fs.makeDirectory(`${OUTPUT}/partials`, { recursive: true })
    yield* fs.writeFileString(`${OUTPUT}/partials/previous-worker.json`, yield* renderJson(previous))
    yield* fs.writeFileString(`${OUTPUT}/report.json`, yield* renderJson(previous))
  })

const nestedRun = (request: SuiteRequest) =>
  Effect.gen(function*() {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
    const env = { PATH: yield* Config.String('PATH'), HOME: yield* Config.String('HOME') }
    return yield* spawner.exitCode(
      ChildProcess.make('pnpm', ['exec', 'vitest', 'run', '--config', request.config, ...request.files], {
        cwd: SUITE_ROOT,
        env,
        extendEnv: false,
        stdout: 'ignore',
        stderr: 'ignore',
      }),
    )
  })

const clearOutput = (fs: FileSystem.FileSystem) => fs.remove(OUTPUT, { recursive: true, force: true })

export const runSuite = (request: SuiteRequest) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    yield* clearOutput(fs)
    return yield* Effect.gen(function*() {
      if (request.stale === true) yield* staleOutputWritten(fs)
      const exitCode = yield* nestedRun(request)
      return {
        exitCode: Number(exitCode),
        tests: yield* vitestTestsOf(fs),
        engineOpens: yield* engineOpensOf(fs),
        report: yield* reportOf(fs),
        partials: yield* partialsOf(fs),
      } satisfies SuiteRun
    }).pipe(Effect.ensuring(Effect.orDie(clearOutput(fs))))
  }).pipe(Effect.provide(NodeServices.layer), Effect.orDie)
