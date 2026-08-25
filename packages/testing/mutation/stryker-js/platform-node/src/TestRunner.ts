/**
 * The test runner capability — spawning, timeout, retry, reuse and environment
 * decisions for the engine's test execution.
 *
 * One module per capability: types, ports, combinators and the impure edge
 * live together, as `effect-torch`'s `Tensor.ts` or `Trainer.ts` do. The
 * schemas stay in `TestRunner.schema.ts`. The spawned worker entry point
 * stays separate at `child-process-test-runner-worker.ts` (emitted as its own
 * chunk).
 */

import { URL } from 'node:url'

import type { Policy } from '@systemfsoftware/effect-cell-types'
import { type FileDescriptions, INSTRUMENTER_CONSTANTS } from '@systemfsoftware/stryker-js/Mutant'
import type { StrykerOptions } from '@systemfsoftware/stryker-js/Schema'
import {
  type CompleteDryRunResult,
  type DryRunOptions,
  type DryRunResult,
  type MutantRunOptions,
  type MutantRunResult,
  testFilesProvided,
  type TestRunnerCapabilities,
  TestRunnerFailed,
  toMutantRunResult,
} from '@systemfsoftware/stryker-js/TestRunner'
import * as Cause from 'effect/Cause'
import * as Clock from 'effect/Clock'
import * as Duration from 'effect/Duration'
import * as Effect from 'effect/Effect'
import * as Match from 'effect/Match'
import * as Ref from 'effect/Ref'
import type * as Scope from 'effect/Scope'
import * as Stream from 'effect/Stream'
import * as ChildProcess from 'effect/unstable/process/ChildProcess'
import * as ChildProcessSpawner from 'effect/unstable/process/ChildProcessSpawner'

import { type ChildProcessProxyError, makeChildProcessProxy } from './Worker.js'
import type { IdGeneratorShape } from './Worker.js'
import { ChildProcessCrashedError, OutOfMemoryError } from './Worker.schema.js'
import type { WorkerMethodError } from './Worker.schema.js'

import { CommandRunnerUnsupportedOption } from './TestRunner.schema.js'

// ---------------------------------------------------------------------------
// Pooled runner — the child-process port
// ---------------------------------------------------------------------------

type TestRunnerWorkerShape = {
  capabilities(): Promise<TestRunnerCapabilities>
  init(options: StrykerOptions): Promise<void>
  dispose(): Promise<void>
  dryRun(options: DryRunOptions): Promise<DryRunResult>
  mutantRun(options: MutantRunOptions): Promise<MutantRunResult>
}

type WorkerFailure = WorkerMethodError | ChildProcessCrashedError | OutOfMemoryError

/** What one worker needs to be spawned. */
export interface ChildProcessTestRunnerParams {
  readonly options: StrykerOptions
  readonly fileDescriptions: FileDescriptions
  readonly sandboxWorkingDirectory: string
  readonly pluginModulePaths: readonly string[]
  readonly idGenerator: IdGeneratorShape
}

/** How a call on a pooled worker can fail. */
export type PooledTestRunnerError = TestRunnerFailed | ChildProcessCrashedError | OutOfMemoryError

/**
 * A test runner in a child process, whose calls can fail the way a child process
 * fails.
 *
 * Wider than `TestRunnerService` on purpose. That port's error channel is
 * `TestRunnerFailed`, which is right for a runner living in this process — but
 * folding a crash into it erases the tag a pool retires a worker on, so
 * `Pool.invalidate` could never fire and a dead worker would be handed out again.
 * A `WorkerMethodError` is the runner genuinely failing and does become a
 * `TestRunnerFailed`; a crash or an OOM is the worker dying, and stays itself.
 */
export interface PooledTestRunner {
  readonly capabilities: Effect.Effect<TestRunnerCapabilities, PooledTestRunnerError>
  readonly init: Effect.Effect<void, PooledTestRunnerError>
  readonly dryRun: (options: DryRunOptions) => Effect.Effect<DryRunResult, PooledTestRunnerError>
  readonly mutantRun: (options: MutantRunOptions) => Effect.Effect<MutantRunResult, PooledTestRunnerError>
}

const toRunnerFailure =
  (runnerName: string, phase: 'capabilities' | 'init' | 'dryRun' | 'mutantRun' | 'dispose') =>
  (error: WorkerFailure): PooledTestRunnerError =>
    Match.value(error).pipe(
      Match.tag('WorkerMethodError', (e) => new TestRunnerFailed({ runnerName, phase, cause: e.message })),
      Match.tag('ChildProcessCrashedError', (e): PooledTestRunnerError => e),
      Match.tag('OutOfMemoryError', (e): PooledTestRunnerError => e),
      Match.exhaustive,
    )

