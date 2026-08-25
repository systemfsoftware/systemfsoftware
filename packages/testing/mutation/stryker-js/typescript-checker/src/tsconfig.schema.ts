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

/**
 * The configured tsconfig file could not be read from disk.
 */
export class TsConfigNotFoundError extends S.TaggedError<TsConfigNotFoundError>()(
  'TsConfigNotFoundError',
  {
    file: S.String,
  },
) {
  override get message(): string {
    return `The tsconfig file does not exist at: "${this.file}". Please configure the tsconfig file in your stryker.conf file using "tsconfigFile"`
  }
}

const JsonRecord = S.Record(S.String, S.Unknown)

export const TsConfigSchema = S.StructWithRest(
  S.Struct({
    references: S.optional(S.Array(S.StructWithRest(S.Struct({ path: S.String }), [JsonRecord]))),
    compilerOptions: S.optional(JsonRecord),
  }),
  [JsonRecord],
)

export type TsConfig = S.Schema.Type<typeof TsConfigSchema>
