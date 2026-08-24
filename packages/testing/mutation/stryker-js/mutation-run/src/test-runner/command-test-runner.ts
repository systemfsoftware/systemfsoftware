import { INSTRUMENTER_CONSTANTS, type StrykerOptions } from '@systemfsoftware/stryker-js-plugin-api/core'
import {
  type CompleteDryRunResult,
  type DryRunResult,
  DryRunStatus,
  type MutantRunOptions,
  type MutantRunResult,
  TestStatus,
  toMutantRunResult,
} from '@systemfsoftware/stryker-js-plugin-api/test-runner'
import { testFilesProvided } from '@systemfsoftware/stryker-js-plugin-api/test-runner'
import * as Clock from 'effect/Clock'
import * as Effect from 'effect/Effect'
import * as Stream from 'effect/Stream'
import * as ChildProcess from 'effect/unstable/process/ChildProcess'
import * as ChildProcessSpawner from 'effect/unstable/process/ChildProcessSpawner'

import { CommandRunnerUnsupportedOption } from './command-test-runner.schema.js'

/** "command" — the name this runner answers to in the options. */
export const commandRunnerName = 'command'

/** Whether a configured runner name selects this runner. */
export const isCommandRunner = (name: string): name is 'command' => name.toLowerCase() === commandRunnerName

/**
 * A test runner that shells out to one command — `npm test` by default — and
 * mimics a single test result from the exit code. It cannot know how many tests
 * ran or what they covered.
 *
 * Timeout is the caller's `Effect.timeout` and teardown is the scope's:
 * interrupting the run interrupts the spawn, whose finalizer kills the process
 * group. The result is the value of an `Effect`, so the work has not started
 * until something runs it, and a caller can time it out, retry it or
 * interrupt it.
 */
export interface CommandTestRunnerConfig {
  readonly workingDir: string
  readonly options: StrykerOptions
}
/**
 * Why this runner cannot honour a configuration, if it cannot.
 *
 * This is a configuration check, answered before any runner exists. The
 * options validator calls this; `init` has nothing to do and says so.
 * A contradictory configuration is a user error (exit 2), not a runtime
 * fault (exit 3).
 */
export const commandRunnerRejects = (
  options: StrykerOptions,
): CommandRunnerUnsupportedOption | undefined =>
  testFilesProvided(options)
    ? new CommandRunnerUnsupportedOption({ option: 'testFiles' })
    : undefined

/** Each call is a fresh process, so the environment is always reloadable. */
export const commandRunnerCapabilities = { reloadEnvironment: true } as const

/** One test result standing for the whole command, decided by its exit code. */
const resultFromExit = (
  exitCode: number,
  output: string,
  timeSpentMs: number,
): CompleteDryRunResult =>
  exitCode === 0
    ? {
      status: DryRunStatus.Complete,
      tests: [{ id: 'all', name: 'All tests', status: TestStatus.Success, timeSpentMs }],
    }
    : {
      status: DryRunStatus.Complete,
      tests: [{
        id: 'all',
        name: 'All tests',
        status: TestStatus.Failed,
        failureMessage: output,
        timeSpentMs,
      }],
    }

/**
 * Run the configured command once.
 *
 * `activeMutantId` is threaded through the environment rather than the command
 * line, which is how the instrumented code finds the mutant to activate.
 */
const runCommand = (
  config: CommandTestRunnerConfig,
  activeMutantId: string | undefined,
): Effect.Effect<DryRunResult, never, ChildProcessSpawner.ChildProcessSpawner> =>
  Effect.gen(function*() {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
    const startedAt = yield* Clock.currentTimeMillis

    const command = ChildProcess.make(config.options.commandRunner.command).pipe(
      ChildProcess.setCwd(config.workingDir),
      activeMutantId === undefined
        ? (self) => self
        : ChildProcess.setEnv({
          [INSTRUMENTER_CONSTANTS.ACTIVE_MUTANT_ENV_VARIABLE]: activeMutantId,
        }),
    )

    // `all` interleaves stdout and stderr the way the old listener pair did by
    // pushing both into one buffer, but ordered by the platform rather than by
    // listener registration.
    const outcome = yield* Effect.scoped(
      Effect.gen(function*() {
        const handle = yield* spawner.spawn(command)
        const output = yield* Stream.mkString(Stream.decodeText(handle.all))
        const exitCode = yield* handle.exitCode
        return { output, exitCode }
      }),
    ).pipe(
      // A command that cannot be spawned at all is a failed run, not a crashed
      // engine: the user's `commandRunner.command` is what is wrong.
      Effect.catchCause((cause) => Effect.succeed({ failure: cause })),
    )

    const elapsed = (yield* Clock.currentTimeMillis) - startedAt

    return 'failure' in outcome
      ? { status: DryRunStatus.Error, errorMessage: String(outcome.failure) }
      : resultFromExit(outcome.exitCode, outcome.output, elapsed)
  })

/** Run the tests with no mutant active, to establish the baseline. */
export const commandRunnerDryRun = (
  config: CommandTestRunnerConfig,
): Effect.Effect<DryRunResult, never, ChildProcessSpawner.ChildProcessSpawner> => runCommand(config, undefined)

/** Run the tests with one mutant active. */
export const commandRunnerMutantRun = (
  config: CommandTestRunnerConfig,
  { activeMutant }: Pick<MutantRunOptions, 'activeMutant'>,
): Effect.Effect<MutantRunResult, never, ChildProcessSpawner.ChildProcessSpawner> =>
  runCommand(config, activeMutant.id).pipe(Effect.map((result) => toMutantRunResult(result, true)))
