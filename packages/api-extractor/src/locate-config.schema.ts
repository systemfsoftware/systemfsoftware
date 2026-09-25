import * as Schema from 'effect/Schema'

/** The locate command: an explicit config path, or the folder the upward search starts at. */
export class LocateConfig extends Schema.TaggedClass<LocateConfig>()('LocateConfig', {
  explicitPath: Schema.optional(Schema.String),
  startFolder: Schema.String,
}) {}
