import { Schema } from 'effect'
import { ErrorCode } from './result.schema.js'

export class SystemfError extends Schema.TaggedError<SystemfError>()('SystemfError', {
  code: ErrorCode,
  message: Schema.String,
  suggestions: Schema.optional(Schema.Array(Schema.String)),
}) {}
