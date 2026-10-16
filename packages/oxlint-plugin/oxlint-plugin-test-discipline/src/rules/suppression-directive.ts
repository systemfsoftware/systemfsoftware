export const REFUSED_FORMS = [
  'oxlint-disable-next-line',
  'oxlint-disable-line',
  'oxlint-disable',
  'eslint-disable-next-line',
  'eslint-disable-line',
  'eslint-disable',
  '@ts-expect-error',
  '@ts-ignore',
  '@ts-nocheck',
] as const

export type RefusedForm = (typeof REFUSED_FORMS)[number]

export interface CommentText {
  readonly type: 'Line' | 'Block'
  readonly value: string
}

const LINTER_FORMS = REFUSED_FORMS.filter((form) => !form.startsWith('@'))

const LEADING_WHITESPACE = /^\s*/u

const NEVER = /(?!)/u

/**
 * TypeScript's own recognition, rewritten over `value` (the text after `//` or `/*`). In TypeScript 6.0.3:
 * - `@ts-expect-error` / `@ts-ignore`: src/compiler/scanner.ts `commentDirectiveRegExSingleLine =
 *   /^\/\/\/?\s*@(ts-expect-error|ts-ignore)/` and `commentDirectiveRegExMultiLine =
 *   /^(?:\/|\*)*\s*@(ts-expect-error|ts-ignore)/` (lib/_tsc.js:8202-8203), matched case-sensitively and
 *   with no end anchor.
 * - `@ts-nocheck`: src/compiler/parser.ts `singleLinePragmaRegEx =
 *   /^\/\/\/?\s*@([^\s:]+)((?:[^\S\r\n]|:).*)?$/m` (lib/_tsc.js:36318); the pragma is registered
 *   `kind: SingleLine` only (lib/_tsc.js:3907-3908), so a block comment never carries it, and its name is
 *   lower-cased before lookup (lib/_tsc.js:36368), so any casing counts. TypeScript reads it only from the
 *   comments before the first token; it is refused wherever it appears, failing closed.
 */
const TYPESCRIPT_DIRECTIVES: readonly (readonly [RefusedForm, Readonly<Record<CommentText['type'], RegExp>>])[] = [
  ['@ts-expect-error', { Line: /^\/?\s*@ts-expect-error/u, Block: /^[/*]*\s*@ts-expect-error/u }],
  ['@ts-ignore', { Line: /^\/?\s*@ts-ignore/u, Block: /^[/*]*\s*@ts-ignore/u }],
  ['@ts-nocheck', { Line: /^\/?\s*@ts-nocheck(?:[^\S\r\n]|:|$)/iu, Block: NEVER }],
]

const typeScriptForm = (comment: CommentText): RefusedForm | undefined =>
  TYPESCRIPT_DIRECTIVES.find(([, recognisers]) => recognisers[comment.type].test(comment.value))?.[0]

export const refusedForm = (comment: CommentText): RefusedForm | undefined => {
  const body = comment.value.replace(LEADING_WHITESPACE, '')
  return LINTER_FORMS.find((form) => body.startsWith(form)) ?? typeScriptForm(comment)
}
