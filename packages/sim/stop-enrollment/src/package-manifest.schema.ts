import { Schema } from 'effect'

export const PackageManifest = Schema.Struct({
  name: Schema.optional(Schema.String),
  scripts: Schema.optional(
    Schema.Struct({
      test: Schema.optional(Schema.String),
    }),
  ),
})

export type PackageManifest = Schema.Schema.Type<typeof PackageManifest>
