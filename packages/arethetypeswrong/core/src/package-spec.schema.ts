import { Schema } from 'effect'

export const PackageSpecVersionKindSchema = Schema.Literal('none', 'exact', 'range', 'tag')
export type PackageSpecVersionKind = Schema.Schema.Type<typeof PackageSpecVersionKindSchema>

export const ParsedPackageSpecSchema = Schema.Struct({
  name: Schema.String,
  versionKind: PackageSpecVersionKindSchema,
  version: Schema.String,
})
export type ParsedPackageSpec = Schema.Schema.Type<typeof ParsedPackageSpecSchema>
