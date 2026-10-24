import { type Attempt, Report1 } from '@systemfsoftware/effect-e2e/report'
import * as Config from 'effect/Config'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Match from 'effect/Match'
import { ChildProcess, ChildProcessSpawner } from 'effect/process'
import * as Schema from 'effect/Schema'

const PACKAGE_ROOT = decodeURIComponent(new URL('../..', import.meta.url).pathname).replace(/\/$/u, '')

/** Generated suites live under the package, so their imports resolve to its dependencies. */
const SCRATCH = `${PACKAGE_ROOT}/.scratch`

const AssertionResult = Schema.Struct({ title: Schema.String, status: Schema.String })

const VitestReport = Schema.fromJsonString(
  Schema.Struct({ testResults: Schema.Array(Schema.Struct({ assertionResults: Schema.Array(AssertionResult) })) }),
)

const ListedFile = Schema.Struct({ file: Schema.String })

const ListedFiles = ListedFile.pipe(Schema.Array, Schema.fromJsonString)

interface Spawn {
  readonly cwd: string
  readonly command: string
  readonly args: ReadonlyArray<string>
  readonly env?: Readonly<Record<string, string>>
}

const spawned = ({ cwd, command, args, env }: Spawn) =>
  Effect.gen(function*() {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
    const inherited = { PATH: yield* Config.String('PATH'), HOME: yield* Config.String('HOME') }
    return Number(
      yield* spawner.exitCode(
        ChildProcess.make(command, [...args], {
          cwd,
          env: { ...inherited, ...env },
          extendEnv: false,
          stdout: 'ignore',
          stderr: 'ignore',
        }),
      ),
    )
  })

/**
 * A suite `effect-e2e init` scaffolded with the web engine and the openrouter gateway, under a scratch directory the
 * scope removes. The bin is the one this workspace links from `@systemfsoftware/effect-e2e-cli`.
 */
export const generatedSuite = Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem
  yield* fs.makeDirectory(SCRATCH, { recursive: true })
  const root = yield* fs.makeTempDirectoryScoped({ directory: SCRATCH, prefix: 'cli-suite-' })
  const suite = `${root}/suite`
  const exitCode = yield* spawned({
    cwd: PACKAGE_ROOT,
    command: 'pnpm',
    args: ['exec', 'effect-e2e', 'init', '--dir', suite, '--engine', 'web', '--gateway', 'openrouter', '--no-install'],
  })
  return yield* exitCode === 0
    ? Effect.succeed(suite)
    : Effect.die(`effect-e2e init exited ${exitCode} scaffolding ${suite}`)
})

/** What one `test:e2e` run of a generated suite left behind, read from outside the run. */
export interface GeneratedRun {
  readonly exitCode: number
  /** Each test's status as Vitest reported it, by title. */
  readonly vitest: Readonly<Record<string, string>>
  /** Each test's status in the merged `.e2e/report.json`, by title. */
  readonly e2e: Readonly<Record<string, string>>
  /** The reason each skipped attempt in the merged report records. */
  readonly skipReasons: ReadonlyArray<string>
  /** Model calls summed over every step of every attempt in the merged report. */
  readonly modelCalls: number
  readonly attempts: Readonly<Record<string, number>>
}

const stepsOf = (attempt: Attempt) => Match.valueTags(attempt, { Ran: ({ steps }) => steps, Skipped: () => [] })

const skipReasonOf = (attempt: Attempt): ReadonlyArray<string> =>
  Match.valueTags(attempt, { Ran: () => [], Skipped: ({ reason }) => [reason] })

const summaryOf = (exitCode: number, vitest: typeof VitestReport.Type, report: Report1): GeneratedRun => {
  const attempts = report.results.flatMap((result) => result.attempts)
  return {
    exitCode,
    vitest: Object.fromEntries(
      vitest.testResults.flatMap((file) => file.assertionResults.map((test) => [test.title, test.status])),
    ),
    e2e: Object.fromEntries(report.results.map((result) => [result.title, result.status])),
    skipReasons: attempts.flatMap(skipReasonOf),
    modelCalls: attempts.flatMap(stepsOf).reduce((sum, step) => sum + ('modelCalls' in step ? step.modelCalls : 0), 0),
    attempts: Object.fromEntries(report.results.map((result) => [result.title, result.attempts.length])),
  }
}

export interface SuiteRunRequest {
  readonly suite: string
  readonly baseUrl: string
}

/**
 * Runs the suite's `test:e2e` command (`vitest run` under its own config) against `baseUrl`, with no model API key in
 * the environment, and reads the Vitest JSON report and the merged e2e report it left behind.
 */
export const runGeneratedSuite = ({ suite, baseUrl }: SuiteRunRequest) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const exitCode = yield* spawned({
      cwd: suite,
      command: 'pnpm',
      args: [
        'exec',
        'vitest',
        'run',
        '--root',
        suite,
        '--config',
        `${suite}/vitest.config.ts`,
        '--reporter=default',
        '--reporter=json',
        `--outputFile.json=${suite}/vitest.json`,
      ],
      env: { BASE_URL: baseUrl },
    })
    const vitest = yield* Effect.flatMap(fs.readFileString(`${suite}/vitest.json`), Schema.decodeEffect(VitestReport))
    const report = yield* Effect.flatMap(
      fs.readFileString(`${suite}/.e2e/report.json`),
      Schema.decodeEffect(Schema.fromJsonString(Report1)),
    )
    return summaryOf(exitCode, vitest, report)
  })

export interface CollectRequest {
  readonly suite: string
  /** The Vitest config file, relative to the suite root. */
  readonly config: string
}

/** The suite-relative test files Vitest collects under `config`, read with `vitest list --filesOnly`. */
export const collectedUnder = ({ suite, config }: CollectRequest) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const output = `${suite}/listed.json`
    yield* spawned({
      cwd: suite,
      command: 'pnpm',
      args: [
        'exec',
        'vitest',
        'list',
        '--filesOnly',
        '--root',
        suite,
        '--config',
        `${suite}/${config}`,
        `--json=${output}`,
      ],
    })
    const listed = yield* Effect.flatMap(fs.readFileString(output), Schema.decodeEffect(ListedFiles))
    return listed.map(({ file }) => file.slice(suite.length + 1)).toSorted()
  })

export interface PlantRequest {
  readonly suite: string
  readonly file: string
  readonly content: string
}

export const plantIn = ({ suite, file, content }: PlantRequest) =>
  Effect.flatMap(FileSystem.FileSystem, (fs) => fs.writeFileString(`${suite}/${file}`, content))

export interface RetriesRequest {
  readonly suite: string
  readonly retries: number
}

const CONFIG_OPENING = 'export default defineConfig({'

export const retriesWrittenIn = ({ suite, retries }: RetriesRequest) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const file = `${suite}/e2e.config.ts`
    const generated = yield* fs.readFileString(file)
    return yield* generated.includes(CONFIG_OPENING)
      ? fs.writeFileString(file, generated.replace(CONFIG_OPENING, `${CONFIG_OPENING}\n  retries: ${retries},`))
      : Effect.die(`${file} has no '${CONFIG_OPENING}' to write retries into`)
  })
