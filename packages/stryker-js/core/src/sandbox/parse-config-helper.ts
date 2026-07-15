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
  let result = ''
  let inString = false
  let stringChar: string | null = null
  let i = 0
  while (i < json.length) {
    const ch = json[i]
    const next = json[i + 1]

    // Track string boundaries
    if (inString) {
      result += ch
      if (ch === '\\' && stringChar) {
        i += 2 // skip escaped char
        continue
      }
      if (ch === stringChar) {
        inString = false
        stringChar = null
      }
      i++
      continue
    }

    if (ch === '"' || ch === "'") {
      inString = true
      stringChar = ch
      result += ch
      i++
      continue
    }

    // Line comment
    if (ch === '/' && next === '/') {
      while (i < json.length && json[i] !== '\n') {
        i++
      }
      continue
    }

    // Block comment
    if (ch === '/' && next === '*') {
      i += 2
      while (i < json.length) {
        if (json[i] === '*' && json[i + 1] === '/') {
          i += 2
          break
        }
        i++
      }
      continue
    }

    result += ch
    i++
  }
  return result
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
