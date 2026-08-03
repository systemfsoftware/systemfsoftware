import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { middlewareSingleMiddlewareExport } from '../middleware-single-middleware-export.js'

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

const tooManyData = (actual: string) => ({
  name: '*.middleware.ts',
  expected: 'exactly one function export — the middleware itself',
  actual: `${actual} function exports`,
  fix: 'split each additional middleware into its own *.middleware.ts file',
})

const disallowedData = (name: string) => ({
  name,
  expected: 'only the middleware function, its attached Context.Tag, and types',
  actual: 'exported value',
  fix: 'move constants and helpers out of the middleware file; a second middleware is a separate concern',
})

ruleTester.run('middleware-single-middleware-export', middlewareSingleMiddlewareExport, {
  valid: [
    {
      name: 'Should_Pass_When_SingleArrowExport_InMiddleware',
      code: `export const attachSession = () => {}`,
      filename: 'attach-session.middleware.ts',
    },
    {
      name: 'Should_Pass_When_SingleFunctionExport_InMiddleware',
      code: `export function attachSession() { return null }`,
      filename: 'attach-session.middleware.ts',
    },
    {
      name: 'Should_Pass_When_SingleFunctionExpressionExport_InMiddleware',
      code: `export const attachSession = function() { return null }`,
      filename: 'attach-session.middleware.ts',
    },
    {
      name: 'Should_Pass_When_SingleDefaultArrowExport_InMiddleware',
      code: `export default () => {}`,
      filename: 'attach-session.middleware.ts',
    },
    {
      name: 'Should_Pass_When_SingleDefaultAnonymousFunctionExport_InMiddleware',
      code: `export default function() {}`,
      filename: 'attach-session.middleware.ts',
    },
    {
      name: 'Should_Pass_When_DefaultIdentifierOfLocalArrow_InMiddleware',
      code: `const m = () => {}; export default m`,
      filename: 'attach-session.middleware.ts',
    },
    {
      name: 'Should_Pass_When_LocalFunctionDeclarationSpecifier_InMiddleware',
      code: `function attachSession() {}; export { attachSession }`,
      filename: 'attach-session.middleware.ts',
    },
    {
      name: 'Should_Pass_When_LocalFunctionExpressionSpecifier_InMiddleware',
      code: `const attachSession = function() {}; export { attachSession }`,
      filename: 'attach-session.middleware.ts',
    },
    {
      name: 'Should_Pass_When_SingleMiddleware_WithAttachedFactTag_AndTypes',
      code:
        `export class SessionFact extends Context.Tag('SessionFact')<SessionFact, { readonly user: string }>() {} export type AttachOptions = { readonly force: boolean }; export interface AttachMeta { readonly requestId: string }; export const attachSession = () => {}`,
      filename: 'attach-session.middleware.ts',
    },
    {
      name: 'Should_Pass_When_SingleMiddleware_WithOnlyAttachedFactTag',
      code:
        `export class SessionFact extends Context.Tag('SessionFact')<SessionFact, { readonly user: string }>() {} export const attachSession = () => {}`,
      filename: 'attach-session.middleware.ts',
    },
    {
      name: 'Should_Pass_When_NonMiddlewareFile_HasManyFunctionExports',
      code:
        `export function a() {} export function b() {} export function c() {} export function d() {} export function e() {}`,
      filename: 'attach-session.handler.ts',
    },
    {
      name: 'Should_Pass_When_SingleMiddleware_PlusTypeReExport',
      code: `export const attachSession = () => {}; export type { Foo } from './types.js'`,
      filename: 'attach-session.middleware.ts',
    },
    {
      name: 'Should_Pass_When_NonMiddlewareFile_HasNoFunctionExports',
      code: `export const x = 1; export const y = 2`,
      filename: 'attach-session.executor.ts',
    },
    {
      name: 'Should_Pass_When_LocalTagClassSpecifierReExport_InMiddleware',
      code:
        `class SessionFact extends Context.Tag('SessionFact')<SessionFact, { readonly user: string }>() {}; export { SessionFact }; export const attachSession = () => {}`,
      filename: 'attach-session.middleware.ts',
    },
    {
      name: 'Should_Pass_When_InterfaceDeclaration_InMiddleware',
      code: `export interface AttachMeta { readonly requestId: string }; export const attachSession = () => {}`,
      filename: 'attach-session.middleware.ts',
    },
    {
      name: 'Should_Pass_When_TypeStarReExport_InMiddleware',
      code: `export const attachSession = () => {}; export type * from './types.js'`,
      filename: 'attach-session.middleware.ts',
    },
    {
      name: 'Should_Pass_When_InlineTypeSpecifierReExport_InMiddleware',
      code: `export const attachSession = () => {}; export { type Foo } from './types.js'`,
      filename: 'attach-session.middleware.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_TwoArrowExports',
      code: `export const attachSession = () => {}; export const helper = () => {}`,
      filename: 'attach-session.middleware.ts',
      errors: [{ messageId: 'tooManyFunctionExports', data: tooManyData('2') }],
    },
    {
      name: 'Should_Report_ArrowAndFunctionDeclaration',
      code: `export const attachSession = () => {}; export function helper() {}`,
      filename: 'attach-session.middleware.ts',
      errors: [{ messageId: 'tooManyFunctionExports', data: tooManyData('2') }],
    },
    {
      name: 'Should_Report_ThreeArrowExports',
      code: `export const a = () => {}; export const b = () => {}; export const attachSession = () => {}`,
      filename: 'attach-session.middleware.ts',
      errors: [{ messageId: 'tooManyFunctionExports', data: tooManyData('3') }],
    },
    {
      name: 'Should_Report_FunctionDeclarationAndSpecifierHelpers',
      code:
        `export function attachSession() {}; const helperA = () => {}; const helperB = () => {}; export { helperA, helperB }`,
      filename: 'attach-session.middleware.ts',
      errors: [{ messageId: 'tooManyFunctionExports', data: tooManyData('3') }],
    },
    {
      name: 'Should_Report_ZeroFunctionExports_When_OnlyTagAndTypes',
      code:
        `export class SessionFact extends Context.Tag('SessionFact')<SessionFact, { readonly user: string }>() {} export type AttachOptions = { readonly force: boolean }`,
      filename: 'attach-session.middleware.ts',
      errors: [{ messageId: 'tooManyFunctionExports', data: tooManyData('0') }],
    },
    {
      name: 'Should_Report_ZeroFunctionExports_When_NoExports',
      code: `const x = 1`,
      filename: 'attach-session.middleware.ts',
      errors: [{ messageId: 'tooManyFunctionExports', data: tooManyData('0') }],
    },
    {
      name: 'Should_Report_ExportedConstantDeclaration',
      code: `export const FOO = 1; export const attachSession = () => {}`,
      filename: 'attach-session.middleware.ts',
      errors: [{ messageId: 'disallowedExport', data: disallowedData('FOO') }],
    },
    {
      name: 'Should_Report_ExportedConstantSpecifier',
      code: `const foo = 1; export { foo }; export const attachSession = () => {}`,
      filename: 'attach-session.middleware.ts',
      errors: [{ messageId: 'disallowedExport', data: disallowedData('foo') }],
    },
    {
      name: 'Should_Report_ExportedNonTagClass',
      code: `export class NotATag {}; export const attachSession = () => {}`,
      filename: 'attach-session.middleware.ts',
      errors: [{ messageId: 'disallowedExport', data: disallowedData('NotATag') }],
    },
    {
      name: 'Should_Report_DefaultNonFunctionIdentifier',
      code: `const x = 1; export default x`,
      filename: 'attach-session.middleware.ts',
      errors: [
        { messageId: 'tooManyFunctionExports', data: tooManyData('0') },
        { messageId: 'disallowedExport', data: disallowedData('default') },
      ],
    },
    {
      name: 'Should_Report_ExportAllFrom_AsDisallowed',
      code: `export const attachSession = () => {}; export * from './sibling.js'`,
      filename: 'attach-session.middleware.ts',
      errors: [{
        messageId: 'disallowedExport',
        data: {
          name: '*',
          expected: 'only the middleware function, its attached Context.Tag, and types',
          actual: 'exported value',
          fix: 'move constants and helpers out of the middleware file; a second middleware is a separate concern',
        },
      }],
    },
    {
      name: 'Should_Report_CrossModuleSpecifierReExport_AsTooManyFunctionExports',
      code: `export const attachSession = () => {}; export { helper } from './helpers.js'`,
      filename: 'attach-session.middleware.ts',
      errors: [{
        messageId: 'tooManyFunctionExports',
        data: {
          name: '*.middleware.ts',
          expected: 'exactly one function export — the middleware itself',
          actual: '2 function exports',
          fix: 'split each additional middleware into its own *.middleware.ts file',
        },
      }],
    },
    {
      name: 'Should_Report_TwoMiddlewares_AlongsideAttachedFactTag',
      code:
        `export class SessionFact extends Context.Tag('SessionFact')<SessionFact, { readonly user: string }>() {} export const attachSession = () => {}; export const refreshSession = () => {}`,
      filename: 'attach-session.middleware.ts',
      errors: [{ messageId: 'tooManyFunctionExports', data: tooManyData('2') }],
    },
    {
      name: 'Should_Report_ClassExtendsWrongContextObject_InMiddleware',
      code: `export class NotATag extends Foo.Tag('Foo')<Foo, {}>() {}; export const attachSession = () => {}`,
      filename: 'attach-session.middleware.ts',
      errors: [{ messageId: 'disallowedExport', data: disallowedData('NotATag') }],
    },
    {
      name: 'Should_Report_ClassExtendsWrongTagProperty_InMiddleware',
      code: `export class NotATag extends Context.Foo('Foo')<Foo, {}>() {}; export const attachSession = () => {}`,
      filename: 'attach-session.middleware.ts',
      errors: [{ messageId: 'disallowedExport', data: disallowedData('NotATag') }],
    },
    {
      name: 'Should_Report_NonTagClassSpecifier_InMiddleware',
      code: `class NotATag {}; export { NotATag }; export const attachSession = () => {}`,
      filename: 'attach-session.middleware.ts',
      errors: [{ messageId: 'disallowedExport', data: disallowedData('NotATag') }],
    },
    {
      name: 'Should_Report_DestructuredFunctionVariable_InMiddleware',
      code: `export const { foo } = () => {}`,
      filename: 'attach-session.middleware.ts',
      errors: [{ messageId: 'tooManyFunctionExports', data: tooManyData('0') }],
    },
    {
      name: 'Should_Report_NullInitSpecifier_InMiddleware',
      code: `let a; export { a }; export const attachSession = () => {}`,
      filename: 'attach-session.middleware.ts',
      errors: [{ messageId: 'disallowedExport', data: disallowedData('a') }],
    },
    {
      name: 'Should_Report_ExportedEnumDeclaration_InMiddleware',
      code: `export enum Color { Red }; export const attachSession = () => {}`,
      filename: 'attach-session.middleware.ts',
      errors: [{ messageId: 'disallowedExport', data: disallowedData('export') }],
    },
  ],
})
