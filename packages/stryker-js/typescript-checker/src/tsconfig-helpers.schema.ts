import { Schema as S } from 'effect'

/**
 * Error returned when a tsconfig file fails to parse or does not match the
 * shape this package consumes.
 */
export class TsConfigParseError extends S.TaggedError<TsConfigParseError>()(
  'TsConfigParseError',
  {
    file: S.String,
    reason: S.String,
  },
) {}

const JsonRecord = S.Record(S.String, S.Unknown)

export const TsConfigSchema = S.StructWithRest(
  S.Struct({
    references: S.optional(
      S.Array(S.StructWithRest(S.Struct({ path: S.String }), [JsonRecord])),
    ),
    compilerOptions: S.optional(JsonRecord),
  }),
  [JsonRecord],
)

export type TsConfig = S.Schema.Type<typeof TsConfigSchema>
