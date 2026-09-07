import { Schema } from 'effect'

/** The two fields a package tarball's own `package.json` must carry to identify it. */
export const TarballPackageJsonSchema = Schema.Struct({
  name: Schema.String.pipe(Schema.check(Schema.isMinLength(1))),
  version: Schema.String.pipe(Schema.check(Schema.isMinLength(1))),
})
