/**
 * The JSON Schema document view the integration lanes decode when they read
 * the fork's derived schema (`forkCoreSchema`) or its shipped JSON Schema
 * artifact (`schema/stryker-schema.json`). Extracted from the tests so
 * module-scope schema declarations live in `*.schema.ts` files.
 */
import * as S from 'effect/Schema'

/** The `properties` map of an option document: option name → any JSON Schema fragment. */
export const PropertiesEntry = S.Record(S.String, S.Unknown)

/** The `requireTestContribution` option entry: its default suffix list and description. */
export const RequireTestContributionEntry = S.StructWithRest(
  S.Struct({
    default: S.optional(S.Array(S.String)),
    description: S.optional(S.String),
  }),
  [S.Record(S.String, S.Unknown)],
)

/** An option document narrowed to the `properties` map the lanes inspect. */
export const OptionDocument = S.StructWithRest(
  S.Struct({
    properties: S.Record(S.String, S.Unknown),
  }),
  [S.Record(S.String, S.Unknown)],
)

/** Decodes a raw JSON string into the option document shape. */
export const decodeOptionDocument = S.decodeUnknownSync(S.fromJsonString(OptionDocument))
