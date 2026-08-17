/**
 * Inline replacement for `ts.parseConfigFileTextToJson()` removed in TypeScript 7.
 *
 * No imports from `typescript` — delegates to `@std/jsonc`, which handles comments,
 * trailing commas, and string-aware escaping the way `tsc` does. The parsed value is
 * then shape-checked with an Effect Schema type guard, so consumers receive a config
 * that is already narrowed to the fields this package rewrites.
 */

import { parse } from '@std/jsonc'
import { Result, Schema as S } from 'effect'

import { errorToString } from '@stryker-mutator/util'

import { type TSConfig, TsConfigSchema } from './parse-config.schema.js'
import { TsConfigParseError } from './parse-config.schema.js'

export type { TSConfig } from './parse-config.schema.js'
export { TsConfigParseError } from './parse-config.schema.js'

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
        reason: errorToString(error),
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
