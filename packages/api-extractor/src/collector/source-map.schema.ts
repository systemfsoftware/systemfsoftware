import * as Schema from 'effect/Schema'

export const SourceMapJson = Schema.Struct({
  version: Schema.Finite,
  file: Schema.optionalKey(Schema.String),
  sourceRoot: Schema.optionalKey(Schema.String),
  sources: Schema.optionalKey(Schema.Array(Schema.String)),
  names: Schema.optionalKey(Schema.Array(Schema.String)),
  mappings: Schema.String,
})
export type SourceMapJson = typeof SourceMapJson.Type

export const SourceMapJsonFromString = Schema.fromJsonString(SourceMapJson)
