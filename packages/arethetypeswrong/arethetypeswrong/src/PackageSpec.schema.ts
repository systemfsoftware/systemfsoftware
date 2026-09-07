import { Schema } from 'effect'

export const PackageSpecVersionKindSchema = Schema.Literals(['none', 'exact', 'range', 'tag'])
export type PackageSpecVersionKind = Schema.Schema.Type<typeof PackageSpecVersionKindSchema>

export const ParsedPackageSpecSchema = Schema.Union([
  Schema.Struct({
    name: Schema.NonEmptyString,
    versionKind: Schema.Literal('none'),
  }),
  Schema.Struct({
    name: Schema.NonEmptyString,
    versionKind: Schema.Literals(['exact', 'range', 'tag']),
    version: Schema.NonEmptyString,
  }),
])
export type ParsedPackageSpec = Schema.Schema.Type<typeof ParsedPackageSpecSchema>

/**
 * Refusal a specifier parse returns: the specifier named no valid package, or
 * carried a version that was neither an exact version nor a range.
 */
export class PackageSpecParseError extends Schema.TaggedError<PackageSpecParseError>()(
  'PackageSpecParseError',
  { message: Schema.String },
) {}
