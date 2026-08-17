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
export const VitestSectionSchema = S.optional(VitestRunnerOptionsSchema).pipe(
  S.withDecodingDefault(Effect.succeed({ related: true })),
)
