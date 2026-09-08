import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { noLongPositionalSignature } from '../no-long-positional-signature.js'

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

const EXPECTED = 'an exported function with at most three positional parameters'
const ACTUAL =
  'an exported function with four or more positional parameters: at four positionals the call site is unreadable and every addition breaks'
const FIX = 'take an options object instead of four or more positionals'

const longSignature = (name: string) => ({
  messageId: 'longSignature' as const,
  data: {
    name: `'${name}'`,
    expected: EXPECTED,
    actual: ACTUAL,
    fix: FIX,
  },
})

ruleTester.run('no-long-positional-signature', noLongPositionalSignature, {
  valid: [
    {
      name: 'Should_Pass_When_ExportedFunctionHasThreeParameters',
      code: `export function foo(a: string, b: string, c: string) { return a }`,
    },
    {
      name: 'Should_Pass_When_ExportedArrowHasThreeParameters',
      code: `export const foo = (a: string, b: string, c: string) => a`,
    },
    {
      name: 'Should_Pass_When_UnexportedFunctionHasFourParameters',
      code: `function foo(a: string, b: string, c: string, d: string) { return a }`,
    },
    {
      name: 'Should_Pass_When_UnexportedArrowHasFourParameters',
      code: `const foo = (a: string, b: string, c: string, d: string) => a`,
    },
    {
      name: 'Should_Pass_When_ExportedFunctionHasNoParameters',
      code: `export function foo() { return 1 }`,
    },
    {
      name: 'Should_Pass_When_ExportedConstIsNotAFunction',
      code: `export const value = 1`,
    },
    {
      name: 'Should_Pass_When_ExportedConstIsAFunctionExpression',
      code: `export const foo = function (a: string, b: string, c: string, d: string) { return a }`,
    },
  ],
  invalid: [
    {
      name: 'Should_Report_When_ExportedFunctionHasFourParameters',
      code: `export function foo(a: string, b: string, c: string, d: string) { return a }`,
      errors: [longSignature('foo')],
    },
    {
      name: 'Should_Report_When_ExportedArrowHasFourParameters',
      code: `export const foo = (a: string, b: string, c: string, d: string) => a`,
      errors: [longSignature('foo')],
    },
    {
      name: 'Should_Report_When_ExportedArrowCountsARestParameterAsOne',
      code: `export const foo = (a: string, b: string, c: string, ...rest: string[]) => rest.length`,
      errors: [longSignature('foo')],
    },
    {
      name: 'Should_Report_When_ExportedFunctionCountsOptionalParameters',
      code: `export function foo(a?: string, b?: string, c?: string, d?: string) { return a }`,
      errors: [longSignature('foo')],
    },
    {
      name: 'Should_Report_When_DefaultExportedFunctionHasFourParameters',
      code: `export default function foo(a: string, b: string, c: string, d: string) { return a }`,
      errors: [longSignature('foo')],
    },
  ],
})
