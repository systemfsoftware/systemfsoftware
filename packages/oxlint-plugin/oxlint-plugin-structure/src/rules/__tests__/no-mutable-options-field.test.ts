import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { noMutableOptionsField } from '../no-mutable-options-field.js'

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

const EXPECTED = 'readonly fields on an Options/Spec/Config object'
const ACTUAL =
  'a mutable field on an Options/Spec/Config object: options-object fields are readonly; mutability escapes the author'
const FIX = 'add the readonly modifier to the field'

const mutable = (name: string) => ({
  messageId: 'mutableOptionsField' as const,
  data: {
    name: `'${name}'`,
    expected: EXPECTED,
    actual: ACTUAL,
    fix: FIX,
  },
})

ruleTester.run('no-mutable-options-field', noMutableOptionsField, {
  valid: [
    {
      name: 'Should_Pass_When_OptionsInterfaceFieldsAreReadonly',
      code: `export interface FooOptions { readonly dir?: string }`,
    },
    {
      name: 'Should_Pass_When_OptionsTypeLiteralFieldsAreReadonly',
      code: `export type FooOptions = { readonly dir?: string }`,
    },
    {
      name: 'Should_Pass_When_ConfigInterfaceFieldsAreReadonly',
      code: `export interface FooConfig { readonly host: string; readonly port: number }`,
    },
    {
      name: 'Should_Pass_When_SpecTypeFieldsAreReadonly',
      code: `export type BarSpec = { readonly input: string }`,
    },
    {
      name: 'Should_Pass_When_NonOptionsInterfaceMayStayMutable',
      code: `export interface Settings { dir?: string }`,
    },
    {
      name: 'Should_Pass_When_UnexportedOptionsInterfaceMayStayMutable',
      code: `interface FooOptions { dir?: string }`,
    },
    {
      name: 'Should_Pass_When_UnexportedOptionsTypeMayStayMutable',
      code: `type FooOptions = { dir?: string }`,
    },
    {
      name: 'Should_Pass_When_OptionsInterfaceHoldsAMethodSignature',
      code: `export interface FooOptions { run(): void }`,
    },
    {
      name: 'Should_Pass_When_OptionsTypeAliasIsNotADirectLiteral',
      code: `export type FooOptions = { readonly a: string } & { readonly b: string }`,
    },
  ],
  invalid: [
    {
      name: 'Should_Report_When_OptionsInterfaceFieldIsMutable',
      code: `export interface FooOptions { dir?: string }`,
      errors: [mutable('FooOptions.dir')],
    },
    {
      name: 'Should_Report_When_ConfigTypeLiteralFieldIsMutable',
      code: `export type FooConfig = { host: string }`,
      errors: [mutable('FooConfig.host')],
    },
    {
      name: 'Should_Report_When_SpecTypeLiteralMixesReadonlyAndMutable',
      code: `export type BarSpec = { readonly ok: string; bad: number }`,
      errors: [mutable('BarSpec.bad')],
    },
    {
      name: 'Should_Report_When_OptionsInterfaceHasTwoMutableFields',
      code: `export interface FooOptions { a: string; b: number }`,
      errors: [mutable('FooOptions.a'), mutable('FooOptions.b')],
    },
  ],
})
