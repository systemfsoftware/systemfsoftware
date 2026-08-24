import { Schema as S } from 'effect'

import { ExitClass } from '../exit-classification.js'

/**
 * Error returned when a tsconfig file fails to parse, or parses to a value that
 * does not match the shape this package consumes.
 */
export class TsConfigParseError extends S.TaggedError<TsConfigParseError>()(
  'TsConfigParseError',
  {
    file: S.String,
    reason: S.String,
    exitClass: S.Literal(ExitClass.ConfigError),
  },
) {}

const JsonRecord = S.Record(S.String, S.Unknown)

/**
 * The tsconfig shape this package reads and rewrites in the sandbox.
 *
 * The index signature keeps every key the schema does not declare — including
 * `compilerOptions` and `$schema` — so unknown keys survive the write-back untouched.
 * `S.mutableKey` keeps the fields the preprocessor rewrites writable (v4's `mutable`
 * only covers arrays), and `S.mutable` keeps the parsed arrays themselves mutable so
 * `TSConfigPreprocessor` can assign rewritten values back onto the config.
 */
export const TsConfigSchema = S.StructWithRest(
  S.Struct({
    extends: S.mutableKey(S.optional(S.Union([S.String, S.Array(S.String)]))),
    references: S.mutableKey(
      S.optional(
        S.mutable(
          S.Array(S.StructWithRest(S.Struct({ path: S.mutableKey(S.String) }), [JsonRecord])),
        ),
      ),
    ),
    files: S.mutableKey(S.optional(S.mutable(S.Array(S.String)))),
    include: S.mutableKey(S.optional(S.mutable(S.Array(S.String)))),
    exclude: S.mutableKey(S.optional(S.mutable(S.Array(S.String)))),
  }),
  [JsonRecord],
)

export type TSConfig = S.Schema.Type<typeof TsConfigSchema>

/** A tsconfig `extends` entry list: the array form of `extends`. */
export const ExtendsArraySchema = S.Array(S.String)
