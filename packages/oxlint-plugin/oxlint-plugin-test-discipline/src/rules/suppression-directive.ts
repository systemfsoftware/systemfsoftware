/**
 * The comment openings `no-inline-suppression` refuses. Within each family the longer form comes
 * first, so a `-next-line` or `-line` directive is named as itself, not as the bare form it starts with.
 */
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

const DIRECTIVE_LEAD = /[\s*/]*/u

/**
 * The refused form a comment opens with, or `undefined` for any other comment. `commentValue` is the
 * comment's text between its delimiters — what follows `//`, or what sits between the block delimiters.
 * A form mentioned later in the comment is prose, not a directive, and is not refused.
 */
export const refusedForm = (commentValue: string): RefusedForm | undefined => {
  const body = commentValue.replace(DIRECTIVE_LEAD, '')
  return REFUSED_FORMS.find((form) => body.startsWith(form))
}
