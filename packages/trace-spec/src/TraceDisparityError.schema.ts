import { Schema } from 'effect'
import { Break } from './Verdict.schema.js'

export class TraceDisparityError extends Schema.TaggedError<TraceDisparityError>()('TraceDisparityError', {
  relationId: Schema.String,
  traceId: Schema.String,
  breaks: Schema.Array(Break),
  dumpPath: Schema.NullOr(Schema.String),
}) {}
