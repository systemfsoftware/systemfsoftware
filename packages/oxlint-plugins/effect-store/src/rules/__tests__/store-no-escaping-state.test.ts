import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { storeNoEscapingState } from '../store-no-escaping-state.js'

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

const mutableBindingError = (name: string, kind: 'let' | 'var') => ({
  messageId: 'mutableModuleBinding',
  data: {
    name,
    expected: 'a store stateless across invocations',
    actual: `a module-level ${kind} binding`,
    fix:
      'keep the persistence leaf stateless — move caches and registries to a *.state.ts cell received as a dependency',
  },
})

const moduleLevelCollectionError = (name: string, constructor: string) => ({
  messageId: 'moduleLevelCollection',
  data: {
    name,
    expected: 'a store stateless across invocations',
    actual: `a module-level ${constructor}`,
    fix:
      'keep the persistence leaf stateless — move caches and registries to a *.state.ts cell received as a dependency',
  },
})

ruleTester.run('store-no-escaping-state', storeNoEscapingState, {
  valid: [
    {
      name: 'Should_Pass_When_Module_Level_Const_Is_Immutable',
      code: `const PAGE_SIZE = 50\n`,
      filename: 'order.store.ts',
    },
    {
      name: 'Should_Pass_When_Module_Level_Const_Is_A_Schema_Value',
      code: `import { Schema as S } from 'effect/Schema'
const Options = S.Struct({})\n`,
      filename: 'order.store.ts',
    },
    {
      name: 'Should_Pass_When_Module_Level_Const_Is_A_Function',
      code: `const mapError = (cause: unknown) => new OrderStoreError({ reason: 'driver_failure', cause })\n`,
      filename: 'order.store.ts',
    },
    {
      name: 'Should_Pass_When_Let_Is_Function_Local',
      code: `export const run = Effect.fn(function* () {
  let count = 0
  count = count + 1
  return count
})\n`,
      filename: 'order.store.ts',
    },
    {
      name: 'Should_Pass_When_Map_Is_Function_Local',
      code: `export const run = Effect.fn(function* () {
  const seen = new Map()
  return seen.size
})\n`,
      filename: 'order.store.ts',
    },
    {
      name: 'Should_Pass_When_Module_Level_Const_Is_Exported_Value',
      code: `export const MAX_BATCH_SIZE = 50\n`,
      filename: 'order.store.ts',
    },
    {
      name: 'Should_Pass_When_Exported_Const_Has_No_Initializer',
      code: `export declare const query: string\n`,
      filename: 'order.store.ts',
    },
    {
      name: 'Should_Pass_When_Export_Specifier_Has_No_Declaration',
      code: `const findOrder = 1\nexport { findOrder }\n`,
      filename: 'order.store.ts',
    },
    {
      name: 'Should_Ignore_Module_State_When_File_Is_Not_A_Store',
      code: `let counter = 0
const cache = new Map()\n`,
      filename: 'order.executor.ts',
    },
    {
      name: 'Should_Ignore_Module_State_When_File_Is_A_State_Cell',
      code: `let counter = 0\n`,
      filename: 'dedupe.state.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_MutableModuleBinding_When_Module_Level_Let',
      code: `let cache: Record<string, number> = {}\n`,
      filename: 'order.store.ts',
      errors: [mutableBindingError('cache', 'let')],
    },
    {
      name: 'Should_Report_MutableModuleBinding_When_Module_Level_Var',
      code: `var registry: string[] = []\n`,
      filename: 'order.store.ts',
      errors: [mutableBindingError('registry', 'var')],
    },
    {
      name: 'Should_Report_MutableModuleBinding_When_Exported_Let',
      code: `export let lastRun = 0\n`,
      filename: 'order.store.ts',
      errors: [mutableBindingError('lastRun', 'let')],
    },
    {
      name: 'Should_Report_MutableModuleBinding_When_Destructured_Let',
      code: `let { a } = obj\n`,
      filename: 'order.store.ts',
      errors: [mutableBindingError('<destructured>', 'let')],
    },
    {
      name: 'Should_Report_ModuleLevelCollection_When_Module_Level_Map',
      code: `const cache = new Map()\n`,
      filename: 'order.store.ts',
      errors: [moduleLevelCollectionError('cache', 'Map')],
    },
    {
      name: 'Should_Report_ModuleLevelCollection_When_Module_Level_WeakSet',
      code: `const seen = new WeakSet()\n`,
      filename: 'order.store.ts',
      errors: [moduleLevelCollectionError('seen', 'WeakSet')],
    },
    {
      name: 'Should_Report_ModuleLevelCollection_When_Module_Level_Set',
      code: `const ids = new Set()\n`,
      filename: 'order.store.ts',
      errors: [moduleLevelCollectionError('ids', 'Set')],
    },
    {
      name: 'Should_Report_Both_When_Exported_Let_Map',
      code: `export let cache = new Map()\n`,
      filename: 'order.store.ts',
      errors: [mutableBindingError('cache', 'let'), moduleLevelCollectionError('cache', 'Map')],
    },
  ],
})
