import { Schema } from 'effect'

const NpmRegistryVersionSchema = Schema.Struct({
  deprecated: Schema.optional(Schema.String),
  dist: Schema.Struct({ tarball: Schema.String }),
})

/**
 * The npm registry document this module reads, covering both response shapes the
 * registry serves: the packument (`versions`, `dist-tags`, `time`) and a single
 * version manifest (`version`, `dist`), plus the `{ error }` error document.
 * Declared so the response is decoded rather than asserted: a registry that
 * changes shape fails here, naming the field, instead of surfacing as member
 * accesses on `any` further downstream.
 */
export const NpmRegistryDocSchema = Schema.Struct({
  error: Schema.optional(Schema.String),
  version: Schema.optional(Schema.String),
  dist: Schema.optional(Schema.Struct({ tarball: Schema.String })),
  versions: Schema.optional(Schema.Record(Schema.String, NpmRegistryVersionSchema)),
  'dist-tags': Schema.optional(Schema.Record(Schema.String, Schema.String)),
  time: Schema.optional(Schema.Record(Schema.String, Schema.String)),
})
export type NpmRegistryDoc = Schema.Schema.Type<typeof NpmRegistryDocSchema>

/** The `package.json` fields read out of a downloaded tarball. */
export const TarballPackageJsonSchema = Schema.Struct({
  name: Schema.String,
  version: Schema.String,
})
export type TarballPackageJson = Schema.Schema.Type<typeof TarballPackageJsonSchema>
