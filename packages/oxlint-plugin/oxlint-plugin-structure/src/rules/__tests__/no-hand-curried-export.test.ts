import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { noHandCurriedExport } from '../no-hand-curried-export.js'

RuleTester.it = vitest.it
RuleTester.itOnly = vitest.it.only
RuleTester.describe = vitest.describe

const ruleTester = new RuleTester({
  languageOptions: {
    parserOptions: {
      lang: 'ts',
    },
  },
})

const EXPECTED = 'a dual-shaped export callable data-first and data-last via Function.dual'
const ACTUAL = 'a hand-curried export returning another arrow function, which locks out the direct data-first caller'
const FIX = 'use Function.dual to expose both the data-first and data-last call shapes'

const curried = (name: string) => ({
  messageId: 'handCurriedExport' as const,
  data: {
    name: `'${name}'`,
    expected: EXPECTED,
    actual: ACTUAL,
    fix: FIX,
  },
})

ruleTester.run('no-hand-curried-export', noHandCurriedExport, {
  valid: [
    {
      name: 'Should_Pass_When_ExportedArrowIsNotCurried',
      code: `export const add = (a: number, b: number): number => a + b`,
    },
    {
      name: 'Should_Pass_When_ExportedConstIsNotAnArrow',
      code: `export const value = 42`,
    },
    {
      name: 'Should_Pass_When_OuterArrowIsAGenericServiceTagFactory',
      code: `export const makeTag = <Self>(tag: string) => (value: string) => ({ tag, value })`,
    },
    {
      name: 'Should_Pass_When_CurriedArrowIsNotExported',
      code: `const curried = (x: number) => (y: number) => x + y`,
    },
    {
      name: 'Should_Pass_When_InnerArrowTakesNoParameters',
      code: `export const apply = (x: number) => () => x`,
    },
    {
      name: 'Should_Pass_When_OuterArrowTakesNoParameters',
      code: `export const make = () => (y: number) => y`,
    },
    {
      name: 'Should_Pass_When_BlockBodyReturnsANonArrow',
      code: `export const inc = (x: number) => { return x + 1 }`,
    },
    {
      name: 'Should_Pass_When_ExportedFunctionDeclarationReturnsAnArrow',
      code: `export function make(x: number) { return (y: number) => x + y }`,
    },
  ],
  invalid: [
    {
      name: 'Should_Report_When_ExportedArrowReturnsAnArrowExpression',
      code: `export const curried = (x: number) => (y: number) => x + y`,
      errors: [curried('curried')],
    },
    {
      name: 'Should_Report_When_ExportedArrowReturnsAnArrowFromABlockBody',
      code: `export const curried = (x: number) => { return (y: number) => x + y }`,
      errors: [curried('curried')],
    },
    {
      name: 'Should_Report_When_CurriedDeclaratorSharesItsDeclaration',
      code: `export const untouched = 1, curried = (x: number) => (y: number) => x`,
      errors: [curried('curried')],
    },
  ],
})
