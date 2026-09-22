import * as Schema from 'effect/Schema'

export const SourceMapJson = Schema.Struct({
  version: Schema.Finite,
  file: Schema.optional(Schema.String),
  sourceRoot: Schema.optional(Schema.String),
  sources: Schema.optional(Schema.Array(Schema.String)),
  names: Schema.optional(Schema.Array(Schema.String)),
  mappings: Schema.String,
})
export type SourceMapJson = typeof SourceMapJson.Type

export const SourceMapJsonFromString = Schema.fromJsonString(SourceMapJson)
