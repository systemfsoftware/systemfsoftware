import { Schema } from 'effect'

export const PlaywrightErrorReason = Schema.Literals(['Timeout', 'Unknown'])
export type PlaywrightErrorReason = typeof PlaywrightErrorReason.Type

export class PlaywrightError extends Schema.TaggedError<PlaywrightError>()('PlaywrightError', {
  reason: PlaywrightErrorReason,
  cause: Schema.Defect(),
}) {}
