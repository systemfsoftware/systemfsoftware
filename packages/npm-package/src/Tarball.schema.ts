import { Schema } from 'effect'
export const PackageVersion = Schema.NonEmptyString.pipe(Schema.brand('PackageVersion'))
export type PackageVersion = typeof PackageVersion.Type

/** The two fields a package tarball's own `package.json` must carry to identify it. */
export const TarballPackageJsonSchema = Schema.Struct({
  name: Schema.String,
  version: PackageVersion,
})
