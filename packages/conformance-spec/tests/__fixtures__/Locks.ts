import { Context, Effect, Layer, Match, Ref } from 'effect'

import type { LockCommand } from './lock.model.js'

/** What a lock implementation offers to its callers through the public surface. */
export interface LockHandle {
  readonly tryAcquire: (key: string) => Effect.Effect<boolean>
  readonly release: (key: string) => Effect.Effect<void>
}

export class Locks extends Context.Service<Locks, LockHandle>()(
  '@systemfsoftware/conformance-spec/tests/Locks',
) {}

/** A correct lock: the holder is checked and set in one atomic step. */
export const atomicLock: Layer.Layer<Locks> = Layer.effect(
  Locks,
  Effect.gen(function*() {
    const holder = yield* Ref.make<string | undefined>(undefined)
    return {
      tryAcquire: (key) => Ref.modify(holder, (current) => acquiredAtomically(current, key)),
      release: () => Effect.as(Ref.set(holder, undefined), undefined),
    }
  }),
)

const acquiredAtomically = (
  current: string | undefined,
  key: string,
): readonly [boolean, string | undefined] => current === undefined ? [true, key] : [false, current]

/** A planted bug: the holder is checked in one step and set in a later one. */
export const twoStepLock: Layer.Layer<Locks> = Layer.effect(
  Locks,
  Effect.gen(function*() {
    const holder = yield* Ref.make<string | undefined>(undefined)
    return {
      tryAcquire: (key) => acquiredInTwoSteps(holder, key),
      release: () => Effect.as(Ref.set(holder, undefined), undefined),
    }
  }),
)

const acquiredInTwoSteps = (
  holder: Ref.Ref<string | undefined>,
  key: string,
): Effect.Effect<boolean> =>
  Effect.gen(function*() {
    const current = yield* Ref.get(holder)
    if (current !== undefined) return false
    yield* Ref.set(holder, key)
    return true
  })

/** One public operation of either lock, run inside the implementation's context. */
export const runLockCommand = (command: LockCommand): Effect.Effect<boolean | void, never, Locks> =>
  Effect.gen(function*() {
    const lock = yield* Locks
    return yield* Match.value(command).pipe(
      Match.tag('TryAcquire', (acquire) => lock.tryAcquire(acquire.key)),
      Match.tag('Release', (letGo) => lock.release(letGo.key)),
      Match.exhaustive,
    )
  })
