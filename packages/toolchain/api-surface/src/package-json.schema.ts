import * as Schema from 'effect/Schema'

export const PackageJsonSchema = Schema.Struct({
  name: Schema.String,
  exports: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
})
