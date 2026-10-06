import type { Snapshot } from '@systemfsoftware/xstate'
import type { Cause } from 'effect'
import { Data } from 'effect'

/**
 * The failure an Effect-backed actor reports when its Effect was interrupted
 * by something other than the actor being stopped, such as `Effect.interrupt`,
 * losing an `Effect.race`, or an `Effect.timeout` that interrupts.
 */
export class EffectInterruptedError extends Data.TaggedError(
  // Grant until U5: upstream's published `_tag`, asserted by its tests and matched by `Effect.catchTag`.
  // @effect-diagnostics-next-line deterministicKeys:off
  'EffectInterruptedError',
)<{
  readonly cause: Cause.Cause<never>
}> {
  override get message(): string {
    return 'Effect was interrupted before the actor completed'
  }
}

/**
 * Reported by `waitFor` when the actor stops or errors before a snapshot
 * matches, and by `join` when the actor stops without output. `join` reports
 * an errored actor's own `snapshot.error` instead.
 */
export class ActorStoppedError extends Data.TaggedError(
  // Grant until U5: upstream's published `_tag`, asserted by its tests and matched by `Effect.catchTag`.
  // @effect-diagnostics-next-line deterministicKeys:off
  'ActorStoppedError',
)<{
  readonly actorId: string
  readonly snapshot: Snapshot<unknown>
}> {
  override get message(): string {
    return `Actor "${this.actorId}" ${this.snapshot.status === 'error' ? 'errored' : 'stopped'} before completing`
  }
}

/**
 * Reported by the `send` atom of `createActorAtoms` when an event is sent
 * before the actor's runtime has finished building.
 */
export class NotReadyError extends Data.TaggedError(
  // Grant until U5: upstream's published `_tag`, asserted by its tests and matched by `Effect.catchTag`.
  // @effect-diagnostics-next-line deterministicKeys:off
  'NotReadyError',
) {
  override get message(): string {
    return 'The actor is not ready yet'
  }
}
