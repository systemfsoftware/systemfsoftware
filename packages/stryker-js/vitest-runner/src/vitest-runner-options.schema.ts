import { Effect } from 'effect'
import * as S from 'effect/Schema'

/**
 * The `vitest` option section of the Stryker options document. `related`
 * defaults to `true` at decode, the other members are optional.
 */
export const VitestRunnerOptionsSchema = S.Struct({
  dir: S.optional(S.String),
  related: S.optional(S.Boolean).pipe(
    S.withDecodingDefault(Effect.succeed(true)),
  ),
  configFile: S.optional(S.String),
})

export type VitestRunnerOptions = S.Schema.Type<
  typeof VitestRunnerOptionsSchema
>

/**
 * The `vitest` section of the Stryker options document: absent from the input
 * document, or present as a partial, and decoded into the section defaults.
 */
const VitestSectionSchema = S.optional(VitestRunnerOptionsSchema).pipe(
  S.withDecodingDefault(Effect.succeed({ related: true })),
)

export const decodeVitestOptions = (input: unknown): VitestRunnerOptions => {
  const options = S.decodeUnknownSync(VitestSectionSchema)(input)
  return options === undefined ? { related: true } : options
}

/**
 * The `vitest` option section of the Stryker options document, as a JSON
 * Schema document the plugin loader can contribute to Stryker's option
 * validation — derived from the declaration, never read from a file.
 */
export const vitestSectionJsonSchema: Record<string, unknown> = S.toJsonSchemaDocument(
  S.Struct({ vitest: S.optional(VitestRunnerOptionsSchema) }),
).schema
