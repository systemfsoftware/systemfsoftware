import type { Worker } from '@systemfsoftware/effect-daemon-spec'
import { Deferred, Duration, Effect, Ref } from 'effect'
import { dual } from 'effect/Function'
import { TestClock } from 'effect/testing'

import { Daemon } from '@systemfsoftware/effect-daemon-spec'

export const CounterRef = {
  make: Ref.make<number>(0),
  increment: (ref: Ref.Ref<number>) => Ref.update(ref, (n) => n + 1),
  read: (ref: Ref.Ref<number>) => Ref.get(ref),
} as const

export const BufferedRef = {
  make: <T>() => Ref.make<Array<T>>([]),
  append: <T>(ref: Ref.Ref<Array<T>>, value: T) => Ref.update(ref, (arr) => [...arr, value]),
  readAll: <T>(ref: Ref.Ref<Array<T>>) => Ref.get(ref),
} as const

export const FailingWork = (failCount: number): Worker<string, never> =>
  Effect.runSync(Effect.gen(function*() {
    const counter = yield* Ref.make<number>(0)
    return Daemon.poll({
      name: 'failing',
      interval: Duration.millis(1),
      tick: { tickTimeout: Duration.seconds(90) },
      work: Effect.gen(function*() {
        const n = yield* Ref.get(counter)
        if (n < failCount) {
          yield* Ref.update(counter, (c) => c + 1)
          return yield* Effect.fail(`failing tick ${n + 1} of ${failCount}`)
        }
        return 'ok'
      }),
      lock: { mode: 'none' },
    })
  }))

export const advanceUntil: {
  <A, E>(done: Deferred.Deferred<A, E>, step: Duration.Duration): Effect.Effect<void>
  <A, E>(step: Duration.Duration): (done: Deferred.Deferred<A, E>) => Effect.Effect<void>
} = dual(
  2,
  <A, E>(done: Deferred.Deferred<A, E>, step: Duration.Duration): Effect.Effect<void> =>
    Deferred.isDone(done).pipe(
      Effect.flatMap((finished) =>
        finished ? Effect.void : Effect.andThen(TestClock.adjust(step), advanceUntil(done, step))
      ),
    ),
)
