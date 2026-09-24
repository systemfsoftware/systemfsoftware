import { Schema } from 'effect'

/** The two operations of a leadership lock, generated from this Schema during a check (R11). */
export const LockCommand = Schema.Union([
  Schema.TaggedStruct('TryAcquire', { key: Schema.Literals(['leadership']) }),
  Schema.TaggedStruct('Release', { key: Schema.Literals(['leadership']) }),
])

export type LockCommand = Schema.Schema.Type<typeof LockCommand>

/** Which key hands out the leadership; an absent holder means the lock is free. */
export const LockState = Schema.Struct({ holder: Schema.UndefinedOr(Schema.String) })

export type LockState = Schema.Schema.Type<typeof LockState>
