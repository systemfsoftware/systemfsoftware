/**
 * Tsconfig — declarations for the TypeScript configuration consumed by the checker.
 *
 * Typed by Effect Schema and decoded at the boundary; the compiler capability
 * consumes only validated shapes.
 */
import { Schema as S } from 'effect'

/** The configured tsconfig failed to parse or is not a shape this package can consume. */
export class TsConfigParseError extends S.TaggedError<TsConfigParseError>()('TsConfigParseError', {
  file: S.String,
  reason: S.String,
}) {}

/** The configured tsconfig file could not be read. */
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

const InternalTsConfigSchema = S.Struct({
  references: S.optional(S.Array(S.Struct({ path: S.String }))),
  compilerOptions: S.optional(S.Record(S.String, S.Unknown)),
})

export const TsConfigSchema = InternalTsConfigSchema

export type TsConfig = S.Schema.Type<typeof TsConfigSchema>
