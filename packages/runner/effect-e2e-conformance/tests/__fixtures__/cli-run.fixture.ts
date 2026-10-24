import { Report1 } from '@systemfsoftware/effect-e2e/report'
import * as Config from 'effect/Config'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Option from 'effect/Option'
import type { PlatformError } from 'effect/PlatformError'
import { ChildProcess, ChildProcessSpawner } from 'effect/process'
import * as Schema from 'effect/Schema'
import * as Stream from 'effect/Stream'

const PACKAGE_ROOT = decodeURIComponent(new URL('../..', import.meta.url).pathname).replace(/\/$/u, '')

const SCRATCH = `${PACKAGE_ROOT}/.scratch`

const RUNNER_SUITE = `${import.meta.dirname}/runner-suite`

const BIN = `${PACKAGE_ROOT}/node_modules/.bin/effect-e2e`

const VITEST_BIN = `${PACKAGE_ROOT}/node_modules/.bin/vitest`

const AssertionResult = Schema.Struct({ title: Schema.String, status: Schema.String })

const VitestReport = Schema.fromJsonString(
  Schema.Struct({ testResults: Schema.Array(Schema.Struct({ assertionResults: Schema.Array(AssertionResult) })) }),
)

const decodeReport = Schema.decodeEffect(Schema.fromJsonString(Report1))

export const STALE_REPORT = '{"stale":"a previous run left this report"}\n'

export type SuiteConfig = 'valid' | 'refused'

export const copiedRunnerSuite = (config: SuiteConfig) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    yield* fs.makeDirectory(SCRATCH, { recursive: true })
    const root = yield* fs.makeTempDirectoryScoped({ directory: SCRATCH, prefix: 'cli-run-' })
    const suite = `${root}/suite`
    yield* fs.copy(RUNNER_SUITE, suite)
    yield* fs.remove(`${suite}/.e2e`, { recursive: true, force: true })
    if (config === 'refused') {
      yield* fs.copyFile(`${suite}/vitest.refused.config.ts`, `${suite}/vitest.config.ts`)
    }
    return suite
  })

export interface CliRun {
  readonly exitCode: number
  readonly stdout: string
  readonly stderr: string
  readonly printed: Option.Option<Report1>
  readonly report: Option.Option<Report1>
  readonly reportText: Option.Option<string>
  readonly partials: number
}

export interface CliRequest {
  readonly suite: string
  readonly args: ReadonlyArray<string>
  readonly env?: Readonly<Record<string, string>>
  readonly output?: string
  readonly withoutDirFrom?: string
}

const textOf = (stream: Stream.Stream<Uint8Array, PlatformError>) => stream.pipe(Stream.decodeText, Stream.mkString)

const textIn = (fs: FileSystem.FileSystem, file: string) => Effect.option(fs.readFileString(file))

const decodedIn = (text: Option.Option<string>): Effect.Effect<Option.Option<Report1>> =>
  Option.match(text, {
    onNone: () => Effect.succeedNone,
    onSome: (held) => Effect.option(decodeReport(held)),
  })

const partialCountIn = (fs: FileSystem.FileSystem, directory: string) =>
  Effect.option(fs.readDirectory(`${directory}/partials`)).pipe(
    Effect.map(Option.getOrElse((): ReadonlyArray<string> => [])),
    Effect.map((names) => names.filter((name) => name.endsWith('.json') && !name.startsWith('.')).length),
  )

const locatedArgs = ({ suite, args, withoutDirFrom }: CliRequest): ReadonlyArray<string> =>
  withoutDirFrom === undefined ? ['run', '--dir', suite, ...args] : ['run', ...args]

const spawnedBin = (request: CliRequest) =>
  Effect.scoped(
    Effect.gen(function*() {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
      const inherited = { PATH: yield* Config.String('PATH'), HOME: yield* Config.String('HOME') }
      const handle = yield* spawner.spawn(
        ChildProcess.make(BIN, locatedArgs(request), {
          cwd: request.withoutDirFrom === undefined ? PACKAGE_ROOT : `${request.suite}/${request.withoutDirFrom}`,
          env: { ...inherited, ...request.env },
          extendEnv: false,
        }),
      )
      return yield* Effect.all([textOf(handle.stdout), textOf(handle.stderr), handle.exitCode], { concurrency: 3 })
    }),
  )

export const runCli = (
  request: CliRequest,
): Effect.Effect<
  CliRun,
  PlatformError | Config.ConfigError,
  FileSystem.FileSystem | ChildProcessSpawner.ChildProcessSpawner
> =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const [stdout, stderr, exitCode] = yield* spawnedBin(request)
    const directory = `${request.suite}/${request.output ?? '.e2e'}`
    const reportText = yield* textIn(fs, `${directory}/report.json`)
    return {
      exitCode: Number(exitCode),
      stdout,
      stderr,
      printed: yield* Effect.option(decodeReport(stdout)),
      report: yield* decodedIn(reportText),
      reportText,
      partials: yield* partialCountIn(fs, directory),
    } satisfies CliRun
  })

export interface VitestJsonRequest {
  readonly suite: string
  readonly files: ReadonlyArray<string>
}

export const runVitestJson = ({ suite, files }: VitestJsonRequest) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
    const inherited = { PATH: yield* Config.String('PATH'), HOME: yield* Config.String('HOME') }
    const output = `${suite}/vitest-run.json`
    yield* spawner.exitCode(
      ChildProcess.make(
        VITEST_BIN,
        ['run', '--reporter=json', `--outputFile.json=${output}`, ...files],
        { cwd: suite, env: inherited, extendEnv: false, stdout: 'ignore', stderr: 'ignore' },
      ),
    )
    const report = yield* Effect.flatMap(fs.readFileString(output), Schema.decodeEffect(VitestReport))
    return Object.fromEntries(
      report.testResults.flatMap((file) => file.assertionResults.map((test) => [test.title, test.status])),
    )
  })

export const statusesOf = (report: Option.Option<Report1>): Readonly<Record<string, string>> =>
  Option.match(report, {
    onNone: () => ({}),
    onSome: ({ results }) => Object.fromEntries(results.map((result) => [result.title, result.status])),
  })

export const runIdOf = (report: Option.Option<Report1>): string | null =>
  Option.getOrNull(Option.map(report, ({ run }) => run.id))

export const staleReportIn = (suite: string) =>
  Effect.flatMap(FileSystem.FileSystem, (fs) =>
    Effect.andThen(
      fs.makeDirectory(`${suite}/.e2e`, { recursive: true }),
      fs.writeFileString(`${suite}/.e2e/report.json`, STALE_REPORT),
    ))

export const vitestConfigRemovedFrom = (suite: string) =>
  Effect.flatMap(FileSystem.FileSystem, (fs) => fs.remove(`${suite}/vitest.config.ts`))
