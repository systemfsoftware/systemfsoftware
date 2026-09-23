import * as Schema from 'effect/Schema'

export class LocateConfig extends Schema.TaggedClass<LocateConfig>()('LocateConfig', {
  explicitPath: Schema.optional(Schema.String),
  startFolder: Schema.String,
}) {}
