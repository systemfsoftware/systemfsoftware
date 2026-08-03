import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { storeEffectFnRequired } from '../store-effect-fn-required.js'

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

const nonFnError = (name: string, actual: string) => ({
  messageId: 'nonFnExport',
  data: {
    name,
    expected: 'an exported Effect.fn-wrapped function — one per query or mutation, named for what it does',
    actual,
    fix:
      'wrap the query or mutation in Effect.fn(function* (...) {...}) so the store stays a module of named Effect.fn functions',
  },
})

ruleTester.run('store-effect-fn-required', storeEffectFnRequired, {
  valid: [
    {
      name: 'Should_Pass_When_Exported_Const_Is_EffectFn',
      code: `export const findOrder = Effect.fn(function* (id: OrderId) {
  const db = yield* DB
  return yield* Effect.tryPromise(() => db.select(id))
})\n`,
      filename: 'order.store.ts',
    },
    {
      name: 'Should_Pass_When_Exported_Const_Is_EffectFn_With_Plain_Function',
      code: `export const touch = Effect.fn(() => 1)\n`,
      filename: 'order.store.ts',
    },
    {
      name: 'Should_Pass_When_Export_Specifier_Reexports_A_Local_Fn',
      code: `const findOrder = Effect.fn(function* (id: OrderId) { return id })
export { findOrder }\n`,
      filename: 'order.store.ts',
    },
    {
      name: 'Should_Pass_When_Export_Specifier_From_Module_Is_Skipped',
      code: `export { saveOrder } from './order.store.js'\n`,
      filename: 'order.store.ts',
    },
    {
      name: 'Should_Pass_When_Exported_Type_Declarations_Exist',
      code: `export type OrderId = string
export interface OrderRow { readonly id: string }
export class OrderStoreError { readonly reason!: string }\n`,
      filename: 'order.store.ts',
    },
    {
      name: 'Should_Pass_When_Exported_Const_Is_A_NonFunction_Value',
      code: `export const MAX_BATCH_SIZE = 50\n`,
      filename: 'order.store.ts',
    },
    {
      name: 'Should_Pass_When_Exported_Const_Is_An_Identifier_Reference',
      code: `const findOrder = Effect.fn(function* (id: OrderId) { return id })
export const findOrderAlias = findOrder\n`,
      filename: 'order.store.ts',
    },
    {
      name: 'Should_Pass_When_Export_Default_Is_EffectFn',
      code: `export default Effect.fn(function* (id: OrderId) { return id })\n`,
      filename: 'order.store.ts',
    },
    {
      name: 'Should_Pass_When_Curried_EffectFn_Form_Is_Used',
      code: `export const findOrder = Effect.fn()(function* (id: OrderId) { return id })\n`,
      filename: 'order.store.ts',
    },
    {
      name: 'Should_Pass_When_Aliased_Effect_Namespace_Is_Used',
      code: `import * as E from 'effect/Effect'
export const findOrder = E.fn(function* (id: OrderId) { return id })\n`,
      filename: 'order.store.ts',
    },
    {
      name: 'Should_Pass_When_Exported_Const_Has_No_Initializer',
      code: `export declare const orderQuery: string\n`,
      filename: 'order.store.ts',
    },
    {
      name: 'Should_Ignore_Plain_Exports_When_File_Is_Not_A_Store',
      code: `export const findOrder = (id: OrderId) => id\n`,
      filename: 'order.executor.ts',
    },
    {
      name: 'Should_Ignore_Plain_Exports_When_File_Is_A_Handler',
      code: `export async function onRequest(req: Request) { return req }\n`,
      filename: 'order.handler.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_NonFnExport_When_Exported_Arrow_Is_Not_EffectFn',
      code: `export const findOrder = (id: OrderId) => Effect.tryPromise(() => db.select(id))\n`,
      filename: 'order.store.ts',
      errors: [nonFnError('findOrder', 'an exported function not wrapped in Effect.fn')],
    },
    {
      name: 'Should_Report_NonFnExport_When_Exported_Function_Declaration',
      code: `export function findOrder(id: OrderId) { return Effect.succeed(id) }\n`,
      filename: 'order.store.ts',
      errors: [nonFnError('findOrder', 'an exported function not wrapped in Effect.fn')],
    },
    {
      name: 'Should_Report_NonFnExport_When_Exported_Async_Function',
      code: `export async function saveOrder(decision: OrderDecision) { return decision }\n`,
      filename: 'order.store.ts',
      errors: [nonFnError('saveOrder', 'an exported function not wrapped in Effect.fn')],
    },
    {
      name: 'Should_Report_NonFnExport_When_Exported_Function_Expression',
      code: `export const findOrder = function (id: OrderId) { return id }\n`,
      filename: 'order.store.ts',
      errors: [nonFnError('findOrder', 'an exported function not wrapped in Effect.fn')],
    },
    {
      name: 'Should_Report_NonFnExport_When_Exported_EffectGen',
      code: `export const findOrder = Effect.gen(function* (id: OrderId) { return id })\n`,
      filename: 'order.store.ts',
      errors: [nonFnError('findOrder', 'an exported Effect value not built with Effect.fn')],
    },
    {
      name: 'Should_Report_NonFnExport_When_Exported_EffectSync',
      code: `export const version = Effect.sync(() => '1')\n`,
      filename: 'order.store.ts',
      errors: [nonFnError('version', 'an exported Effect value not built with Effect.fn')],
    },
    {
      name: 'Should_Report_NonFnExport_When_Computed_EffectFn_Is_Used',
      code: `export const findOrder = Effect['fn'](function* (id: OrderId) { return id })\n`,
      filename: 'order.store.ts',
      errors: [nonFnError('findOrder', 'an exported Effect value not built with Effect.fn')],
    },
    {
      name: 'Should_Report_NonFnExport_When_Destructured_Export_Is_EffectGen',
      code: `export const { a } = Effect.gen(function* () { return { a: 1 } })\n`,
      filename: 'order.store.ts',
      errors: [nonFnError('<destructured>', 'an exported Effect value not built with Effect.fn')],
    },
    {
      name: 'Should_Report_NonFnExport_When_Default_Export_Is_A_Plain_Function',
      code: `export default function (id: OrderId) { return id }\n`,
      filename: 'order.store.ts',
      errors: [nonFnError('<default>', 'an exported function not wrapped in Effect.fn')],
    },
    {
      name: 'Should_Report_NonFnExport_When_Named_Default_Export_Is_Not_EffectFn',
      code: `export default function findOrder() { return 1 }\n`,
      filename: 'order.store.ts',
      errors: [nonFnError('findOrder', 'an exported function not wrapped in Effect.fn')],
    },
    {
      name: 'Should_Report_NonFnExport_When_Default_Export_Is_EffectGen',
      code: `export default Effect.gen(function* () { return 1 })\n`,
      filename: 'order.store.ts',
      errors: [nonFnError('<default>', 'an exported Effect value not built with Effect.fn')],
    },
  ],
})