/**
 * A test runner that runs in a child process.
 *
 * Spawning happens **once**, here, and the child's teardown is a finalizer on the
 * scope this Effect is acquired in — which is the scope `Pool.make` opens for one
 * worker. So a worker lives as long as its pool slot, and each `dryRun` or
 * `mutantRun` only sends a message to a process that is already up.
 *
 * The scope boundary is the whole correctness question. Putting it inside each
 * method type-checks identically and spawns a Node process per mutant, which
 * makes the pool hold nothing and pays worker startup thousands of times.
 *
 * A failed spawn stays a typed failure rather than a defect, because
 * `Pool.invalidate` and the crash-retry combinator can only act on a failure they
 * can see.
 */
export const makeChildProcessTestRunner = (
  params: ChildProcessTestRunnerParams,
): Effect.Effect<
  PooledTestRunner,
  ChildProcessProxyError | PooledTestRunnerError,
  Scope.Scope | ChildProcessSpawner.ChildProcessSpawner
> =>
  Effect.gen(function*() {
    const { proxy } = yield* makeChildProcessProxy<TestRunnerWorkerShape>({
      modulePath: new URL('./internal/child-process-test-runner-worker.mjs', import.meta.url).pathname,
      namedExport: 'ChildProcessTestRunnerWorker',
      options: params.options,
      fileDescriptions: params.fileDescriptions,
      pluginModulePaths: [...params.pluginModulePaths],
      workingDirectory: params.sandboxWorkingDirectory,
      execArgv: [...params.options.testRunnerNodeArgs],
      idGenerator: params.idGenerator,
    })
    const runnerName = params.options.testRunner
    yield* proxy.init(params.options).pipe(Effect.mapError(toRunnerFailure(runnerName, 'init')))

    return {
      capabilities: proxy.capabilities().pipe(Effect.mapError(toRunnerFailure(runnerName, 'capabilities'))),
      init: Effect.void,
      dryRun: (options) => proxy.dryRun(options).pipe(Effect.mapError(toRunnerFailure(runnerName, 'dryRun'))),
      mutantRun: (options) => proxy.mutantRun(options).pipe(Effect.mapError(toRunnerFailure(runnerName, 'mutantRun'))),
    }
  })

// ---------------------------------------------------------------------------
// Combinators — engine adjustments on the port
// ---------------------------------------------------------------------------

/**
 * The engine's adjustments to a test runner, as functions on the port.
 *
 * A combinator that holds state returns an `Effect`, because allocating that
 * state is an effect. The stateless ones are plain functions, and the
 * difference is visible in the type rather than hidden in a constructor.
 */
export type TestRunnerCombinator = (inner: PooledTestRunner) => PooledTestRunner

/**
 * Report a run that outlives its timeout as a timed-out result.
 *
 * `Effect.timeoutOrElse` is the race, and retiring the worker belongs to the
 * pool, which invalidates it. An interrupted `Effect` is cancelled, where a
 * losing `Promise` was not.
 */
export const withTimeout: TestRunnerCombinator = (inner) => ({
  ...inner,
  dryRun: (options) => {
    const policy: Policy.Policy<DryRunResult, PooledTestRunnerError, never> = Effect.timeoutOrElse({
      duration: Duration.millis(options.timeout),
      orElse: (): Effect.Effect<DryRunResult> => Effect.succeed({ status: 'timeout' }),
    })
    return inner.dryRun(options).pipe(policy)
  },
  mutantRun: (options) => {
    const policy: Policy.Policy<MutantRunResult, PooledTestRunnerError, never> = Effect.timeoutOrElse({
      duration: Duration.millis(options.timeout),
      orElse: (): Effect.Effect<MutantRunResult> => Effect.succeed({ status: 'timeout' }),
    })
    return inner.mutantRun(options).pipe(policy)
  },
})

/** How many times a crashed runner is restarted before the run gives up on it. */
export const maxRetries = 2

/**
 * Retry a run whose runner crashed, and report the crash as a result once the
 * attempts are spent.
 *
 * Every failure is retried, not only out-of-memory; the out-of-memory check
 * only changes the log message. On exhaustion the combinator produces a
 * `status: Error` result rather than failing, because one broken runner must
 * not end the whole run. The exhausted message renders the `Cause`, which
 * keeps the chain that led there.
 */
