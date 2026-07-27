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
        `export class Foo extends S.TaggedClass<Foo>()('Foo', {}) {} export type Bar = string; const SomeSchema = {}; export { SomeSchema }; export const processClaim = () => {}`,
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
      name: 'Should_Pass_When_NonFunctionSpecifierAccompaniesSingleWorkflow',
      code: `const foo = 1; export { foo }; export const processClaim = () => {}`,
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
        `export class Foo extends S.TaggedClass<Foo>()('Foo', {}) {} export type Bar = string; const SomeSchema = {}; export { SomeSchema }`,
      filename: 'process-claim.workflow.ts',
      errors: [{ messageId: 'tooManyFunctionExports', data: { ...data, actual: '0 function exports' } }],
    },
    {
      name: 'Should_Report_ZeroFunctionExports_When_UndeclaredExport',
      code: `export let x`,
      filename: 'process-claim.workflow.ts',
      errors: [{ messageId: 'tooManyFunctionExports', data: { ...data, actual: '0 function exports' } }],
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
      name: 'Should_Report_ZeroExports_When_DefaultNonFunctionIdentifier',
      code: `const x = 1; export default x`,
      filename: 'process-claim.workflow.ts',
      errors: [{ messageId: 'tooManyFunctionExports', data: { ...data, actual: '0 function exports' } }],
    },
    {
      name: 'Should_Report_ZeroExports_When_DestructuredArrowInitializer',
      code: `export const [f] = () => {}`,
      filename: 'process-claim.workflow.ts',
      errors: [{ messageId: 'tooManyFunctionExports', data: { ...data, actual: '0 function exports' } }],
    },
  ],
})
