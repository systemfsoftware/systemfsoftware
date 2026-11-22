import { Effect } from 'effect'
import { execFile, execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { ProbeFailure } from './run-fixtures'

export interface ReplayRun {
  /** The fixture package directory the run starts in, under `__fixtures__`. */
  readonly fixture: string
  /** The test file filter. */
  readonly file: string
  /** The config file to load with `--config`, relative to the fixture; found from the directory when absent. */
  readonly config?: string
  /** Environment variables on top of one that decides no tier (no `CI`, `AGENT` or Stryker variable). */
  readonly env?: Readonly<Record<string, string>>
}

const vitestBin = fileURLToPath(new URL('../../node_modules/.bin/vitest', import.meta.url))

const { AGENT: _agent, STRYKER_MUTATOR_WORKER: _stryker, PATH: inheritedPath = '', ...inherited } = process.env
const baseEnvironment = { ...inherited, PATH: inheritedPath, CI: '' }

const execFileAsync = promisify(execFile)

// A refuted run exits non-zero, which is the run being observed, not a failure to observe it.
const outputOfExit = ({ stdout = '', stderr = '' }: { readonly stdout?: string; readonly stderr?: string }): string =>
  `${stdout}${stderr}`

const runOutputOf = (run: ReplayRun): Promise<string> =>
  execFileAsync(
    vitestBin,
    ['run', ...(run.config === undefined ? [] : ['--config', run.config]), run.file],
    { cwd: fileURLToPath(new URL(`./${run.fixture}/`, import.meta.url)), env: { ...baseEnvironment, ...run.env } },
  ).then(({ stdout, stderr }) => `${stdout}${stderr}`, outputOfExit)

/** Everything a Vitest CLI run printed, started in a replay fixture so its config file is loaded. */
export const replayRunOutput = (run: ReplayRun): Effect.Effect<string, ProbeFailure> =>
  Effect.tryPromise({
    try: () => runOutputOf(run),
    catch: (cause) => new ProbeFailure({ stage: 'run', detail: `${run.fixture}: ${run.file} did not run`, cause }),
  })

/** The seed the checked-out commit names: its first eight hex digits as a number, or 1 when that is 0. */
export const seedOfCheckedOutCommit = (): number =>
  Number.parseInt(execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).slice(0, 8), 16) || 1

/** CI, with a `git` first on `PATH` that reports a HEAD beginning with eight zeros. */
export const zeroCommitCiEnv: Readonly<Record<string, string>> = {
  CI: 'true',
  PATH: `${fileURLToPath(new URL('./git-zero-commit', import.meta.url))}:${inheritedPath}`,
}
