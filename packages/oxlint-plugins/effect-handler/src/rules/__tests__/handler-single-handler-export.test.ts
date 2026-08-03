import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { handlerSingleHandlerExport } from '../handler-single-handler-export.js'

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

const disallowedExportData = {
  expected:
    'only the handler function, schema classes, S.Union, TypeId symbols, types, and a router/route-table that registers the handler',
  actual: 'exported value',
  fix: 'move constants, helpers, and steps out of the handler file',
}

const tooManyData = (count: string) => ({
  name: '*.handler.ts',
  expected: 'exactly one function export — the handler itself',
  actual: `${count} function exports`,
  fix: 'make steps and helpers private; schema classes, types, and a router/route-table may stay exported',
})

ruleTester.run('handler-single-handler-export', handlerSingleHandlerExport, {
  valid: [
    {
      name: 'Should_Pass_When_SingleArrowExport_InHandler',
      code: `export const getUserHandler = (cmd) => Effect.succeed(result)`,
      filename: 'get-user.handler.ts',
    },
    {
      name: 'Should_Pass_When_SingleFunctionExport_InHandler',
      code: `export function getUserHandler(cmd) { return Effect.succeed(result) }`,
      filename: 'get-user.handler.ts',
    },
    {
      name: 'Should_Pass_When_SingleFunctionExpressionExport_InHandler',
      code: `export const getUserHandler = function(cmd) { return Effect.succeed(result) }`,
      filename: 'get-user.handler.ts',
    },
    {
      name: 'Should_Pass_When_SingleDefaultArrowExport_InHandler',
      code: `export default () => {}`,
      filename: 'get-user.handler.ts',
    },
    {
      name: 'Should_Pass_When_Handler_And_Types_And_Schemas_Are_Co_Exported',
      code:
        `export class Command extends S.TaggedClass()() {} export class Error extends S.TaggedError()() {} export interface RequestOptions { id: string } export type UserId = string; export const SomeSchema = S.Union(A, B); export const getUserHandler = () => {}`,
      filename: 'get-user.handler.ts',
    },
    {
      name: 'Should_Pass_When_Router_Registering_Handler_Is_Exported',
      code:
        `export const getUserHandler = () => {}; export const router = HttpRouter.empty().pipe(HttpRouter.mount('/users', getUserHandler))`,
      filename: 'get-user.handler.ts',
    },
    {
      name: 'Should_Pass_When_RouteTable_Array_Is_Exported',
      code: `export const getUserHandler = () => {}; export const routes = [getUserHandler]`,
      filename: 'get-user.handler.ts',
    },
    {
      name: 'Should_Pass_When_NonHandlerFile_HasManyFunctionExports',
      code:
        `export function a() {} export function b() {} export function c() {} export function d() {} export function e() {}`,
      filename: 'process-claim.executor.ts',
    },
    {
      name: 'Should_Pass_When_NonHandlerFile_HasNoFunctionExports',
      code: `export const processClaim = 1; export const x = 2`,
      filename: 'process-claim.workflow.ts',
    },
    {
      name: 'Should_Pass_When_DefaultAnonymousFunctionExport_InHandler',
      code: `export default function() {}`,
      filename: 'get-user.handler.ts',
    },
    {
      name: 'Should_Pass_When_DefaultIdentifierOfLocalArrow_InHandler',
      code: `const h = () => {}; export default h`,
      filename: 'get-user.handler.ts',
    },
    {
      name: 'Should_Pass_When_LocalFunctionDeclarationSpecifier_InHandler',
      code: `function helper() {}; export { helper }`,
      filename: 'get-user.handler.ts',
    },
    {
      name: 'Should_Pass_When_TypeReExportFromOtherModule_InHandler',
      code: `export const getUserHandler = () => {}; export type { Foo } from './types.js'`,
      filename: 'get-user.handler.ts',
    },
    {
      name: 'Should_Pass_When_LocalFunctionExpressionSpecifier_InHandler',
      code: `const helper = function() {}; export { helper }`,
      filename: 'get-user.handler.ts',
    },
    {
      name: 'Should_Pass_When_TypeAliasExport_IsIgnored',
      code: `export const getUserHandler = () => {}; export type Foo = string`,
      filename: 'get-user.handler.ts',
    },
    {
      name: 'Should_Pass_When_LocalSchemaClass_Specifier_IsAllowed',
      code: `class Foo extends S.TaggedClass()() {}; export { Foo }; export const getUserHandler = () => {}`,
      filename: 'get-user.handler.ts',
    },
    {
      name: 'Should_Pass_When_TypeReExportSpecifier_DoesNotCount',
      code: `export const getUserHandler = () => {}; export type { helper } from './helpers.js'`,
      filename: 'get-user.handler.ts',
    },
    {
      name: 'Should_Pass_When_LocalUnion_Specifier_IsAllowed',
      code: `const x = S.Union(A, B); export { x }; export const getUserHandler = () => {}`,
      filename: 'get-user.handler.ts',
    },
    {
      name: 'Should_Pass_When_HttpRouterMake_Is_Exported',
      code: `export const getUserHandler = () => {}; export const router = HttpRouter.make()`,
      filename: 'get-user.handler.ts',
    },
    {
      name: 'Should_Pass_When_TypeStarReExport_DoesNotCount',
      code: `export const getUserHandler = () => {}; export type * from './types.js'`,
      filename: 'get-user.handler.ts',
    },
    {
      name: 'Should_Pass_When_SymbolFor_Is_Exported',
      code: `export const getUserHandler = () => {}; export const typeId = Symbol.for('Foo')`,
      filename: 'get-user.handler.ts',
    },
    {
      name: 'Should_Pass_When_SymbolCall_Is_Exported',
      code: `export const getUserHandler = () => {}; export const typeId = Symbol('Foo')`,
      filename: 'get-user.handler.ts',
    },
    {
      name: 'Should_Pass_When_SpecLevelTypeReExport_DoesNotCount',
      code: `export const getUserHandler = () => {}; export { type Foo } from './types.js'`,
      filename: 'get-user.handler.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_TwoArrowExports',
      code: `export const getUserHandler = (cmd) => Effect.succeed(result); export const helper = () => {}`,
      filename: 'get-user.handler.ts',
      errors: [{
        messageId: 'tooManyFunctionExports',
        data: tooManyData('2'),
      }],
    },
    {
      name: 'Should_Report_ArrowAndFunctionDeclaration',
      code: `export const getUserHandler = () => {}; export function helper() {}`,
      filename: 'get-user.handler.ts',
      errors: [{
        messageId: 'tooManyFunctionExports',
        data: tooManyData('2'),
      }],
    },
    {
      name: 'Should_Report_ThreeArrowExports',
      code: `export const a = () => {}; export const b = () => {}; export const getUserHandler = () => {}`,
      filename: 'get-user.handler.ts',
      errors: [{
        messageId: 'tooManyFunctionExports',
        data: tooManyData('3'),
      }],
    },
    {
      name: 'Should_Report_FunctionDeclarationAndSpecifierHelpers',
      code:
        `export function decide() {}; const helperA = () => {}; const helperB = () => {}; export { helperA, helperB }`,
      filename: 'get-user.handler.ts',
      errors: [{
        messageId: 'tooManyFunctionExports',
        data: tooManyData('3'),
      }],
    },
    {
      name: 'Should_Report_ArrowAndDefaultExportOfSameFunction',
      code: `export const h = () => {}; export default h`,
      filename: 'get-user.handler.ts',
      errors: [{
        messageId: 'tooManyFunctionExports',
        data: tooManyData('2'),
      }],
    },
    {
      name: 'Should_Report_ZeroFunctionExports_When_NoExports',
      code: `const x = 1`,
      filename: 'get-user.handler.ts',
      errors: [{
        messageId: 'tooManyFunctionExports',
        data: tooManyData('0'),
      }],
    },
    {
      name: 'Should_Report_ZeroFunctionExports_When_OnlyTypesAndRouter',
      code:
        `export class Foo extends S.TaggedClass<Foo>()('Foo', {}) {} export type Bar = string; const SomeSchema = S.Union(A, B); export { SomeSchema }; export const router = HttpRouter.empty()`,
      filename: 'get-user.handler.ts',
      errors: [{
        messageId: 'tooManyFunctionExports',
        data: tooManyData('0'),
      }],
    },
    {
      name: 'Should_Report_ExportedConstantDeclaration',
      code: `export const FOO = 1; export const getUserHandler = () => {}`,
      filename: 'get-user.handler.ts',
      errors: [{
        messageId: 'disallowedExport',
        data: { name: 'FOO', ...disallowedExportData },
      }],
    },
    {
      name: 'Should_Report_ExportedConstantSpecifier',
      code: `const foo = 1; export { foo }; export const getUserHandler = () => {}`,
      filename: 'get-user.handler.ts',
      errors: [{
        messageId: 'disallowedExport',
        data: { name: 'foo', ...disallowedExportData },
      }],
    },
    {
      name: 'Should_Report_ExportedLetDeclaration',
      code: `export let x = 1; export const getUserHandler = () => {}`,
      filename: 'get-user.handler.ts',
      errors: [{
        messageId: 'disallowedExport',
        data: { name: 'x', ...disallowedExportData },
      }],
    },
    {
      name: 'Should_Report_ZeroExports_When_DefaultNonFunctionIdentifier',
      code: `const x = 1; export default x`,
      filename: 'get-user.handler.ts',
      errors: [
        {
          messageId: 'tooManyFunctionExports',
          data: tooManyData('0'),
        },
        {
          messageId: 'disallowedExport',
          data: { name: 'default', ...disallowedExportData },
        },
      ],
    },
    {
      name: 'Should_Report_ZeroExports_When_DestructuredArrowInitializer',
      code: `export const [f] = () => {}`,
      filename: 'get-user.handler.ts',
      errors: [{
        messageId: 'tooManyFunctionExports',
        data: tooManyData('0'),
      }],
    },
    {
      name: 'Should_Report_TwoExports_When_DefaultNamedFunctionAndSpecifier',
      code: `export default function getUserHandler() {}; export { getUserHandler }`,
      filename: 'get-user.handler.ts',
      errors: [{
        messageId: 'tooManyFunctionExports',
        data: tooManyData('2'),
      }],
    },
    {
      name: 'Should_Report_TooManyExports_When_ExportAllDeclarationPresent',
      code: `export const getUserHandler = () => {}; export * from './other.js'`,
      filename: 'get-user.handler.ts',
      errors: [{
        messageId: 'tooManyFunctionExports',
        data: tooManyData('2'),
      }],
    },
    {
      name: 'Should_Report_TooManyExports_When_CrossModuleSpecifierReExport',
      code: `export const getUserHandler = () => {}; export { helper } from './helpers.js'`,
      filename: 'get-user.handler.ts',
      errors: [{
        messageId: 'tooManyFunctionExports',
        data: tooManyData('2'),
      }],
    },
    {
      name: 'Should_Report_Disallowed_When_ClassExtends_NonS_TaggedClass',
      code: `export const getUserHandler = () => {}; export class Foo extends MyMod.TaggedClass()('Foo', {}) {}`,
      filename: 'get-user.handler.ts',
      errors: [{
        messageId: 'disallowedExport',
        data: { name: 'Foo', ...disallowedExportData },
      }],
    },
    {
      name: 'Should_Report_Disallowed_When_ClassExtends_S_NonTaggedMethod',
      code: `export const getUserHandler = () => {}; export class Foo extends S.Struct({})({}) {}`,
      filename: 'get-user.handler.ts',
      errors: [{
        messageId: 'disallowedExport',
        data: { name: 'Foo', ...disallowedExportData },
      }],
    },
    {
      name: 'Should_Report_Disallowed_When_ClassExtends_NonCallSuperClass',
      code: `export const getUserHandler = () => {}; export class Foo extends Base {}`,
      filename: 'get-user.handler.ts',
      errors: [{
        messageId: 'disallowedExport',
        data: { name: 'Foo', ...disallowedExportData },
      }],
    },
    {
      name: 'Should_Report_Disallowed_When_ClassHasNoSuperClass',
      code: `export const getUserHandler = () => {}; export class Foo {}`,
      filename: 'get-user.handler.ts',
      errors: [{
        messageId: 'disallowedExport',
        data: { name: 'Foo', ...disallowedExportData },
      }],
    },
    {
      name: 'Should_Report_Disallowed_When_RouterCalleeNotHttpRouter',
      code: `export const getUserHandler = () => {}; export const router = OtherRouter.empty()`,
      filename: 'get-user.handler.ts',
      errors: [{
        messageId: 'disallowedExport',
        data: { name: 'router', ...disallowedExportData },
      }],
    },
    {
      name: 'Should_Report_Disallowed_When_RouterPropertyNotEmptyOrMake',
      code: `export const getUserHandler = () => {}; export const router = HttpRouter.notEmpty()`,
      filename: 'get-user.handler.ts',
      errors: [{
        messageId: 'disallowedExport',
        data: { name: 'router', ...disallowedExportData },
      }],
    },
    {
      name: 'Should_Report_Disallowed_When_PipeOnNonMemberExpression',
      code: `export const getUserHandler = () => {}; export const router = foo().pipe(g)`,
      filename: 'get-user.handler.ts',
      errors: [{
        messageId: 'disallowedExport',
        data: { name: 'router', ...disallowedExportData },
      }],
    },
    {
      name: 'Should_Report_Disallowed_When_NonS_NonUnion_MemberCall',
      code: `export const getUserHandler = () => {}; export const x = Other.Literal('foo')`,
      filename: 'get-user.handler.ts',
      errors: [{
        messageId: 'disallowedExport',
        data: { name: 'x', ...disallowedExportData },
      }],
    },
    {
      name: 'Should_Report_Disallowed_When_NotHttpRouter_NonSymbol_MemberCall',
      code: `export const getUserHandler = () => {}; export const x = OtherSymbol.for('Foo')`,
      filename: 'get-user.handler.ts',
      errors: [{
        messageId: 'disallowedExport',
        data: { name: 'x', ...disallowedExportData },
      }],
    },
    {
      name: 'Should_Report_Disallowed_When_SpecifierPointsTo_NonFunction_NonAllowed',
      code: `function helper() {}; const x = 1; export { x }; export const getUserHandler = () => {}`,
      filename: 'get-user.handler.ts',
      errors: [{
        messageId: 'disallowedExport',
        data: { name: 'x', ...disallowedExportData },
      }],
    },
    {
      name: 'Should_Report_TooManyExports_When_SpecifierPointsToExportedFunction',
      code: `export function decide() {}; export { decide }; export const getUserHandler = () => {}`,
      filename: 'get-user.handler.ts',
      errors: [{
        messageId: 'tooManyFunctionExports',
        data: tooManyData('3'),
      }],
    },
    {
      name: 'Should_Report_TooManyExports_When_DefaultFunctionExpression',
      code: `export const getUserHandler = () => {}; export default (function() {})`,
      filename: 'get-user.handler.ts',
      errors: [{
        messageId: 'tooManyFunctionExports',
        data: tooManyData('2'),
      }],
    },
    {
      name: 'Should_Report_Disallowed_When_RouterNonPipeMemberChain',
      code:
        `export const getUserHandler = () => {}; export const router = HttpRouter.empty().mount('/x', getUserHandler)`,
      filename: 'get-user.handler.ts',
      errors: [{
        messageId: 'disallowedExport',
        data: { name: 'router', ...disallowedExportData },
      }],
    },
    {
      name: 'Should_Report_Disallowed_When_S_NonUnion_Call',
      code: `export const getUserHandler = () => {}; export const x = S.Literal('foo')`,
      filename: 'get-user.handler.ts',
      errors: [{
        messageId: 'disallowedExport',
        data: { name: 'x', ...disallowedExportData },
      }],
    },
    {
      name: 'Should_Report_Disallowed_When_SpecifierPointsToNonSchemaClass',
      code: `class Foo {}; export { Foo }; export const getUserHandler = () => {}`,
      filename: 'get-user.handler.ts',
      errors: [{
        messageId: 'disallowedExport',
        data: { name: 'Foo', ...disallowedExportData },
      }],
    },
    {
      name: 'Should_Report_Disallowed_When_SymbolNonForMemberCall',
      code: `export const getUserHandler = () => {}; export const x = Symbol.notFor('Foo')`,
      filename: 'get-user.handler.ts',
      errors: [{
        messageId: 'disallowedExport',
        data: { name: 'x', ...disallowedExportData },
      }],
    },
    {
      name: 'Should_Report_Disallowed_When_PlainIdentifierCall',
      code: `export const getUserHandler = () => {}; export const x = someFn('Foo')`,
      filename: 'get-user.handler.ts',
      errors: [{
        messageId: 'disallowedExport',
        data: { name: 'x', ...disallowedExportData },
      }],
    },
    {
      name: 'Should_Report_Disallowed_When_NonS_Object_Union_Property',
      code: `export const getUserHandler = () => {}; export const x = Other.Union(A, B)`,
      filename: 'get-user.handler.ts',
      errors: [{
        messageId: 'disallowedExport',
        data: { name: 'x', ...disallowedExportData },
      }],
    },
    {
      name: 'Should_Report_Disallowed_When_ClassExtends_BareIdentifierCall',
      code: `export const getUserHandler = () => {}; export class Foo extends TaggedClass()() {}`,
      filename: 'get-user.handler.ts',
      errors: [{
        messageId: 'disallowedExport',
        data: { name: 'Foo', ...disallowedExportData },
      }],
    },
    {
      name: 'Should_Report_Disallowed_When_ClassExtends_ComputedS_Member',
      code: `export const getUserHandler = () => {}; export class Foo extends S['TaggedClass']()() {}`,
      filename: 'get-user.handler.ts',
      errors: [{
        messageId: 'disallowedExport',
        data: { name: 'Foo', ...disallowedExportData },
      }],
    },
    {
      name: 'Should_Report_Disallowed_When_RouterComputedMember',
      code: `export const getUserHandler = () => {}; export const router = HttpRouter['empty']()`,
      filename: 'get-user.handler.ts',
      errors: [{
        messageId: 'disallowedExport',
        data: { name: 'router', ...disallowedExportData },
      }],
    },
    {
      name: 'Should_Report_Disallowed_When_LetDeclaration_WithoutInitializer',
      code: `export const getUserHandler = () => {}; export let x;`,
      filename: 'get-user.handler.ts',
      errors: [{
        messageId: 'disallowedExport',
        data: { name: 'x', ...disallowedExportData },
      }],
    },
    {
      name: 'Should_Report_Disallowed_When_EnumDeclaration_Exported',
      code: `export const getUserHandler = () => {}; export enum Foo { A }`,
      filename: 'get-user.handler.ts',
      errors: [{
        messageId: 'disallowedExport',
        data: { name: 'export', ...disallowedExportData },
      }],
    },
  ],
})
