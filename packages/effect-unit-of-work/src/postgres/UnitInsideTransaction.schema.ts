import { Schema } from 'effect'

/**
 * A Postgres unit was opened while the caller already had a transaction open on the same client. The
 * adapter refuses rather than opening a savepoint inside it, running `SET TRANSACTION` inside it, or
 * silently downgrading the SERIALIZABLE isolation a Postgres unit promises. It is a named value, not
 * a message, so a caller matches the tag.
 */
export class UnitInsideTransaction extends Schema.TaggedError<UnitInsideTransaction>()(
  'UnitInsideTransaction',
  {},
) {
  override get message(): string {
    return 'a Postgres unit cannot run inside a transaction the caller already has open'
  }
}
