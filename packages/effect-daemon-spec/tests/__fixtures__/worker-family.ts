import { Daemon, run } from '@systemfsoftware/effect-daemon-spec'
import { Context, Deferred, Duration, Effect, Exit, Layer, Match, Ref, Scope, Stream } from 'effect'

import type { WorkerFamilyCommand } from './worker-family.model.js'

interface StartedWorker {
  readonly scope: Scope.Closeable
  readonly departure: Deferred.Deferred<void>
}

export interface WorkerFamilyHandle {
  readonly startWorker: Effect.Effect<number>
  readonly stopWorker: Effect.Effect<number>
  readonly readRunning: Effect.Effect<number>
}

export class WorkerFamily extends Context.Service<WorkerFamily, WorkerFamilyHandle>()(
  '@systemfsoftware/effect-daemon-spec/tests/worker-family.conformance.test/WorkerFamily',
) {}

const holdingWorker = (arrival: Deferred.Deferred<void>, departure: Deferred.Deferred<void>) =>
  Daemon.stream({
    name: 'family-checked-worker',
    stream: Stream.ensuring(
      Stream.concat(
        Stream.fromEffect(Deferred.succeed(arrival, void 0)),
        Stream.never,
      ),
      Deferred.succeed(departure, void 0),
    ),
    tick: { tickTimeout: Duration.seconds(90) },
    lock: { mode: 'none' },
  })

export const workerFamilyLayer: Layer.Layer<WorkerFamily> = Layer.effect(
  WorkerFamily,
  Effect.gen(function*() {
    const started = yield* Ref.make<ReadonlyArray<StartedWorker>>([])
    const running = Ref.get(started).pipe(Effect.map((workers) => workers.length))
    const startWorker = Effect.gen(function*() {
      const arrival = yield* Deferred.make<void>()
      const departure = yield* Deferred.make<void>()
      const scope = yield* Scope.make()
      const health = yield* Scope.provide(run.worker(holdingWorker(arrival, departure)), scope)
      yield* health.ready.await
      yield* Deferred.await(arrival)
      yield* Ref.update(started, (workers) => [...workers, { scope, departure }])
      return yield* running
    })
    const stopWorker = Effect.gen(function*() {
      const last = yield* Ref.modify(started, (workers) => [workers[workers.length - 1], workers.slice(0, -1)] as const)
      if (last === undefined) return yield* running
      yield* Scope.close(last.scope, Exit.void)
      yield* Deferred.await(last.departure)
      return yield* running
    })
    return WorkerFamily.of({ startWorker, stopWorker, readRunning: running })
  }),
)

export const runWorkerFamilyCommand = (
  command: WorkerFamilyCommand,
): Effect.Effect<number, never, WorkerFamily> =>
  Effect.flatMap(WorkerFamily, (family) =>
    Match.value(command).pipe(
      Match.tag('StartWorker', () => family.startWorker),
      Match.tag('StopWorker', () => family.stopWorker),
      Match.tag('ReadRunning', () => family.readRunning),
      Match.exhaustive,
    ))
