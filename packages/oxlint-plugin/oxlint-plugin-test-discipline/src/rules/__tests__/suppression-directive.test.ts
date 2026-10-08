import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import { refusedForm } from '../suppression-directive.js'

const RULED_FORMS = [
  'oxlint-disable',
  'oxlint-disable-line',
  'oxlint-disable-next-line',
  'eslint-disable',
  'eslint-disable-line',
  'eslint-disable-next-line',
  '@ts-expect-error',
] as const

const ruledForm = fc.constantFrom(...RULED_FORMS)
const lead = fc.array(fc.constantFrom(' ', '\t', '\n', '*', '/')).map((chars) => chars.join(''))
const tail = fc.oneof(fc.constant(''), fc.string().map((text) => ` ${text}`))
const proseWord = fc.stringMatching(/^[a-z]{1,12}$/u)

describe('refusedForm', () => {
  it('∀f_LeadingDirective_=f', () => {
    const run = fc.check(
      fc.property(ruledForm, lead, tail, (form, before, after) => refusedForm(`${before}${form}${after}`) === form),
    )
    expect(run.counterexample).toBeNull()
  })

  it('∀w_ProseBeforeDirective_⊥', () => {
    const run = fc.check(
      fc.property(
        lead,
        proseWord,
        ruledForm,
        tail,
        (before, word, form, after) => refusedForm(`${before}${word} ${form}${after}`) === undefined,
      ),
    )
    expect(run.counterexample).toBeNull()
  })

  it.each([
    [' oxlint-disable', 'oxlint-disable'],
    [' oxlint-disable no-console, eqeqeq ', 'oxlint-disable'],
    [' oxlint-disable-line no-console', 'oxlint-disable-line'],
    [' oxlint-disable-next-line no-console', 'oxlint-disable-next-line'],
    [' eslint-disable', 'eslint-disable'],
    [' eslint-disable no-console -- legacy ', 'eslint-disable'],
    [' eslint-disable-line', 'eslint-disable-line'],
    [' eslint-disable-next-line no-console', 'eslint-disable-next-line'],
    ['\n  oxlint-disable\n', 'oxlint-disable'],
    [' @ts-expect-error', '@ts-expect-error'],
    [' @ts-expect-error -- the fixture is ill-typed on purpose', '@ts-expect-error'],
    ['/ @ts-expect-error', '@ts-expect-error'],
    ['* @ts-expect-error ', '@ts-expect-error'],
  ])('refuses the comment %j as %s', (commentValue, form) => {
    expect(refusedForm(commentValue)).toBe(form)
  })

  it.each([
    ' do not add oxlint-disable here',
    ' see eslint-disable-next-line in the docs',
    ' TODO: remove @ts-expect-error once typed',
    ' ESLINT-DISABLE',
    ' @ts-ignore',
    ' eslint-enable',
    ' oxlint-enable no-console',
    '',
  ])('passes the comment %j', (commentValue) => {
    expect(refusedForm(commentValue)).toBeUndefined()
  })
})
