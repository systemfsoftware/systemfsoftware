import * as S from 'effect/Schema'

/**
 * The shape of this package's own `package.json` that the public surface
 * exposes (`strykerVersion`, `strykerEngines`). The file is data read from
 * disk, so it is decoded through this schema rather than trusted after
 * `JSON.parse`; every other `package.json` key is ignored.
 */
export const PackageJsonSchema = S.Struct({
  version: S.String,
  engines: S.Struct({
    node: S.String,
  }),
})
