/**
 * Inline replacement for `ts.parseConfigFileTextToJson()` removed in TypeScript 7.
 *
 * No imports from `typescript` — delegates to `@std/jsonc`, which handles comments,
 * trailing commas, and string-aware escaping the way `tsc` does. The parsed value is
 * then shape-checked with an Effect Schema type guard, so consumers receive a config
 * that is already narrowed to the fields this package rewrites.
 */

import { parse } from '@std/jsonc'
import { Data, Result, Schema as S } from 'effect'

/**
 * Error returned when a tsconfig file fails to parse, or parses to a value that does
 * not match the shape this package consumes.
 */
export class TsConfigParseError extends Data.TaggedError('TsConfigParseError')<{
  readonly file: string
  readonly reason: string
}> {}

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
const TsConfigSchema = S.StructWithRest(
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

/**
 * Parses a JSONC string into a typed tsconfig.
 *
 * @param fileName — used only for error message context (mirrors upstream behaviour).
 * @param jsonText — the raw tsconfig text, possibly containing comments.
 * @returns `Result.success(config)` when the text parses and matches the shape,
 *          `Result.failure(TsConfigParseError)` on a parse failure or a shape mismatch.
 */
export function parseTsConfig(
  fileName: string,
  jsonText: string,
): Result.Result<TSConfig, TsConfigParseError> {
  let parsed: unknown
  try {
    // `@std/jsonc` rejects a leading BOM (its whitespace set is ` \t\r\n`) but
    // `tsc` accepts one, so strip it before parsing.
    parsed = parse(jsonText.replace(/^\uFEFF/, ''))
  } catch (error) {
    return Result.fail(
      new TsConfigParseError({
        file: fileName,
        reason: error instanceof Error ? error.message : String(error),
      }),
    )
  }
  if (S.is(TsConfigSchema)(parsed)) {
    // A type guard, not a decode: it returns the same object reference with the key
    // order untouched, so the preprocessor can mutate the config in place and write
    // it back without reordering or dropping keys.
    return Result.succeed(parsed)
  }
  return Result.fail(
    new TsConfigParseError({
      file: fileName,
      reason: `parsed to ${JSON.stringify(parsed)}, which does not match the tsconfig shape this package consumes`,
    }),
  )
}