// NOT a Policy: changes E (PooledTestRunnerError -> never) by catching failure into success
export const withRetry: TestRunnerCombinator = (inner) => {
  const attempt = <A>(
    run: Effect.Effect<A, unknown>,
    onExhausted: (message: string) => A,
  ): Effect.Effect<A> =>
    run.pipe(
      Effect.tapError((error) => {
        if (error instanceof OutOfMemoryError) {
          return Effect.logInfo(
            `Test runner process [${error.pid}] ran out of memory. That usually means the tests leak memory. Stryker restarts the process and carries on, but the run is slower for it.`,
          )
        }
        return Effect.void
      }),
      Effect.retry({ times: maxRetries }),
      Effect.catchCause((cause) =>
        Effect.succeed(
          onExhausted(
            `Test runner crashed. Tried ${maxRetries} times to restart it without any luck. ${Cause.pretty(cause)}`,
          ),
        )
      ),
    )

  return {
    ...inner,
    dryRun: (options) =>
      attempt(inner.dryRun(options), (errorMessage) => ({
        status: 'error',
        errorMessage,
      })),
    mutantRun: (options) =>
      attempt(inner.mutantRun(options), (errorMessage) => ({
        status: 'error',
        errorMessage,
      })),
  }
}

/**
 * Retire a runner after a configured number of mutant runs.
 *
 * The count lives in a `Ref` the combinator closes over, so nothing outside can
 * read or reset it. `retire` is supplied rather than being a `recover()` the
 * runner performs on itself: the pool owns worker lifetime, so retiring one is
 * `Pool.invalidate`, and a runner that restarts itself behind the pool's back
 * would create two owners of one process.
 */
export const withMaxReuse = (
  options: Pick<StrykerOptions, 'maxTestRunnerReuse'>,
  retire: Effect.Effect<void>,
): (inner: PooledTestRunner) => Effect.Effect<PooledTestRunner> =>
(inner) =>
  Effect.gen(function*() {
    const restartAfter = options.maxTestRunnerReuse
    if (restartAfter <= 0) {
      return inner
    }

    const runs = yield* Ref.make(0)

    const wrapped: PooledTestRunner = {
      ...inner,
      mutantRun: (runOptions: MutantRunOptions): Effect.Effect<MutantRunResult, PooledTestRunnerError> => {
        const policy: Policy.Policy<MutantRunResult, PooledTestRunnerError, never> = (self) =>
          Effect.gen(function*() {
            const count = yield* Ref.updateAndGet(runs, (n) => n + 1)
            if (count > restartAfter) {
              yield* retire
              yield* Ref.set(runs, 1)
            }
            return yield* self
          })
        return policy(inner.mutantRun(runOptions))
      },
    }
    return wrapped
  })

/** What the test environment currently holds, which is what decides a reload. */
type EnvironmentState = 'pristine' | 'loaded' | 'loaded-static-mutant'

/**
 * Decide whether the test environment must be reloaded before a mutant runs.
 *
 * The decision produces a new options value; the caller's options are not
 * mutated, so a caller that reuses its own options does not read a value it
 * never wrote.
 */
export const withEnvironmentReload = (
  retire: Effect.Effect<void>,
): (inner: PooledTestRunner) => Effect.Effect<PooledTestRunner> =>
(inner) =>
  Effect.gen(function*() {
    const state = yield* Ref.make<EnvironmentState>('pristine')

    const wrapped: PooledTestRunner = {
      ...inner,

      dryRun: (options: DryRunOptions): Effect.Effect<DryRunResult, PooledTestRunnerError> => {
        const policy: Policy.Policy<DryRunResult, PooledTestRunnerError, never> = (self) =>
          Ref.set(state, 'loaded').pipe(Effect.andThen(self))
        return policy(inner.dryRun(options))
      },

      mutantRun: (options: MutantRunOptions): Effect.Effect<MutantRunResult, PooledTestRunnerError> =>
        Effect.gen(function*() {
          const current = yield* Ref.get(state)
          const canReload = (yield* inner.capabilities).reloadEnvironment

          let reloadEnvironment: boolean
          if (options.reloadEnvironment) {
            reloadEnvironment = current !== 'pristine' && canReload
          } else {
            reloadEnvironment = current === 'loaded-static-mutant' && canReload
          }
          const decided: MutantRunOptions = { ...options, reloadEnvironment }

          if (current === 'loaded-static-mutant' && !canReload) {
            yield* retire
          }

          const policy: Policy.Policy<MutantRunResult, PooledTestRunnerError, never> = (self) =>
            Effect.gen(function*() {
              const result = yield* self
              let nextState: EnvironmentState = 'loaded'
              if (options.reloadEnvironment) {
                nextState = 'loaded-static-mutant'
              }
              yield* Ref.set(state, nextState)
              return result
            })

          return yield* policy(inner.mutantRun(decided))
        }),
    }
    return wrapped
  })

// ---------------------------------------------------------------------------
// Command runner — shells out to one command
// ---------------------------------------------------------------------------

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
): CommandRunnerUnsupportedOption | undefined => {
  if (testFilesProvided(options)) {
    return new CommandRunnerUnsupportedOption({ option: 'testFiles' })
  }
  return undefined
}

