import * as Schema from 'effect/Schema'

export const SourceMapJson = Schema.Struct({
  version: Schema.Finite,
  file: Schema.optionalKey(Schema.String),
  sourceRoot: Schema.optionalKey(Schema.String),
  sources: Schema.Array(Schema.String).pipe(Schema.optionalKey),
  names: Schema.Array(Schema.String).pipe(Schema.optionalKey),
  mappings: Schema.String,
})
export type SourceMapJson = typeof SourceMapJson.Type

export const SourceMapJsonFromString = Schema.fromJsonString(SourceMapJson)
