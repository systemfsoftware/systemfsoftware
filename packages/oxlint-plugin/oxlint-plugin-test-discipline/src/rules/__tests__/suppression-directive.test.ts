import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import { type CommentText, refusedForm } from '../suppression-directive.js'

const LINTER_FORMS = [
  'oxlint-disable',
  'oxlint-disable-line',
  'oxlint-disable-next-line',
  'eslint-disable',
  'eslint-disable-line',
  'eslint-disable-next-line',
] as const

const TS_COMMENT_DIRECTIVES = ['@ts-expect-error', '@ts-ignore'] as const

const line = (value: string): CommentText => ({ type: 'Line', value })
const block = (value: string): CommentText => ({ type: 'Block', value })

const joined = (parts: fc.Arbitrary<readonly string[]>): fc.Arbitrary<string> => parts.map((chars) => chars.join(''))
const lineWhitespace = joined(fc.array(fc.constantFrom(' ', '\t')))
const blockWhitespace = joined(fc.array(fc.constantFrom(' ', '\t', '\n', '\r')))
const slashesAndStars = joined(fc.array(fc.constantFrom('/', '*')))
const jsDocLead = joined(fc.array(fc.constantFrom('/', '*'), { minLength: 1 }))
const linterTail = fc.oneof(fc.constant(''), fc.string().map((text) => ` ${text}`))
const proseWord = fc.stringMatching(/^[a-z]{1,12}$/u)
const anyCaseNoCheck = fc
  .array(fc.boolean(), { minLength: 10, maxLength: 10 })
  .map((upper) =>
    'ts-nocheck'.replace(/./gu, (char, index: number) => (upper[index] === true ? char.toUpperCase() : char))
  )

const linterDirective = fc.oneof(
  fc.tuple(lineWhitespace, fc.constantFrom(...LINTER_FORMS), linterTail).map(([lead, form, tail]) => ({
    comment: line(`${lead}${form}${tail}`),
    form,
  })),
  fc.tuple(blockWhitespace, fc.constantFrom(...LINTER_FORMS), linterTail).map(([lead, form, tail]) => ({
    comment: block(`${lead}${form}${tail}`),
    form,
  })),
)

const typeScriptCommentDirective = fc.oneof(
  fc
    .tuple(fc.constantFrom('', '/'), lineWhitespace, fc.constantFrom(...TS_COMMENT_DIRECTIVES), fc.string())
    .map(([slash, lead, form, tail]) => ({ comment: line(`${slash}${lead}${form}${tail}`), form })),
  fc
    .tuple(slashesAndStars, blockWhitespace, fc.constantFrom(...TS_COMMENT_DIRECTIVES), fc.string())
    .map(([marks, lead, form, tail]) => ({ comment: block(`${marks}${lead}${form}${tail}`), form })),
)

const noCheckPragma = fc
  .tuple(
    fc.constantFrom('', '/'),
    lineWhitespace,
    anyCaseNoCheck,
    fc.oneof(fc.constant(''), fc.tuple(fc.constantFrom(' ', '\t', ':'), fc.string()).map(([gap, text]) => gap + text)),
  )
  .map(([slash, lead, name, tail]) => line(`${slash}${lead}@${name}${tail}`))

const ruledDirective = fc.oneof(
  linterDirective,
  typeScriptCommentDirective,
  noCheckPragma.map((comment) => ({ comment, form: '@ts-nocheck' as const })),
)

describe('refusedForm', () => {
  it('∀d_RuledDirective_=form', () => {
    const run = fc.check(fc.property(ruledDirective, ({ comment, form }) => refusedForm(comment) === form))
    expect(run.counterexample).toBeNull()
  })

  it('∀l_LinterFormAfterJsDocLead_⊥', () => {
    const run = fc.check(
      fc.property(
        fc.constantFrom(line, block),
        jsDocLead,
        blockWhitespace,
        fc.constantFrom(...LINTER_FORMS),
        linterTail,
        (kind, marks, lead, form, tail) => refusedForm(kind(`${marks}${lead}${form}${tail}`)) === undefined,
      ),
    )
    expect(run.counterexample).toBeNull()
  })

  it('∀w_ProseBeforeDirective_⊥', () => {
    const run = fc.check(
      fc.property(
        ruledDirective,
        lineWhitespace,
        proseWord,
        ({ comment }, lead, word) =>
          refusedForm({ ...comment, value: `${lead}${word} ${comment.value}` }) === undefined,
      ),
    )
    expect(run.counterexample).toBeNull()
  })

  it('∀n_NoCheckInBlock_⊥', () => {
    const run = fc.check(
      fc.property(noCheckPragma, (comment) => refusedForm(block(comment.value)) === undefined),
    )
    expect(run.counterexample).toBeNull()
  })

  it.each([
    [line(' oxlint-disable'), 'oxlint-disable'],
    [block(' oxlint-disable no-console, eqeqeq '), 'oxlint-disable'],
    [line(' oxlint-disable-line no-console'), 'oxlint-disable-line'],
    [line(' oxlint-disable-next-line no-console'), 'oxlint-disable-next-line'],
    [block(' eslint-disable '), 'eslint-disable'],
    [block(' eslint-disable no-console -- legacy '), 'eslint-disable'],
    [line(' eslint-disable-line'), 'eslint-disable-line'],
    [line(' eslint-disable-next-line no-console'), 'eslint-disable-next-line'],
    [block('\n  oxlint-disable\n'), 'oxlint-disable'],
    [line(' @ts-expect-error'), '@ts-expect-error'],
    [line('@ts-expect-error'), '@ts-expect-error'],
    [line(' @ts-expect-error -- the fixture is ill-typed on purpose'), '@ts-expect-error'],
    [line('/ @ts-expect-error'), '@ts-expect-error'],
    [block('* @ts-expect-error '), '@ts-expect-error'],
    [line(' @ts-ignore'), '@ts-ignore'],
    [line(' @ts-ignore -- the fixture is ill-typed on purpose'), '@ts-ignore'],
    [line('/ @ts-ignore'), '@ts-ignore'],
    [block('* @ts-ignore '), '@ts-ignore'],
    [block('/ @ts-ignore '), '@ts-ignore'],
    [line(' @ts-nocheck'), '@ts-nocheck'],
    [line(' @ts-nocheck: generated file'), '@ts-nocheck'],
    [line('/ @ts-nocheck'), '@ts-nocheck'],
    [line(' @TS-NOCHECK'), '@ts-nocheck'],
  ])('refuses %j as %s', (comment, form) => {
    expect(refusedForm(comment)).toBe(form)
  })

  it.each([
    block('*\n * eslint-disable-next-line is banned; delete the code instead.\n '),
    block('* eslint-disable is banned here '),
    line('/ eslint-disable'),
    line(' do not add oxlint-disable here'),
    line(' see eslint-disable-next-line in the docs'),
    line(' TODO: remove @ts-expect-error once typed'),
    line(' ESLINT-DISABLE'),
    line(' @TS-IGNORE'),
    line('* @ts-ignore'),
    line('// @ts-ignore'),
    block('*\n * @ts-expect-error\n '),
    block(' @ts-nocheck '),
    line(' @ts-nocheck-later'),
    line(' do not reach for @ts-ignore or @ts-nocheck here'),
    line(' eslint-enable'),
    line(' oxlint-enable no-console'),
    line(''),
  ])('passes %j', (comment) => {
    expect(refusedForm(comment)).toBeUndefined()
  })
})
