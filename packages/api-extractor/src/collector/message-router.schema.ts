import * as Schema from 'effect/Schema'

export const LogLevel = Schema.Literals(['error', 'warning', 'info', 'verbose', 'none'] as const)
export type LogLevel = typeof LogLevel.Type

/** A `messages` reporting table entry is not a valid rule for its message category. */
export class MessageRuleError extends Schema.TaggedError<MessageRuleError>()('MessageRuleError', {
  message: Schema.String,
  cause: Schema.optional(Schema.Unknown),
}) {}
