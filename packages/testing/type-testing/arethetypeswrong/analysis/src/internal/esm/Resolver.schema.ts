import { Schema } from 'effect'

/** @internal */
export const PackageJsonSchema = Schema.Struct({
  name: Schema.optional(Schema.String),
  main: Schema.optional(Schema.String),
  type: Schema.optional(Schema.String),
  exports: Schema.optional(Schema.Unknown),
  imports: Schema.optional(Schema.Unknown),
})

/** @internal */
export type PackageJson = Schema.Schema.Type<typeof PackageJsonSchema>
