import { Schema } from 'effect'

export class PlaywrightTimeout extends Schema.TaggedError<PlaywrightTimeout>()('PlaywrightTimeout', {
  message: Schema.String,
  cause: Schema.Defect(),
}) {}

export class PlaywrightFailure extends Schema.TaggedError<PlaywrightFailure>()('PlaywrightFailure', {
  message: Schema.String,
  cause: Schema.Defect(),
}) {}

export type PlaywrightError = PlaywrightTimeout | PlaywrightFailure
