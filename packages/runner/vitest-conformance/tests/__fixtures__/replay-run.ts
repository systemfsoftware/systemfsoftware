import { Effect } from 'effect'
import { execFile } from 'node:child_process'
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
}

const vitestBin = fileURLToPath(new URL('../../node_modules/.bin/vitest', import.meta.url))

const execFileAsync = promisify(execFile)

// A refuted run exits non-zero, which is the run being observed, not a failure to observe it.
const outputOfExit = ({ stdout = '', stderr = '' }: { readonly stdout?: string; readonly stderr?: string }): string =>
  `${stdout}${stderr}`

const runOutputOf = (run: ReplayRun): Promise<string> =>
  execFileAsync(
    vitestBin,
    ['run', ...(run.config === undefined ? [] : ['--config', run.config]), run.file],
    { cwd: fileURLToPath(new URL(`./${run.fixture}/`, import.meta.url)), env: { ...process.env, CI: '' } },
  ).then(({ stdout, stderr }) => `${stdout}${stderr}`, outputOfExit)

/** Everything a Vitest CLI run printed, started in a replay fixture so its config file is loaded. */
export const replayRunOutput = (run: ReplayRun): Effect.Effect<string, ProbeFailure> =>
  Effect.tryPromise({
    try: () => runOutputOf(run),
    catch: (cause) => new ProbeFailure({ stage: 'run', detail: `${run.fixture}: ${run.file} did not run`, cause }),
  })
