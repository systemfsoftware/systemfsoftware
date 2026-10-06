import { Effect, Exit, Ref, Semaphore } from 'effect'
import { dual } from 'effect/Function'
import type { StoreUnavailable } from './StoreUnavailable.schema.js'
import { close, mint, type Unit, type UnitOfWork } from './unit.handle.js'

const runUnit = <S, D, A, E, R>(
  state: Ref.Ref<S>,
  makeDriver: (state: Ref.Ref<S>) => D,
  f: (unit: Unit<D>) => Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> =>
  Effect.gen(function*() {
    const staged = yield* Ref.make(yield* Ref.get(state))
    const unit = yield* mint(makeDriver(staged))
    const exit = yield* Effect.exit(Effect.ensuring(f(unit), close(unit)))
    yield* Exit.match(exit, {
      onSuccess: () => Effect.flatMap(Ref.get(staged), (next) => Ref.set(state, next)),
      onFailure: () => Effect.void,
    })
    return yield* exit
  })

const memoryOver = <S, D>(
  initial: S,
  makeDriver: (state: Ref.Ref<S>) => D,
): Effect.Effect<UnitOfWork<D>> =>
  Effect.gen(function*() {
    const state = yield* Ref.make(initial)
    const gate = yield* Semaphore.make(1)
    const port: UnitOfWork<D> = <A, E, R>(
      f: (unit: Unit<D>) => Effect.Effect<A, E, R>,
    ): Effect.Effect<A, E | StoreUnavailable, R> => Semaphore.withPermits(gate, 1, runUnit(state, makeDriver, f))
    return port
  })

export const memory: {
  <S, D>(makeDriver: (state: Ref.Ref<S>) => D): (initial: S) => Effect.Effect<UnitOfWork<D>>
  <S, D>(initial: S, makeDriver: (state: Ref.Ref<S>) => D): Effect.Effect<UnitOfWork<D>>
} = dual(2, memoryOver)
