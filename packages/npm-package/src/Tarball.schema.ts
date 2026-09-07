import { Schema } from 'effect'

/** The two fields a package tarball's own `package.json` must carry to identify it. */
export const TarballPackageJsonSchema = Schema.Struct({
  name: Schema.NonEmptyString,
  version: Schema.NonEmptyString,
})
