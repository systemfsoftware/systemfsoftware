import * as Schema from 'effect/Schema'

export const LogLevel = Schema.Literals(['error', 'warning', 'info', 'verbose', 'none'] as const)
export type LogLevel = typeof LogLevel.Type

export const ExtractorMessageCategorySchema = Schema.Literals(
  [
    'Compiler',
    'TSDoc',
    'Extractor',
    'console',
  ] as const,
)
export type ExtractorMessageCategory = typeof ExtractorMessageCategorySchema.Type

export class MessageRuleError extends Schema.TaggedError<MessageRuleError>()('MessageRuleError', {
  message: Schema.String,
  cause: Schema.optional(Schema.Unknown),
}) {}
