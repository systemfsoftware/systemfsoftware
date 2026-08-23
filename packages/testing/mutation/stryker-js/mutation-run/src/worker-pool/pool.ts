import type { TestRunnerService } from '@systemfsoftware/stryker-js-plugin-api/test-runner'
import * as Effect from 'effect/Effect'
import * as Pool from 'effect/Pool'
import * as Scope from 'effect/Scope'
import * as Stream from 'effect/Stream'

import type { CheckerResourceService } from '../checker/checker-resource.js'
import type { ChildProcessCrashedError, OutOfMemoryError } from './worker-pool.schema.js'

// Pool.make  — repos/effect/packages/effect/src/Pool.ts:220
// Pool.get    — repos/effect/packages/effect/src/Pool.ts:423
// Pool.invalidate — repos/effect/packages/effect/src/Pool.ts:511

/**
 * A resource that can be initialized and disposed via Effect.
 */
export interface Resource {
  readonly init: Effect.Effect<void>
  readonly dispose: Effect.Effect<void>
}

export type TestRunnerResource = TestRunnerService & Resource
export type CheckerResource = CheckerResourceService
type PoolError = ChildProcessCrashedError | OutOfMemoryError

const acquireWorker = <R extends Resource>(factory: () => R): Effect.Effect<R, never, Scope.Scope> =>
  Effect.acquireRelease(
    Effect.flatMap(Effect.sync(factory), (worker) => Effect.as(worker.init, worker)),
    (worker) => worker.dispose,
  )

/**
 * Create a fixed-size pool whose lifetime is the pool's `Scope`.
 *
 * `size` is the number of workers amortised across thousands of mutants
 * (Pool.make line 220). It comes from `ConcurrencyTokenProvider.concurrencyTestRunners`
 * derived from `os.availableParallelism()` — the machine's parallelism.
 */
export const makeTestRunnerPool = (
  factory: () => TestRunnerResource,
  concurrencyTestRunners: number,
): Effect.Effect<Pool.Pool<TestRunnerResource>, never, Scope.Scope> =>
  Pool.make({
    acquire: acquireWorker(factory),
    size: concurrencyTestRunners,
  })

export const makeCheckerPool = (
  factory: () => CheckerResource,
  concurrencyCheckers: number,
): Effect.Effect<Pool.Pool<CheckerResource>, never, Scope.Scope> =>
  Pool.make({
    acquire: acquireWorker(factory),
    size: concurrencyCheckers,
  })

/**
 * Run each input on a pooled worker, recycling the worker after each item.
 *
 * Worker checkout uses `Pool.get` (line 423) whose return-to-pool is the
 * caller scope's finalizer, and `Pool.invalidate` (line 511) retires a
 * crashed worker so the pool replaces it. The fan-out uses
 * `Stream.mapEffect` with a `concurrency` bound that is *different* from the
 * pool's `size`: `size` is the worker count, `concurrency` is the stream's
 * parallelism for the mutant queue.
 */
export const runWithPool = <R extends Resource, In, Out>(
  pool: Pool.Pool<R>,
  inputs: Stream.Stream<In, never, never>,
  task: (resource: R, input: In) => Effect.Effect<Out, PoolError>,
  streamConcurrency: number,
): Stream.Stream<Out, PoolError> =>
  inputs.pipe(
    Stream.mapEffect(
      (input) =>
        Effect.scoped(
          Effect.flatMap(Pool.get(pool), (resource) =>
            Effect.catchTags(task(resource, input), {
              OutOfMemoryError: (error: OutOfMemoryError) =>
                Effect.flatMap(Pool.invalidate(pool, resource), () => Effect.fail(error)),
              ChildProcessCrashedError: (error: ChildProcessCrashedError) =>
                Effect.flatMap(Pool.invalidate(pool, resource), () => Effect.fail(error)),
            })),
        ),
      { concurrency: streamConcurrency },
    ),
  )
