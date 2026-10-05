import { Schema } from 'effect'

/**
 * The store could not complete the unit of work. `cause` carries what the store raised — the last
 * serialization failure, for an adapter that retried — so a caller branches on this variant and
 * reads the original failure from its field.
 */
export class StoreUnavailable extends Schema.TaggedError<StoreUnavailable>()('StoreUnavailable', {
  cause: Schema.Unknown,
}) {
  override get message(): string {
    return 'the store was unavailable'
  }
}
