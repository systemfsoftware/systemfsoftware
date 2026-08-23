import * as Effect from 'effect/Effect'
import * as Pool from 'effect/Pool'
import * as Scope from 'effect/Scope'
import * as Stream from 'effect/Stream'

import type { ChildProcessCrashedError, OutOfMemoryError } from './worker-pool.schema.js'

// Pool.make       — repos/effect/packages/effect/src/Pool.ts:220
// Pool.get        — repos/effect/packages/effect/src/Pool.ts:423
// Pool.invalidate — repos/effect/packages/effect/src/Pool.ts:511

type PoolError = ChildProcessCrashedError | OutOfMemoryError

/**
 * Create a fixed-size pool of workers.
 *
 * `acquire` is a **scoped** Effect: acquiring a worker spawns a child process
 * and registers its teardown on the scope `Pool.make` opens for that worker, so
 * a worker lives exactly as long as its slot in the pool. That is the whole
 * reason this signature takes an `Effect` and not a `() => Worker` — a
 * synchronous factory cannot spawn a process or register a finalizer, so a
 * caller handed one has no way to acquire anything but a lazily-connecting
 * object, and ends up spawning inside each method call instead.
 *
 * `size` is the worker count, amortised across thousands of mutants. It is not
 * the fan-out width: that is the stream `concurrency` in {@link runWithPool},
 * and the two are deliberately separate numbers.
 */
export const makeWorkerPool = <Worker, E>(
  acquire: Effect.Effect<Worker, E, Scope.Scope>,
  size: number,
): Effect.Effect<Pool.Pool<Worker, E>, never, Scope.Scope> => Pool.make({ acquire, size })

/**
 * Run each input on a pooled worker.
 *
 * The `Effect.scoped` here is the **checkout** scope, not the worker's: `Pool.get`
 * registers the return-to-pool on the caller's scope, so closing it hands the
 * worker back rather than tearing it down. A crash instead retires the worker
 * through `Pool.invalidate`, and the pool replaces it on the next checkout.
 */
export const runWithPool = <Worker, In, Out>(
  pool: Pool.Pool<Worker, never>,
  inputs: Stream.Stream<In, never, never>,
  task: (worker: Worker, input: In) => Effect.Effect<Out, PoolError>,
  streamConcurrency: number,
): Stream.Stream<Out, PoolError> =>
  inputs.pipe(
    Stream.mapEffect(
      (input) =>
        Effect.scoped(
          Effect.flatMap(Pool.get(pool), (worker) =>
            Effect.catchTags(task(worker, input), {
              OutOfMemoryError: (error: OutOfMemoryError) =>
                Effect.flatMap(Pool.invalidate(pool, worker), () => Effect.fail(error)),
              ChildProcessCrashedError: (error: ChildProcessCrashedError) =>
                Effect.flatMap(Pool.invalidate(pool, worker), () => Effect.fail(error)),
            })),
        ),
      { concurrency: streamConcurrency },
    ),
  )