/** Each call is a fresh process, so the environment is always reloadable. */
export const commandRunnerCapabilities = { reloadEnvironment: true } as const

/** One test result standing for the whole command, decided by its exit code. */
const resultFromExit = (
  exitCode: number,
  output: string,
  timeSpentMs: number,
): CompleteDryRunResult => {
  if (exitCode === 0) {
    return {
      status: 'complete',
      tests: [{ id: 'all', name: 'All tests', status: 'success', timeSpentMs }],
    }
  }
  return {
    status: 'complete',
    tests: [{
      id: 'all',
      name: 'All tests',
      status: 'failed',
      failureMessage: output,
      timeSpentMs,
    }],
  }
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

    let extra: { env: Record<string, string>; extendEnv: true } | undefined
    if (activeMutantId !== undefined) {
      extra = {
        env: { [INSTRUMENTER_CONSTANTS.ACTIVE_MUTANT_ENV_VARIABLE]: activeMutantId },
        extendEnv: true,
      }
    }
    const command = ChildProcess.make(config.options.commandRunner.command, {
      shell: true,
      cwd: config.workingDir,
      ...extra,
    })

    const outcome = yield* Effect.scoped(
      Effect.gen(function*() {
        const handle = yield* spawner.spawn(command)
        const output = yield* Stream.mkString(Stream.decodeText(handle.all))
        const exitCode = yield* handle.exitCode
        return { output, exitCode }
      }),
    ).pipe(
      Effect.catchCause((cause) => Effect.succeed({ failure: cause })),
    )

    const elapsed = (yield* Clock.currentTimeMillis) - startedAt

    if ('failure' in outcome) {
      return { status: 'error', errorMessage: String(outcome.failure) }
    }
    return resultFromExit(outcome.exitCode, outcome.output, elapsed)
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

// ---------------------------------------------------------------------------
// Building — what the engine selects
// ---------------------------------------------------------------------------

/** What building a runner for this run needs. */
export interface TestRunnerBuildContext {
  readonly options: StrykerOptions
  readonly fileDescriptions: FileDescriptions
  readonly sandboxWorkingDirectory: string
  readonly pluginModulePaths: readonly string[]
  readonly idGenerator: IdGeneratorShape
  /**
   * Retire this runner's worker. Supplied by whoever owns the worker's
   * lifetime — the pool — so a combinator never restarts a process the pool
   * still believes it owns.
   */
  readonly retire: Effect.Effect<void>
}

/**
 * The command runner, wrapped in the two adjustments that apply to it.
 *
 * No reuse limit and no environment reload, because every call is a new
 * process: there is nothing to reuse and nothing loaded to reload. The
 * combinators applied are the list that remains.
 *
 * The spawner is provided into each operation here rather than appearing in the
 * port's `R`. A port that named its own dependencies would make every consumer
 * discover and supply them (`REPO-A3`), and the service is built exactly where
 * the spawner is already in scope.
 */
const commandRunner = (
  context: TestRunnerBuildContext,
  spawner: ChildProcessSpawner.ChildProcessSpawner['Service'],
): PooledTestRunner => {
  const config = {
    workingDir: context.sandboxWorkingDirectory,
    options: context.options,
  }
  const provided = Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner)

  const base: PooledTestRunner = {
    capabilities: Effect.succeed(commandRunnerCapabilities),
    init: Effect.void,
    dryRun: () => commandRunnerDryRun(config).pipe(provided),
    mutantRun: (options: MutantRunOptions) => commandRunnerMutantRun(config, options).pipe(provided),
  }

  return withRetry(withTimeout(base))
}

/**
 * Build the test runner this run's options select.
 *
 * The order is: timeout is innermost so a retry re-runs the timeout, reuse
 * counting sits above the reload decision so a reload does not reset the
 * count, and retry is outermost so it can restart a runner any inner layer
 * gave up on. As a pipeline, that order is a list a reader can check against
 * this sentence.
 */
export const buildTestRunner = (
  context: TestRunnerBuildContext,
  childProcessRunner: Effect.Effect<PooledTestRunner, unknown, Scope.Scope | ChildProcessSpawner.ChildProcessSpawner>,
): Effect.Effect<PooledTestRunner, unknown, ChildProcessSpawner.ChildProcessSpawner | Scope.Scope> =>
  Effect.gen(function*() {
    if (isCommandRunner(context.options.testRunner)) {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
      return commandRunner(context, spawner)
    }

    const base = yield* childProcessRunner
    const timed = withTimeout(base)
    const limited = yield* withMaxReuse(context.options, context.retire)(timed)
    const reloading = yield* withEnvironmentReload(context.retire)(limited)
    return withRetry(reloading)
  })
