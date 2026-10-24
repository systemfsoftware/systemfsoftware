import { NodeServices } from '@effect/platform-node'
import { Report1 } from '@systemfsoftware/effect-e2e/report'
import * as Config from 'effect/Config'
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

/** One test as the e2e report partial the runner wrote records it. */
export interface E2ETest {
  readonly title: string
  readonly status: string
}

/** What one nested run of the fixture suite left behind, read from outside the runner. */
export interface SuiteRun {
  readonly exitCode: number
  readonly tests: ReadonlyArray<VitestTest>
  readonly engineOpens: number
  readonly partials: ReadonlyArray<E2ETest>
}

export interface SuiteRequest {
  /** The suite's Vitest config file; `vitest.config.ts` selects the runner over the valid suite config. */
  readonly config: 'vitest.config.ts' | 'vitest.refused.config.ts'
  readonly files: ReadonlyArray<string>
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
    Effect.flatMap(fs.readFileString(`${OUTPUT}/vitest.json`), Schema.decodeEffect(VitestReport)),
    (report) => report.testResults.flatMap((file) => file.assertionResults.map(testOf)).toSorted(byTitle),
  )

const engineOpensOf = (fs: FileSystem.FileSystem) =>
  Effect.map(
    Effect.option(fs.readFileString(`${OUTPUT}/engine-opens`)),
    Option.match({ onNone: () => 0, onSome: (text) => text.trim().split('\n').length }),
  )

const partialOf = (fs: FileSystem.FileSystem) => (name: string) =>
  fs.readFileString(`${OUTPUT}/partials/${name}`).pipe(
    Effect.flatMap(Schema.decodeEffect(Schema.fromJsonString(Report1))),
    Effect.map((report) => report.results.map((result): E2ETest => ({ title: result.title, status: result.status }))),
  )

const partialsOf = (fs: FileSystem.FileSystem) =>
  Effect.option(fs.readDirectory(`${OUTPUT}/partials`)).pipe(
    Effect.map(Option.getOrElse((): ReadonlyArray<string> => [])),
    Effect.flatMap((names) => Effect.forEach(names, partialOf(fs))),
    Effect.map((reports) => reports.flat().toSorted(byTitle)),
  )

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
      const exitCode = yield* nestedRun(request)
      return {
        exitCode: Number(exitCode),
        tests: yield* vitestTestsOf(fs),
        engineOpens: yield* engineOpensOf(fs),
        partials: yield* partialsOf(fs),
      } satisfies SuiteRun
    }).pipe(Effect.ensuring(Effect.orDie(clearOutput(fs))))
  }).pipe(Effect.provide(NodeServices.layer), Effect.orDie)
