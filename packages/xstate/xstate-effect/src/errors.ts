import type { Snapshot } from '@systemfsoftware/xstate'
import type { Cause } from 'effect'
import { Data } from 'effect'

/**
 * The failure an Effect-backed actor reports when its Effect was interrupted
 * by something other than the actor being stopped, such as `Effect.interrupt`,
 * losing an `Effect.race`, or an `Effect.timeout` that interrupts.
 *
 * The deterministic key names where the class lives; `_tag` stays the short
 * historical tag so `Effect.catchTag` and the published error contract hold.
 */
export class EffectInterruptedError extends Data.TaggedError<string>(
  '@systemfsoftware/xstate-effect/errors/EffectInterruptedError',
)<{
  readonly cause: Cause.Cause<never>
}> {
  override readonly _tag = 'EffectInterruptedError'
  override get name(): string {
    return 'EffectInterruptedError'
  }
  override get message(): string {
    return 'Effect was interrupted before the actor completed'
  }
}

/**
 * Reported by `waitFor` when the actor stops or errors before a snapshot
 * matches, and by `join` when the actor stops without output. `join` reports
 * an errored actor's own `snapshot.error` instead.
 *
 * The deterministic key names where the class lives; `_tag` stays the short
 * historical tag so `Effect.catchTag` and the published error contract hold.
 */
export class ActorStoppedError extends Data.TaggedError<string>(
  '@systemfsoftware/xstate-effect/errors/ActorStoppedError',
)<{
  readonly actorId: string
  readonly snapshot: Snapshot<unknown>
}> {
  override readonly _tag = 'ActorStoppedError'
  override get name(): string {
    return 'ActorStoppedError'
  }
  override get message(): string {
    return `Actor "${this.actorId}" ${this.snapshot.status === 'error' ? 'errored' : 'stopped'} before completing`
  }
}

/**
 * Reported by the `send` atom of `createActorAtoms` when an event is sent
 * before the actor's runtime has finished building.
 *
 * The deterministic key names where the class lives; `_tag` stays the short
 * historical tag so `Effect.catchTag` and the published error contract hold.
 */
export class NotReadyError extends Data.TaggedError<string>(
  '@systemfsoftware/xstate-effect/errors/NotReadyError',
) {
  override readonly _tag = 'NotReadyError'
  override get name(): string {
    return 'NotReadyError'
  }
  override get message(): string {
    return 'The actor is not ready yet'
  }
}
