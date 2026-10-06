import type { ActorLogic, InputFrom, SnapshotFrom } from '@systemfsoftware/xstate'

/**
 * The snapshot, event and input types of the actor logic a helper is
 * parameterized by. Declared once here so the bundled declaration emitter has
 * one declaration to name rather than a `_2`/`$1` suffix per module.
 *
 * @experimental
 */
export type SnapshotFromSource<TSource> = SnapshotFrom<TSource>

/** @experimental */
export type EventFromSource<TSource> = TSource extends ActorLogic<
  any,
  infer TEvent,
  any
> ? TEvent
  : never

/** @experimental */
export type InputFromSource<TSource> = InputFrom<TSource>
