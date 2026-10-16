import { parseSync } from 'oxc-parser'

import { type RefusedForm, refusedForm } from './suppression-directive.js'

/** One refused comment: where it opens (1-based line, 1-based UTF-16 column) and the form it opens with. */
export interface Suppression {
  readonly line: number
  readonly column: number
  readonly form: RefusedForm
}

/**
 * One file's verdict. `parseErrors` lists what the parser refused. A file that does not parse yields
 * no comments to grade, so a non-empty list fails the file on its own: a directive the parser could
 * not reach must not pass ungraded.
 */
export interface SuppressionScan {
  readonly suppressions: readonly Suppression[]
  readonly parseErrors: readonly string[]
}

const positionOf = (sourceText: string, offset: number): { readonly line: number; readonly column: number } => {
  const before = sourceText.slice(0, offset)
  return { line: before.split('\n').length, column: offset - before.lastIndexOf('\n') }
}

/**
 * Every refused comment in `sourceText`. The parser tokenises the source, so a form inside a string,
 * template or regular-expression literal is code, not a comment, and is never read. `filename` selects
 * the dialect by extension (`.ts`, `.tsx`, `.mts`, `.cts`, `.js`, `.mjs`, `.cjs`, `.jsx`).
 */
export const scanSuppressions = (filename: string, sourceText: string): SuppressionScan => {
  const parsed = parseSync(filename, sourceText)
  const suppressions = parsed.comments.flatMap((comment) => {
    const form = refusedForm(comment)
    return form === undefined ? [] : [{ ...positionOf(sourceText, comment.start), form }]
  })
  return { suppressions, parseErrors: [...new Set(parsed.errors.map((error) => error.message))] }
}
