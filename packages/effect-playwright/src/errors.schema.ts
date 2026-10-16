import { Schema } from 'effect'
import type { YieldableError } from 'effect/Cause'

export const PlaywrightTimeoutBase: Schema.Class<
  PlaywrightTimeout,
  Schema.TaggedStruct<'PlaywrightTimeout', {
    readonly message: typeof Schema.String
    readonly cause: Schema.Defect
  }>,
  YieldableError
> = Schema.TaggedError<PlaywrightTimeout>()('PlaywrightTimeout', {
  message: Schema.String,
  cause: Schema.Defect(),
})

export class PlaywrightTimeout extends PlaywrightTimeoutBase {}

export const PlaywrightFailureBase: Schema.Class<
  PlaywrightFailure,
  Schema.TaggedStruct<'PlaywrightFailure', {
    readonly message: typeof Schema.String
    readonly cause: Schema.Defect
  }>,
  YieldableError
> = Schema.TaggedError<PlaywrightFailure>()('PlaywrightFailure', {
  message: Schema.String,
  cause: Schema.Defect(),
})

export class PlaywrightFailure extends PlaywrightFailureBase {}

export type PlaywrightError = PlaywrightTimeout | PlaywrightFailure
