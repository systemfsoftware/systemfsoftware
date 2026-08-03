import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { executorSingleOperationExport } from '../executor-single-operation-export.js'

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
  name: '*.executor.ts',
  expected:
    'exactly one operation function export — the use case itself, with optional <Executor>Deps Tag and Layer that binds it',
  actual: '2 function exports',
  fix:
    'move the second use case (and any helpers that are not the use case) into their own *.executor.ts or a sibling cell; make them private if only this executor uses them',
}

ruleTester.run('executor-single-operation-export', executorSingleOperationExport, {
  valid: [
    {
      name: 'Should_Pass_When_SingleArrowExport_InExecutor',
      code: `export const confirmOrder = (cmd) => Effect.succeed(result)`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Pass_When_SingleFunctionDeclarationExport_InExecutor',
      code: `export function confirmOrder(cmd) { return Effect.succeed(result) }`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Pass_When_SingleFunctionExpressionExport_InExecutor',
      code: `export const confirmOrder = function(cmd) { return Effect.succeed(result) }`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Pass_When_SingleEffectFnExport_InExecutor',
      code: `export const confirmOrder = Effect.fn(function* (cmd) { return cmd })`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Pass_When_SingleNamedEffectFnExport_InExecutor',
      code: `export const confirmOrder = Effect.fn('confirmOrder')(function* (cmd) { return cmd })`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Pass_When_SingleEffectFnUntracedExport_InExecutor',
      code: `export const confirmOrder = Effect.fnUntraced(function* (cmd) { return cmd })`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Pass_When_EffectFnOperationWithDepsTagAndLayer',
      code:
        `export class ConfirmOrderExecutorDeps extends Context.Tag('ConfirmOrderExecutorDeps')<ConfirmOrderExecutorDeps, {}>() {}\n` +
        `const live = Layer.succeed(ConfirmOrderExecutorDeps, {})\n` +
        `export { live as ConfirmOrderLive }\n` +
        `export const confirmOrder = Effect.fn('confirmOrder')(function* () { return yield* ConfirmOrderExecutorDeps })`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Pass_When_EffectFnHelperIsLocalBesideTheOperation',
      code: `const extractRefs = Effect.fn('extractRefs')(function* () { return [] })\n` +
        `export const confirmOrder = Effect.fn('confirmOrder')(function* () { return yield* extractRefs() })`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Pass_When_SingleDefaultArrowExport_InExecutor',
      code: `export default () => {}`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Pass_When_SingleAnonymousFunctionDeclarationExport_InExecutor',
      code: `export default function() {}`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Pass_When_SingleDefaultNamedFunctionExport_InExecutor',
      code: `export default function confirmOrder() {}`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Pass_When_SingleDefaultFunctionExpressionExport_InExecutor',
      code: `export default (function() {})`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Pass_When_SingleExportAllReExport_InExecutor',
      code: `export * from './sibling.executor.js'`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Pass_When_TypeSpecifierReExportWithOperation',
      code: `export const run = () => {}
` +
        `export { type Command } from './command.js'`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Pass_When_TypeStarReExportWithOperation',
      code: `export const run = () => {}
` +
        `export type * from './types.js'`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Pass_When_LocalValueSpecifierAndOperation',
      code: `const value = 1
` +
        `export { value }
` +
        `export const run = () => {}`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Pass_When_OperationWithDepsTagLayerAndTypesTogether',
      code:
        `export class ConfirmOrderExecutorDeps extends Context.Tag('ConfirmOrderExecutorDeps')<ConfirmOrderExecutorDeps, { capture: Gateway['Type']['capture'] }>() {}\n` +
        `const live = Layer.succeed(ConfirmOrderExecutorDeps, { capture: gateway.capture })\n` +
        `export { live as ConfirmOrderLive }\n` +
        `export type Command = { orderId: string }\n` +
        `export interface Result { readonly ok: true }\n` +
        `export const confirmOrder = (cmd: Command): Effect.Effect<Result, never, ConfirmOrderExecutorDeps> => Effect.succeed({ ok: true })`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Pass_When_OperationWithContextGenericTagValueAndLayer',
      code: `const Deps = Context.GenericTag<Deps, Deps>('Deps')\n` +
        `const live = Layer.succeed(Deps, { value: 1 })\n` +
        `export { Deps, live }\n` +
        `export const run = () => Effect.succeed(1)`,
      filename: 'run.executor.ts',
    },
    {
      name: 'Should_Pass_When_OperationWithEffectTagClassAndLayer',
      code: `export class Deps extends Effect.Tag('Deps')<Deps, {}>() {}\n` +
        `const live = Layer.succeed(Deps, {})\n` +
        `export { live }\n` +
        `export const run = () => Effect.succeed(1)`,
      filename: 'run.executor.ts',
    },
    {
      name: 'Should_Pass_When_LocalFunctionSpecifierReExportingOneFunction',
      code: `function confirmOrder(cmd) { return Effect.succeed(result) }; export { confirmOrder }`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Pass_When_LocalFunctionExpressionSpecifierExportsOneFunction',
      code: `const confirmOrder = function() {}; export { confirmOrder }`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Pass_When_DefaultLocalFunctionDeclarationExportsOneFunction',
      code: `function confirmOrder() {}; export default confirmOrder`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Pass_When_DefaultLocalFunctionExpressionExportsOneFunction',
      code: `const confirmOrder = function() {}; export default confirmOrder`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Pass_When_OperationWithTypeSpecifierExport',
      code: `type Command = {}; export { type Command }; export const run = () => {}`,
      filename: 'run.executor.ts',
    },
    {
      name: 'Should_Pass_When_TypeOnlyReExportFromAnotherModule',
      code: `export const confirmOrder = () => Effect.succeed(1)\n` +
        `export type { Command } from './command.js'`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Pass_When_NonExecutorFile_HasManyFunctionExports',
      code:
        `export function a() {} export function b() {} export function c() {} export function d() {} export function e() {}`,
      filename: 'confirm-order.workflow.ts',
    },
    {
      name: 'Should_Pass_When_NonExecutorFile_HasNoFunctionExports',
      code: `export const x = 1; export const y = 2`,
      filename: 'confirm-order.handler.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_TwoEffectFnExports',
      code: `export const confirmOrder = Effect.fn('confirmOrder')(function* () {})\n` +
        `export const helper = Effect.fn('helper')(function* () {})`,
      filename: 'confirm-order.executor.ts',
      errors: [{ messageId: 'tooManyFunctionExports', data: { ...data, actual: '2 function exports' } }],
    },
    {
      name: 'Should_Report_ZeroFunctionExports_When_EffectFnIsAliased',
      code: `export const confirmOrder = E.fn('confirmOrder')(function* () {})`,
      filename: 'confirm-order.executor.ts',
      errors: [{ messageId: 'tooManyFunctionExports', data: { ...data, actual: '0 function exports' } }],
    },
    {
      name: 'Should_Report_ZeroFunctionExports_When_EffectFnIsComputed',
      code: `export const confirmOrder = Effect['fn']('confirmOrder')(function* () {})`,
      filename: 'confirm-order.executor.ts',
      errors: [{ messageId: 'tooManyFunctionExports', data: { ...data, actual: '0 function exports' } }],
    },
    {
      name: 'Should_Report_ZeroFunctionExports_When_NonFnEffectCombinatorIsExported',
      code: `export const confirmOrder = Effect.succeed(1)`,
      filename: 'confirm-order.executor.ts',
      errors: [{ messageId: 'tooManyFunctionExports', data: { ...data, actual: '0 function exports' } }],
    },
    {
      name: 'Should_Report_TwoArrowExports',
      code: `export const confirmOrder = (cmd) => Effect.succeed(result); export const helper = () => {}`,
      filename: 'confirm-order.executor.ts',
      errors: [{ messageId: 'tooManyFunctionExports', data: { ...data, actual: '2 function exports' } }],
    },
    {
      name: 'Should_Report_ArrowAndFunctionDeclaration',
      code: `export const confirmOrder = () => {}; export function helper() {}`,
      filename: 'confirm-order.executor.ts',
      errors: [{ messageId: 'tooManyFunctionExports', data: { ...data, actual: '2 function exports' } }],
    },
    {
      name: 'Should_Report_ThreeArrowExports',
      code: `export const a = () => {}; export const b = () => {}; export const confirmOrder = () => {}`,
      filename: 'confirm-order.executor.ts',
      errors: [{ messageId: 'tooManyFunctionExports', data: { ...data, actual: '3 function exports' } }],
    },
    {
      name: 'Should_Report_TwoFunctionsInOneVariableDeclaration',
      code: `export const confirmOrder = () => {}, helper = function() {}`,
      filename: 'confirm-order.executor.ts',
      errors: [{ messageId: 'tooManyFunctionExports', data: { ...data, actual: '2 function exports' } }],
    },
    {
      name: 'Should_Report_NonFunctionThenTwoFunctionsInVariableDeclaration',
      code: `export const value = 1, confirmOrder = () => {}, helper = function() {}`,
      filename: 'confirm-order.executor.ts',
      errors: [{ messageId: 'tooManyFunctionExports', data: { ...data, actual: '2 function exports' } }],
    },
    {
      name: 'Should_Report_FunctionDeclarationAndSpecifierHelpers',
      code:
        `export function confirmOrder() {}; const helperA = () => {}; const helperB = () => {}; export { helperA, helperB }`,
      filename: 'confirm-order.executor.ts',
      errors: [{ messageId: 'tooManyFunctionExports', data: { ...data, actual: '3 function exports' } }],
    },
    {
      name: 'Should_Report_ArrowAndDefaultExportOfSameFunction',
      code: `export const confirmOrder = () => {}; export default confirmOrder`,
      filename: 'confirm-order.executor.ts',
      errors: [{ messageId: 'tooManyFunctionExports', data: { ...data, actual: '2 function exports' } }],
    },
    {
      name: 'Should_Report_ThreeExports_When_NamedFunctionDeclarationAndSpecifierAndArrow',
      code: `export function helper() {}; export { helper }; export const confirmOrder = () => {}`,
      filename: 'confirm-order.executor.ts',
      errors: [{ messageId: 'tooManyFunctionExports', data: { ...data, actual: '3 function exports' } }],
    },
    {
      name: 'Should_Report_DefaultFunctionExpressionAndOperation',
      code: `export default function() {}; export const confirmOrder = () => {}`,
      filename: 'confirm-order.executor.ts',
      errors: [{ messageId: 'tooManyFunctionExports', data: { ...data, actual: '2 function exports' } }],
    },
    {
      name: 'Should_Report_DefaultNamedFunctionAndOperation',
      code: `export default function helper() {}; export const confirmOrder = () => {}`,
      filename: 'confirm-order.executor.ts',
      errors: [{ messageId: 'tooManyFunctionExports', data: { ...data, actual: '2 function exports' } }],
    },
    {
      name: 'Should_Report_DefaultLocalFunctionExpressionAndOperation',
      code: `const helper = function() {}; export default helper; export const confirmOrder = () => {}`,
      filename: 'confirm-order.executor.ts',
      errors: [{ messageId: 'tooManyFunctionExports', data: { ...data, actual: '2 function exports' } }],
    },
    {
      name: 'Should_Report_ExportedClassNamedLikeLocalFunctionAndOperation',
      code: `class Helper {}; export { Helper }; export const confirmOrder = () => {}; export const second = () => {}`,
      filename: 'confirm-order.executor.ts',
      errors: [{ messageId: 'tooManyFunctionExports', data: { ...data, actual: '2 function exports' } }],
    },
    {
      name: 'Should_Report_ZeroFunctionExports_When_OnlyTagLayerAndTypes',
      code: `export class Deps extends Context.Tag('Deps')<Deps, {}>() {}\n` +
        `const live = Layer.succeed(Deps, {})\n` +
        `export { live }\n` +
        `export type Command = { orderId: string }`,
      filename: 'confirm-order.executor.ts',
      errors: [{ messageId: 'tooManyFunctionExports', data: { ...data, actual: '0 function exports' } }],
    },
    {
      name: 'Should_Report_When_DefaultExportsALocalValue',
      code: `const value = 1
` +
        `export default value`,
      filename: 'confirm-order.executor.ts',
      errors: [{ messageId: 'tooManyFunctionExports', data: { ...data, actual: '0 function exports' } }],
    },
    {
      name: 'Should_Report_TwoArrowExports_AtFirstExport_When_ValueExportPrecedes',
      code: `export const value = 1
` +
        `export const a = () => {}
` +
        `export const b = () => {}`,
      filename: 'confirm-order.executor.ts',
      errors: [{ messageId: 'tooManyFunctionExports', data: { ...data, actual: '2 function exports' }, line: 2 }],
    },
    {
      name: 'Should_Report_ZeroFunctionExports_When_OnlyAClass',
      code: `export class Result {}`,
      filename: 'confirm-order.executor.ts',
      errors: [{ messageId: 'tooManyFunctionExports', data: { ...data, actual: '0 function exports' } }],
    },
    {
      name: 'Should_Report_ZeroFunctionExports_When_OnlyAValue',
      code: `export const value = 1`,
      filename: 'confirm-order.executor.ts',
      errors: [{ messageId: 'tooManyFunctionExports', data: { ...data, actual: '0 function exports' } }],
    },
    {
      name: 'Should_Report_When_ExportAllDeclarationAdded',
      code: `export const confirmOrder = () => Effect.succeed(1)\n` +
        `export * from './sibling.executor.js'`,
      filename: 'confirm-order.executor.ts',
      errors: [{ messageId: 'tooManyFunctionExports', data: { ...data, actual: '2 function exports' } }],
    },
    {
      name: 'Should_Report_When_CrossModuleSpecifierReExportAdded',
      code: `export const confirmOrder = () => Effect.succeed(1)\n` +
        `export { helper } from './helpers.js'`,
      filename: 'confirm-order.executor.ts',
      errors: [{ messageId: 'tooManyFunctionExports', data: { ...data, actual: '2 function exports' } }],
    },
  ],
})
