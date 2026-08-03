/**
 * Inline replacement for `ts.parseConfigFileTextToJson()` removed in TypeScript 7.
 *
 * No imports from `typescript` — delegates to `@std/jsonc`, which handles comments,
 * trailing commas, and string-aware escaping the way `tsc` does.
 */

import { parse } from '@std/jsonc'

export interface ParsedConfig {
  config?: unknown
  error?: Error
}

/**
 * Parses a JSON string (with comments) into a configuration object.
 *
 * @param fileName — used only for error message context (mirrors upstream behaviour).
 * @param jsonText — the raw JSON text, possibly containing comments.
 * @returns `{ config }` on success, `{ error }` on parse failure.
 */
export function parseConfigFileTextToJson(fileName: string, jsonText: string): ParsedConfig {
  try {
    // `@std/jsonc` rejects a leading BOM (its whitespace set is ` \t\r\n`) but
    // `tsc` accepts one, so strip it before parsing.
    const withoutBom = jsonText.replace(/^\uFEFF/, '')
    return { config: parse(withoutBom) }
  } catch (error) {
    return { error: error as Error }
  }
}
