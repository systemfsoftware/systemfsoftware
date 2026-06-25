import { Duration, Effect, Ref } from 'effect'
import type { Worker } from '../../daemon-spec.js'
import { Daemon } from '../../daemon.js'

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
