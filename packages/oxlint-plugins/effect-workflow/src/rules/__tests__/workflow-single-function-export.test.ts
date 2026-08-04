import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { workflowSingleFunctionExport } from '../workflow-single-function-export.js'

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

const data = {
  name: '*.workflow.ts',
  expected: 'exactly one function export — the workflow itself',
  actual: '2 function exports',
  fix: 'make steps and helpers private; schema classes and types may stay exported',
}

const disallowed = {
  expected: 'only the workflow function, schema classes, S.Union, TypeId symbols, and types',
  actual: 'exported value',
  fix: 'move constants, helpers, and steps out of the workflow file',
}

ruleTester.run('workflow-single-function-export', workflowSingleFunctionExport, {
  valid: [
    {
      name: 'Should_Pass_When_SingleArrowExport_InWorkflow',
      code: `export const processClaim = (cmd) => Either.right(result)`,
      filename: 'process-claim.workflow.ts',
    },
    {
      name: 'Should_Pass_When_SingleFunctionExport_InWorkflow',
      code: `export function processClaim(cmd) { return Either.right(result) }`,
      filename: 'process-claim.workflow.ts',
    },
    {
      name: 'Should_Pass_When_SingleFunctionExpressionExport_InWorkflow',
      code: `export const processClaim = function(cmd) { return Either.right(result) }`,
      filename: 'process-claim.workflow.ts',
    },
    {
      name: 'Should_Pass_When_SingleDefaultArrowExport_InWorkflow',
      code: `export default () => {}`,
      filename: 'process-claim.workflow.ts',
    },
    {
      name: 'Should_Pass_When_SchemaClassTypeAndObjectSpecifierAccompanySingleWorkflow',
      code:
        `export class Foo extends S.TaggedClass<Foo>()('Foo', {}) {} export type Bar = string; const SomeSchema = S.Union(A, B); export { SomeSchema }; export const processClaim = () => {}`,
      filename: 'process-claim.workflow.ts',
    },
    {
      name: 'Should_Pass_When_MultipleTaggedClassesAndSingleWorkflow',
      code:
        `export class Command extends S.TaggedClass()() {} export class Decision extends S.TaggedClass()() {} export class Error extends S.TaggedError()() {} export const processClaim = () => {}`,
      filename: 'process-claim.workflow.ts',
    },
    {
      name: 'Should_Pass_When_UnionExportAndSingleWorkflow',
      code: `export const Decision = S.Union(A, B); export const processClaim = () => {}`,
      filename: 'process-claim.workflow.ts',
    },
    {
      name: 'Should_Pass_When_SchemaUnionAndTypeIdAccompanySingleWorkflow',
      code:
        `export const Decision = S.Union(A, B); const XTypeId = Symbol.for('x'); export { XTypeId }; export const processClaim = () => {}`,
      filename: 'process-claim.workflow.ts',
    },
    {
      name: 'Should_Pass_When_NonWorkflowFile_HasManyFunctionExports',
      code:
        `export function a() {} export function b() {} export function c() {} export function d() {} export function e() {}`,
      filename: 'process-claim.handler.ts',
    },
    {
      name: 'Should_Pass_When_NonWorkflowFile_HasNoFunctionExports',
      code: `export const processClaim = 1; export const x = 2`,
      filename: 'process-claim.executor.ts',
    },
    {
      name: 'Should_Pass_When_DefaultAnonymousFunctionExport_InWorkflow',
      code: `export default function() {}`,
      filename: 'process-claim.workflow.ts',
    },
    {
      name: 'Should_Pass_When_DefaultIdentifierOfLocalArrow_InWorkflow',
      code: `const w = () => {}; export default w`,
      filename: 'process-claim.workflow.ts',
    },
    {
      name: 'Should_Pass_When_LocalFunctionDeclarationSpecifier_InWorkflow',
      code: `function helper() {}; export { helper }`,
      filename: 'process-claim.workflow.ts',
    },
    {
      name: 'Should_Pass_When_LocalFunctionExpressionSpecifier_InWorkflow',
      code: `const helper = function() {}; export { helper }`,
      filename: 'process-claim.workflow.ts',
    },
    {
      name: 'Should_Pass_When_SchemaClassSpecifierAccompanySingleWorkflow',
      code:
        `class Foo extends S.TaggedClass<Foo>()('Foo', {}) {}; export { Foo }; export const processClaim = () => {}`,
      filename: 'process-claim.workflow.ts',
    },
    {
      name: 'Should_Pass_When_TypeAliasSpecifierAccompanySingleWorkflow',
      code: `type Foo = string; export { type Foo }; export const processClaim = () => {}`,
      filename: 'process-claim.workflow.ts',
    },
    {
      name: 'Should_Pass_When_TypeOnlySpecifierAccompanySingleWorkflow',
      code: `type Foo = string; export type { Foo }; export const processClaim = () => {}`,
      filename: 'process-claim.workflow.ts',
    },
    {
      name: 'Should_Pass_When_BareSymbolCallTypeIdAccompanySingleWorkflow',
      code: `export const XTypeId = Symbol('x'); export const processClaim = () => {}`,
      filename: 'process-claim.workflow.ts',
    },
    {
      name: 'Should_Pass_When_InterfaceDeclarationAccompanySingleWorkflow',
      code: `export interface Foo {}; export const processClaim = () => {}`,
      filename: 'process-claim.workflow.ts',
    },
    {
      name: 'Should_Pass_When_TypeAliasDeclarationAccompanySingleWorkflow',
      code: `export type Foo = string; export const processClaim = () => {}`,
      filename: 'process-claim.workflow.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_TwoArrowExports',
      code: `export const processClaim = (cmd) => Either.right(result); export const helper = () => {}`,
      filename: 'process-claim.workflow.ts',
      errors: [{ messageId: 'tooManyFunctionExports', data: { ...data, actual: '2 function exports' } }],
    },
    {
      name: 'Should_Report_ArrowAndFunctionDeclaration',
      code: `export const processClaim = () => {}; export function helper() {}`,
      filename: 'process-claim.workflow.ts',
      errors: [{ messageId: 'tooManyFunctionExports', data: { ...data, actual: '2 function exports' } }],
    },
    {
      name: 'Should_Report_ThreeArrowExports',
      code: `export const a = () => {}; export const b = () => {}; export const processClaim = () => {}`,
      filename: 'process-claim.workflow.ts',
      errors: [{ messageId: 'tooManyFunctionExports', data: { ...data, actual: '3 function exports' } }],
    },
    {
      name: 'Should_Report_FunctionDeclarationAndSpecifierHelpers',
      code:
        `export function decide() {}; const helperA = () => {}; const helperB = () => {}; export { helperA, helperB }`,
      filename: 'process-claim.workflow.ts',
      errors: [{ messageId: 'tooManyFunctionExports', data: { ...data, actual: '3 function exports' } }],
    },
    {
      name: 'Should_Report_ArrowAndDefaultExportOfSameFunction',
      code: `export const w = () => {}; export default w`,
      filename: 'process-claim.workflow.ts',
      errors: [{ messageId: 'tooManyFunctionExports', data: { ...data, actual: '2 function exports' } }],
    },
    {
      name: 'Should_Report_ZeroFunctionExports_When_NoExports',
      code: `const x = 1`,
      filename: 'process-claim.workflow.ts',
      errors: [{ messageId: 'tooManyFunctionExports', data: { ...data, actual: '0 function exports' } }],
    },
    {
      name: 'Should_Report_ZeroFunctionExports_When_OnlySchemasTypesAndObjects',
      code:
        `export class Foo extends S.TaggedClass<Foo>()('Foo', {}) {} export type Bar = string; const SomeSchema = S.Union(A, B); export { SomeSchema }`,
      filename: 'process-claim.workflow.ts',
      errors: [{ messageId: 'tooManyFunctionExports', data: { ...data, actual: '0 function exports' } }],
    },
    {
      name: 'Should_Report_ZeroFunctionExports_When_UndeclaredExport',
      code: `export let x`,
      filename: 'process-claim.workflow.ts',
      errors: [
        { messageId: 'tooManyFunctionExports', data: { ...data, actual: '0 function exports' } },
        {
          messageId: 'disallowedExport',
          data: {
            name: 'x',
            expected: 'only the workflow function, schema classes, S.Union, TypeId symbols, and types',
            actual: 'exported value',
            fix: 'move constants, helpers, and steps out of the workflow file',
          },
        },
      ],
    },
    {
      name: 'Should_Report_ThreeExports_When_NamedFunctionDeclarationAndSpecifierAndArrow',
      code: `export function helper() {}; export { helper }; export const w = () => {}`,
      filename: 'process-claim.workflow.ts',
      errors: [{ messageId: 'tooManyFunctionExports', data: { ...data, actual: '3 function exports' } }],
    },
    {
      name: 'Should_Report_TwoExports_When_DefaultNamedFunctionAndSpecifier',
      code: `export default function helper() {}; export { helper }`,
      filename: 'process-claim.workflow.ts',
      errors: [{ messageId: 'tooManyFunctionExports', data: { ...data, actual: '2 function exports' } }],
    },
    {
      name: 'Should_Report_ExportedConstantDeclaration',
      code: `export const FOO = 1; export const processClaim = () => {}`,
      filename: 'process-claim.workflow.ts',
      errors: [{
        messageId: 'disallowedExport',
        data: {
          name: 'FOO',
          expected: 'only the workflow function, schema classes, S.Union, TypeId symbols, and types',
          actual: 'exported value',
          fix: 'move constants, helpers, and steps out of the workflow file',
        },
      }],
    },
    {
      name: 'Should_Report_ExportedConstantSpecifier',
      code: `const foo = 1; export { foo }; export const processClaim = () => {}`,
      filename: 'process-claim.workflow.ts',
      errors: [{
        messageId: 'disallowedExport',
        data: {
          name: 'foo',
          expected: 'only the workflow function, schema classes, S.Union, TypeId symbols, and types',
          actual: 'exported value',
          fix: 'move constants, helpers, and steps out of the workflow file',
        },
      }],
    },
    {
      name: 'Should_Report_ExportedLetDeclaration',
      code: `export let x = 1; export const processClaim = () => {}`,
      filename: 'process-claim.workflow.ts',
      errors: [{
        messageId: 'disallowedExport',
        data: {
          name: 'x',
          expected: 'only the workflow function, schema classes, S.Union, TypeId symbols, and types',
          actual: 'exported value',
          fix: 'move constants, helpers, and steps out of the workflow file',
        },
      }],
    },
    {
      name: 'Should_Report_ZeroExports_When_DefaultNonFunctionIdentifier',
      code: `const x = 1; export default x`,
      filename: 'process-claim.workflow.ts',
      errors: [
        { messageId: 'tooManyFunctionExports', data: { ...data, actual: '0 function exports' } },
        {
          messageId: 'disallowedExport',
          data: {
            name: 'default',
            expected: 'only the workflow function, schema classes, S.Union, TypeId symbols, and types',
            actual: 'exported value',
            fix: 'move constants, helpers, and steps out of the workflow file',
          },
        },
      ],
    },
    {
      name: 'Should_Report_ZeroExports_When_DestructuredArrowInitializer',
      code: `export const [f] = () => {}`,
      filename: 'process-claim.workflow.ts',
      errors: [{ messageId: 'tooManyFunctionExports', data: { ...data, actual: '0 function exports' } }],
    },
    {
      name: 'Should_Report_ExportedPlainClassDeclaration',
      code: `export class Plain {}; export const processClaim = () => {}`,
      filename: 'process-claim.workflow.ts',
      errors: [{ messageId: 'disallowedExport', data: { name: 'Plain', ...disallowed } }],
    },
    {
      name: 'Should_Report_ExportedClassWithIdentifierSuper',
      code: `export class Foo extends SomeValue {}; export const processClaim = () => {}`,
      filename: 'process-claim.workflow.ts',
      errors: [{ messageId: 'disallowedExport', data: { name: 'Foo', ...disallowed } }],
    },
    {
      name: 'Should_Report_ExportedClassWithForeignTaggedCall',
      code: `export class Foo extends Other.TaggedClass()() {}; export const processClaim = () => {}`,
      filename: 'process-claim.workflow.ts',
      errors: [{ messageId: 'disallowedExport', data: { name: 'Foo', ...disallowed } }],
    },
    {
      name: 'Should_Report_ExportedClassWithPlainCallSuper',
      code: `export class Foo extends someFn() {}; export const processClaim = () => {}`,
      filename: 'process-claim.workflow.ts',
      errors: [{ messageId: 'disallowedExport', data: { name: 'Foo', ...disallowed } }],
    },
    {
      name: 'Should_Report_ExportedClassWithComputedTaggedCall',
      code: `export class Foo extends S['TaggedClass']()() {}; export const processClaim = () => {}`,
      filename: 'process-claim.workflow.ts',
      errors: [{ messageId: 'disallowedExport', data: { name: 'Foo', ...disallowed } }],
    },
    {
      name: 'Should_Report_ExportedClassWithNonSchemaCall',
      code: `export class Foo extends S.Struct({}) {}; export const processClaim = () => {}`,
      filename: 'process-claim.workflow.ts',
      errors: [{ messageId: 'disallowedExport', data: { name: 'Foo', ...disallowed } }],
    },
    {
      name: 'Should_Report_ExportedPlainClassSpecifier',
      code: `class Plain {}; export { Plain }; export const processClaim = () => {}`,
      filename: 'process-claim.workflow.ts',
      errors: [{ messageId: 'disallowedExport', data: { name: 'Plain', ...disallowed } }],
    },
    {
      name: 'Should_Report_ExportedEnumDeclaration',
      code: `export enum Color { Red }; export const processClaim = () => {}`,
      filename: 'process-claim.workflow.ts',
      errors: [{ messageId: 'disallowedExport', data: { name: 'export', ...disallowed } }],
    },
    {
      name: 'Should_Report_ExportedNearMissSymbolMemberCall',
      code: `export const XTypeId = Symbol.foo('x'); export const processClaim = () => {}`,
      filename: 'process-claim.workflow.ts',
      errors: [{ messageId: 'disallowedExport', data: { name: 'XTypeId', ...disallowed } }],
    },
    {
      name: 'Should_Report_ExportedNearMissForeignObjectCall',
      code: `export const XTypeId = Other.for('x'); export const processClaim = () => {}`,
      filename: 'process-claim.workflow.ts',
      errors: [{ messageId: 'disallowedExport', data: { name: 'XTypeId', ...disallowed } }],
    },
    {
      name: 'Should_Report_ExportedComputedSymbolCall',
      code: `export const XTypeId = Symbol['for']('x'); export const processClaim = () => {}`,
      filename: 'process-claim.workflow.ts',
      errors: [{ messageId: 'disallowedExport', data: { name: 'XTypeId', ...disallowed } }],
    },
    {
      name: 'Should_Report_ExportedPlainCallExpression',
      code: `export const X = someCall(); export const processClaim = () => {}`,
      filename: 'process-claim.workflow.ts',
      errors: [{ messageId: 'disallowedExport', data: { name: 'X', ...disallowed } }],
    },
    {
      name: 'Should_Report_ExportedNearMissUnionObject',
      code: `export const Decision = Other.Union(A, B); export const processClaim = () => {}`,
      filename: 'process-claim.workflow.ts',
      errors: [{ messageId: 'disallowedExport', data: { name: 'Decision', ...disallowed } }],
    },
    {
      name: 'Should_Report_ExportedNearMissUnionProperty',
      code: `export const Decision = S.Other(A, B); export const processClaim = () => {}`,
      filename: 'process-claim.workflow.ts',
      errors: [{ messageId: 'disallowedExport', data: { name: 'Decision', ...disallowed } }],
    },
    {
      name: 'Should_Report_ExportedComputedUnionProperty',
      code: `export const Decision = S['Union'](A, B); export const processClaim = () => {}`,
      filename: 'process-claim.workflow.ts',
      errors: [{ messageId: 'disallowedExport', data: { name: 'Decision', ...disallowed } }],
    },
  ],
})
