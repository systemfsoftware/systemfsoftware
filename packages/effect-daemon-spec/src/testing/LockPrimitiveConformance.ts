/**
 * The lock conformance suite (R21, KTD16): the pure model of a leadership
 * lock and the wiring any `LockPrimitive` implementation needs to run the
 * linearizable check over the leader lock the daemon actually uses
 * (`LeaderLockFromPrimitive`).
 *
 * A command's answer is the leadership handed out through the leader lock,
 * exactly the way two daemons, one lock and one leader collide in
 * production: a claimant that takes the leadership holds it — the claimant
 * fiber stays suspended on the taken lock — until a release lets it go, so a
 * refusal is the lock's own answer and not a claim that already ended. The
 * {@link Leadership} service hands the guards out one at a time, so no
 * leadership leaks from one command into the next, and the bound the check
 * reports (fibers, operations, preemptions, runs) states what the search
 * explored (R32).
 */
import { Context, Deferred, Effect, Exit, Fiber, Layer, Match, Option, Ref, Schema, Scope } from 'effect'
import { dual } from 'effect/Function'
import type * as ScopeContract from 'effect/Scope'
import { LeaderLockInfraError } from '../LeaderLock.schema.js'
import {
  LeaderLock,
  LeaderLockFromPrimitive,
  type LeaderLockService,
  type LockPrimitive,
} from '../LeaderLockAdapter.js'

import { LockCommand, LockState } from './LockCommand.schema.js'

export { LockCommand, LockState }

const initialLockState: LockState = { holder: undefined }

/** One step of the lock model: the next state, and the response the caller observes. */
export const stepLock: {
  (state: LockState, command: LockCommand): readonly [LockState, boolean | void]
  (command: LockCommand): (state: LockState) => readonly [LockState, boolean | void]
} = dual(
  2,
  (state: LockState, command: LockCommand): readonly [LockState, boolean | void] =>
    Match.value(command).pipe(
      Match.tag('TryAcquire', (acquire) => acquireOn(state, acquire.key)),
      Match.tag('Release', () => [{ holder: undefined }, undefined] as const),
      Match.exhaustive,
    ),
)

const acquireOn = (state: LockState, key: string): readonly [LockState, boolean] =>
  state.holder === undefined ? [{ holder: key }, true] : [{ holder: state.holder }, false]

/** The model the check judges every history against (R6, R21). */
export const lockModel: {
  readonly state: Schema.Codec<LockState>
  readonly initial: LockState
  readonly step: (state: LockState, command: LockCommand) => readonly [LockState, boolean | void]
} = {
  state: LockState,
  initial: initialLockState,
  step: stepLock,
}

/** One claimant's hold on the leadership: the claimant fiber and the scope it runs under. */
interface Guard {
  readonly claimant: Fiber.Fiber<Option.Option<never>, LeaderLockInfraError>
  readonly claimScope: ScopeContract.Closeable
}

const takenUnder = (
  lock: LeaderLockService,
  key: string,
  layerScope: ScopeContract.Scope,
): Effect.Effect<Option.Option<Guard>, LeaderLockInfraError> =>
  Effect.gen(function*() {
    const decided = yield* Deferred.make<boolean>()
    const claimScope = yield* Scope.fork(layerScope)
    const claimant = yield* Effect.forkIn(
      Scope.provide(
        lock.withLock(key, Effect.andThen(Deferred.succeed(decided, true), Effect.never)),
        claimScope,
      ),
      claimScope,
      { startImmediately: true },
    )
    const granted = yield* Effect.race(Deferred.await(decided), Effect.as(Fiber.join(claimant), false))
    if (!granted) {
      yield* Scope.close(claimScope, Exit.void)
      return Option.none()
    }
    return Option.some({ claimant, claimScope })
  })

const handedBack = (guard: Guard): Effect.Effect<void> =>
  Effect.andThen(Fiber.interrupt(guard.claimant), Scope.close(guard.claimScope, Exit.void))

interface LeadershipHandle {
  readonly run: (command: LockCommand) => Effect.Effect<boolean | void, LeaderLockInfraError>
}

/** What the check drives: one leadership handed out one command at a time. */
export class Leadership extends Context.Service<Leadership, LeadershipHandle>()(
  '@systemfsoftware/effect-daemon-spec/testing/Leadership',
) {}

const commandRunner = (
  guard: Ref.Ref<Option.Option<Guard>>,
  lock: LeaderLockService,
  layerScope: ScopeContract.Scope,
): (command: LockCommand) => Effect.Effect<boolean | void, LeaderLockInfraError> => {
  const runner = (command: LockCommand): Effect.Effect<boolean | void, LeaderLockInfraError> =>
    Match.value(command).pipe(
      Match.tag(
        'TryAcquire',
        (acquire) =>
          Effect.flatMap(takenUnder(lock, acquire.key, layerScope), (taken) =>
            Option.isSome(taken)
              ? Effect.as(Ref.set(guard, taken), true)
              : Effect.succeed(false)),
      ),
      Match.tag(
        'Release',
        () =>
          Effect.flatMap(
            Ref.getAndSet(guard, Option.none()),
            (held) => Option.isSome(held) ? handedBack(held.value) : Effect.void,
          ),
      ),
      Match.exhaustive,
    )
  return runner
}

const leadershipLayer: Layer.Layer<Leadership, never, LeaderLock> = Layer.effect(
  Leadership,
  Effect.gen(function*() {
    const lock = yield* LeaderLock
    const layerScope = yield* Effect.scope
    const guard = yield* Ref.make(Option.none<Guard>())
    return Leadership.of({ run: commandRunner(guard, lock, layerScope) })
  }),
)

/**
 * The implementation the check runs: a `LeaderLock` over the given
 * `LockPrimitive`, handing the leadership out one claimant at a time. The
 * search builds this fresh for every history, so no state carries over.
 */
export const leadershipOver = (
  primitive: Layer.Layer<LockPrimitive>,
): Layer.Layer<Leadership | LeaderLock> =>
  Layer.provideMerge(leadershipLayer, Layer.provideMerge(LeaderLockFromPrimitive, primitive))

/** One command through the {@link Leadership} the check drives. */
export const runLockCommand = (
  command: LockCommand,
): Effect.Effect<boolean | void, LeaderLockInfraError, Leadership> =>
  Effect.flatMap(Leadership, (leadership) => leadership.run(command))
