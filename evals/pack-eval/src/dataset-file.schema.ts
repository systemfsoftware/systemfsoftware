import { Schema } from 'effect'

export class DatasetFileRefusal extends Schema.TaggedError<DatasetFileRefusal>()('DatasetFileRefusal', {
  path: Schema.String,
  reason: Schema.String,
}) {}
