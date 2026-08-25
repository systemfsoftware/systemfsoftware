import type { StrykerOptions } from '@systemfsoftware/stryker-js-plugin-api/core'
import {
  type DryRunOptions,
  type DryRunResult,
  DryRunStatus,
  type MutantRunOptions,
  type MutantRunResult,
  MutantRunStatus,
} from '@systemfsoftware/stryker-js-plugin-api/test-runner'
import * as Cause from 'effect/Cause'
import * as Duration from 'effect/Duration'
import * as Effect from 'effect/Effect'
import * as Ref from 'effect/Ref'

import { OutOfMemoryError } from '../worker-pool/worker-pool.schema.js'
import type { PooledTestRunner, PooledTestRunnerError } from './child-process-test-runner-proxy.js'
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
  dryRun: (options) =>
    inner.dryRun(options).pipe(
      Effect.timeoutOrElse({
        duration: Duration.millis(options.timeout),
        orElse: (): Effect.Effect<DryRunResult> => Effect.succeed({ status: DryRunStatus.Timeout }),
      }),
    ),
  mutantRun: (options) =>
    inner.mutantRun(options).pipe(
      Effect.timeoutOrElse({
        duration: Duration.millis(options.timeout),
        orElse: (): Effect.Effect<MutantRunResult> => Effect.succeed({ status: MutantRunStatus.Timeout }),
      }),
    ),
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
export const withRetry: TestRunnerCombinator = (inner) => {
  const attempt = <A>(
    run: Effect.Effect<A, unknown>,
    onExhausted: (message: string) => A,
  ): Effect.Effect<A> =>
    run.pipe(
      Effect.tapError((error) =>
        error instanceof OutOfMemoryError
          ? Effect.logInfo(
            `Test runner process [${error.pid}] ran out of memory. That usually means the tests leak memory. Stryker restarts the process and carries on, but the run is slower for it.`,
          )
          : Effect.void
      ),
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
        status: DryRunStatus.Error,
        errorMessage,
      })),
    mutantRun: (options) =>
      attempt(inner.mutantRun(options), (errorMessage) => ({
        status: MutantRunStatus.Error,
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
    const restartAfter = options.maxTestRunnerReuse ?? 0
    if (restartAfter <= 0) {
      return inner
    }

    const runs = yield* Ref.make(0)

    const wrapped: PooledTestRunner = {
      ...inner,
      mutantRun: (runOptions: MutantRunOptions): Effect.Effect<MutantRunResult, PooledTestRunnerError> =>
        Effect.gen(function*() {
          const count = yield* Ref.updateAndGet(runs, (n) => n + 1)
          if (count > restartAfter) {
            yield* retire
            yield* Ref.set(runs, 1)
          }
          return yield* inner.mutantRun(runOptions)
        }),
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

      dryRun: (options: DryRunOptions) => Ref.set(state, 'loaded').pipe(Effect.andThen(inner.dryRun(options))),

      mutantRun: (options: MutantRunOptions): Effect.Effect<MutantRunResult, PooledTestRunnerError> =>
        Effect.gen(function*() {
          const current = yield* Ref.get(state)
          const canReload = (yield* inner.capabilities).reloadEnvironment

          const decided: MutantRunOptions = options.reloadEnvironment
            // A pristine environment has nothing loaded to reload.
            ? { ...options, reloadEnvironment: current !== 'pristine' && canReload }
            // The previous run left a static mutant behind, so this run needs a
            // clean environment even though it did not ask for one.
            : { ...options, reloadEnvironment: current === 'loaded-static-mutant' && canReload }

          // Where the environment must change and the runner cannot reload, the
          // only clean environment available is a new process.
          if (current === 'loaded-static-mutant' && !canReload) {
            yield* retire
          }

          const result = yield* inner.mutantRun(decided)
          yield* Ref.set(
            state,
            options.reloadEnvironment ? 'loaded-static-mutant' : 'loaded',
          )
          return result
        }),
    }
    return wrapped
  })
