import type { FileDescriptions, StrykerOptions } from '@systemfsoftware/stryker-js-plugin-api/core'
import type { MutantRunOptions } from '@systemfsoftware/stryker-js-plugin-api/test-runner'
import * as Effect from 'effect/Effect'
import * as Scope from 'effect/Scope'
import * as ChildProcessSpawner from 'effect/unstable/process/ChildProcessSpawner'
import type { IdGeneratorShape } from '../worker-pool/id-generator.js'
import type { PooledTestRunner } from './child-process-test-runner-proxy.js'
import {
  commandRunnerCapabilities,
  commandRunnerDryRun,
  commandRunnerMutantRun,
  isCommandRunner,
} from './command-test-runner.js'
import { withEnvironmentReload, withMaxReuse, withRetry, withTimeout } from './test-runner-combinators.js'
export * from './test-runner-combinators.js'

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
  childProcessRunner: Effect.Effect<PooledTestRunner, unknown, Scope.Scope>,
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
