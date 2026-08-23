import * as Context from 'effect/Context'
import type * as Effect from 'effect/Effect'
import type { DryRunResult } from './DryRunResult.js'
import type { MutantRunResult } from './MutantRunResult.js'
import type { DryRunOptions, MutantRunOptions } from './RunOptions.js'
import type { TestRunnerCapabilities } from './TestRunnerCapabilities.js'
import type { TestRunnerFailed } from './TestRunnerFailed.schema.js'

/**
 * What a test runner does, as values rather than started work.
 *
 * The lifecycle members are total, unlike the interface this replaces. There,
 * `init` and `dispose` were optional and `capabilities` could return either a
 * `Promise` or a bare value, so every call site carried the same three shims: a
 * `typeof` guard, an `await` that might be awaiting a non-promise, and a
 * `?.()`. A runner with nothing to do returns `Effect.void`, which is the same
 * behaviour stated once in the implementation rather than N times in the
 * callers.
 *
 * `dispose` is on the port for the same reason `init` is, but it is not how the
 * engine releases a runner: the engine acquires runners through a `Scope`, so
 * closing the scope disposes them, including on interruption — which an
 * optional `dispose()` a caller had to remember to call never did.
 *
 * `R` is `never` on every operation: a runner's framework, sandbox directory and
 * child processes come from the `Layer` that builds it (`REPO-A3`).
 */
export interface TestRunnerService {
  readonly capabilities: Effect.Effect<TestRunnerCapabilities, TestRunnerFailed>

  readonly init: Effect.Effect<void, TestRunnerFailed>

  /**
   * Run the test suite once with no mutant active, to learn which tests exist
   * and what they cover.
   */
  readonly dryRun: (
    options: DryRunOptions,
  ) => Effect.Effect<DryRunResult, TestRunnerFailed>

  /**
   * Run the tests with one mutant active.
   *
   * A killed, survived or timed-out mutant is a `MutantRunResult` on the success
   * channel; the error channel is only for the runner breaking.
   */
  readonly mutantRun: (
    options: MutantRunOptions,
  ) => Effect.Effect<MutantRunResult, TestRunnerFailed>

  readonly dispose: Effect.Effect<void, TestRunnerFailed>
}

export class TestRunner extends Context.Service<TestRunner, TestRunnerService>()(
  '@systemfsoftware/stryker-js-plugin-api/test-runner/TestRunner',
) {}
