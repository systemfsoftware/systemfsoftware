/**
 * Inline replacement for `ts.parseConfigFileTextToJson()` removed in TypeScript 7.
 * Also exports `stripJsonComments` which the removed API implicitly called.
 *
 * No imports from `typescript` — pure regex + `JSON.parse`.
 */

/**
 * Strips block (slash-star) and line (slash-slash) comments from a JSON string.
 */
export function stripJsonComments(json: string): string {
  return json
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
}

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
    const stripped = stripJsonComments(jsonText)
    return { config: JSON.parse(stripped) }
  } catch (error) {
    return { error: error as Error }
  }
}
