import { Schema as S } from 'effect'

export const PackageJsonSchema = S.Struct({
  version: S.String,
})
