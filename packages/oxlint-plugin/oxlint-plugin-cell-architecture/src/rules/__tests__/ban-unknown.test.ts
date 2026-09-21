import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { ACTUAL, EXPECTED, FIX, NAME } from '../ban-unknown.config.js'
import { banUnknown } from '../ban-unknown.js'

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

const banned = {
  messageId: 'banned' as const,
  data: {
    name: NAME,
    expected: EXPECTED,
    actual: ACTUAL,
    fix: FIX,
  },
}

ruleTester.run('ban-unknown', banUnknown, {
  valid: [
    {
      name: 'Should_Allow_When_GenericDefaultIsUnknown',
      code: 'export interface Box<A = unknown> { readonly value: A }',
    },
    {
      name: 'Should_Allow_When_TypeAliasDefaultIsUnknown',
      code: 'export type Alias<A = unknown> = { readonly value: A }',
    },
    {
      name: 'Should_Allow_When_VarianceDefaultIsUnknown',
      code:
        'export interface Channel<out A = unknown, in Input = unknown> { readonly value: A; read(input: Input): void }',
    },
    {
      name: 'Should_Allow_When_ConstrainedDefaultIsUnknown',
      code: 'export interface Bounded<A extends string = unknown> { readonly value: A }',
    },
    {
      name: 'Should_Allow_When_TypePredicateParameterIsUnknown',
      code: 'export const isFoo = (u: unknown): u is string => typeof u === "string"',
    },
    {
      name: 'Should_Allow_When_AssertsPredicateParameterIsUnknown',
      code:
        'export function assertFoo(u: unknown): asserts u is string { if (typeof u !== "string") throw new Error("no") }',
    },
    {
      name: 'Should_Allow_When_FunctionTypePredicateParameterIsUnknown',
      code: 'export type Guard = (u: unknown) => u is number',
    },
    {
      name: 'Should_Allow_When_MethodSignaturePredicateParameterIsUnknown',
      code: 'export interface Checker { isFoo(u: unknown): u is string }',
    },
    {
      name: 'Should_Allow_When_CatchBindingIsUnknown',
      code: 'export function read(): string { try { return "ok" } catch (error: unknown) { return "fail" } }',
    },
    {
      name: 'Should_Allow_When_GenericDefaultAndPredicateShareASignature',
      code: 'export const isQueue = <A = unknown>(u: unknown): u is A => true',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_When_FieldIsUnknown',
      code: 'export interface Field { readonly value: unknown }',
      errors: [banned],
    },
    {
      name: 'Should_Report_When_ParameterIsUnknown',
      code: 'export function take(value: unknown): void { return }',
      errors: [banned],
    },
    {
      name: 'Should_Report_When_ReturnIsUnknown',
      code: 'export function give(): unknown { return 1 }',
      errors: [banned],
    },
    {
      name: 'Should_Report_When_ConstraintIsUnknown',
      code: 'export interface Loose<A extends unknown> { readonly value: A }',
      errors: [banned],
    },
    {
      name: 'Should_Report_When_ConstraintIsUnknownBesideADefault',
      code: 'export interface Mixed<A extends unknown = unknown> { readonly value: A }',
      errors: [banned],
    },
    {
      name: 'Should_Report_When_AssertionIsUnknown',
      code: 'export const cast = (value: string): string => value as unknown as string',
      errors: [banned],
    },
    {
      name: 'Should_Report_When_ArrayIsUnknown',
      code: 'export type Items = unknown[]',
      errors: [banned],
    },
    {
      name: 'Should_Report_When_GenericArgumentIsUnknown',
      code: 'export type Boxed = ReadonlyArray<unknown>',
      errors: [banned],
    },
    {
      name: 'Should_Report_When_UnionContainsUnknown',
      code: 'export type Mixed = string | unknown',
      errors: [banned],
    },
    {
      name: 'Should_Report_When_PredicateBodyContainsUnknown',
      code: `
        export function isFoo(u: unknown): u is string {
          const leaked: unknown = u
          return typeof leaked === "string"
        }
      `,
      errors: [banned],
    },
    {
      name: 'Should_Report_When_CatchBodyContainsUnknown',
      code: `
        export function read(): string {
          try { return "ok" } catch (error: unknown) {
            const leaked: unknown = error
            return "fail"
          }
        }
      `,
      errors: [banned],
    },
    {
      name: 'Should_Report_When_GenericDefaultDisabled',
      code: 'export interface Box<A = unknown> { readonly value: A }',
      options: [{ allowGenericDefault: false }],
      errors: [banned],
    },
    {
      name: 'Should_Report_When_TypePredicateDisabled',
      code: 'export const isFoo = (u: unknown): u is string => typeof u === "string"',
      options: [{ allowTypePredicate: false }],
      errors: [banned],
    },
    {
      name: 'Should_Report_When_CatchClauseDisabled',
      code: 'export function read(): string { try { return "ok" } catch (error: unknown) { return "fail" } }',
      options: [{ allowCatchClause: false }],
      errors: [banned],
    },
  ],
})
