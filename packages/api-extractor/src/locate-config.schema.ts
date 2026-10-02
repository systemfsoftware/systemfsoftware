import * as Schema from 'effect/Schema'

/** The locate command: an explicit config path, or the folder the upward search starts at. */
export const LocateConfig = Schema.TaggedStruct('LocateConfig', {
  explicitPath: Schema.optional(Schema.String),
  startFolder: Schema.String,
})
export type LocateConfig = typeof LocateConfig.Type
