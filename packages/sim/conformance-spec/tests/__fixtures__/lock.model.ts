import { Match, Schema } from 'effect'
import { dual } from 'effect/Function'

/** The two operations of a keyed lock, generated from this Schema during a check (R11). */
export const LockCommand = Schema.Union([
  Schema.TaggedStruct('TryAcquire', { key: Schema.Literals(['k']) }),
  Schema.TaggedStruct('Release', { key: Schema.Literals(['k']) }),
])

export type LockCommand = Schema.Schema.Type<typeof LockCommand>

export const tryAcquire = (): LockCommand => ({ _tag: 'TryAcquire', key: 'k' })

export const release = (): LockCommand => ({ _tag: 'Release', key: 'k' })

/** Which key holds the lock; an absent holder means the lock is free. */
export const LockState = Schema.Struct({ holder: Schema.UndefinedOr(Schema.String) })

export type LockState = Schema.Schema.Type<typeof LockState>

export const initialLockState: LockState = { holder: undefined }

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

type LockModel = {
  readonly state: Schema.Codec<LockState>
  readonly initial: LockState
  readonly step: (state: LockState, command: LockCommand) => readonly [LockState, boolean | void]
}

export const lockModel: LockModel = {
  state: LockState,
  initial: initialLockState,
  step: stepLock,
}
