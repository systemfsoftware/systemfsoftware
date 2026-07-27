import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { executorNoEscapingState } from '../executor-no-escaping-state.js'

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

const EXPECTED = 'an executor stateless across invocations'
const FIX = 'extract a *.state.ts cell behind a domain-typed surface and receive it as a dependency'

ruleTester.run('executor-no-escaping-state', executorNoEscapingState, {
  valid: [
    {
      name: 'Should_Allow_ConstLiteral_When_ExecutorFile',
      code: `const limit = 42`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Allow_ConstCall_When_ExecutorFile',
      code:
        `export const ConfirmOrderExecutor = Effect.fn('ConfirmOrderExecutor')(function*(orderId) { return orderId })`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Allow_NewDate_When_ExecutorFile',
      code: `const now = new Date()`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Allow_ArrayLiteral_When_ExecutorFile',
      code: `const ids = [1, 2, 3]`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Allow_LetInsideFunction_When_ExecutorFile',
      code: `export const run = (n) => { let acc = 0; for (let i = 0; i < n; i++) acc += i; return acc }`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Allow_VarInsideFunction_When_ExecutorFile',
      code: `export const run = () => { var seen = false; seen = true; return seen }`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Allow_NewMapInsideFunction_When_ExecutorFile',
      code: `export const run = () => { const cache = new Map(); cache.set('a', 1); return cache }`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Allow_NewMapInsideArrow_When_ExecutorFile',
      code: `export const run = () => () => { const cache = new Map(); return cache }`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Allow_TopLevelClass_When_ExecutorFile',
      code: `export class ConfirmOrder { go() { return 1 } }`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Allow_ExportedConstFunction_When_ExecutorFile',
      code: `export const helper = (x) => x + 1`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Allow_NewMapMemberExpression_When_ExecutorFile',
      code: `const cache = new Collections.Map()`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Allow_DeclaredConstWithoutInit_When_ExecutorFile',
      code: `declare const pending: number`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Ignore_TopLevelLet_When_HandlerFile',
      code: `let inFlight = 0`,
      filename: 'order.handler.ts',
    },
    {
      name: 'Should_Allow_SpecifierOnlyExport_When_ExecutorFile',
      code: `export { external } from './external'`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Allow_ImportedClass_When_ExecutorFile',
      code: `import { ImportedClass } from './shared'`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_Ignore_TopLevelLet_When_StateFile',
      code: `let inFlight = 0`,
      filename: 'dedupe.state.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_LetInFlight_When_ExecutorFile',
      code: `let inFlight = 0`,
      filename: 'confirm-order.executor.ts',
      errors: [
        {
          messageId: 'mutableModuleBinding',
          data: {
            name: 'inFlight',
            expected: EXPECTED,
            actual: 'a module-level let binding',
            fix: FIX,
          },
        },
      ],
    },
    {
      name: 'Should_Report_VarSeen_When_ExecutorFile',
      code: `var seen = false`,
      filename: 'confirm-order.executor.ts',
      errors: [
        {
          messageId: 'mutableModuleBinding',
          data: {
            name: 'seen',
            expected: EXPECTED,
            actual: 'a module-level var binding',
            fix: FIX,
          },
        },
      ],
    },
    {
      name: 'Should_Report_ExportedLetCounter_When_ExecutorFile',
      code: `export let counter = 0`,
      filename: 'confirm-order.executor.ts',
      errors: [
        {
          messageId: 'mutableModuleBinding',
          data: {
            name: 'counter',
            expected: EXPECTED,
            actual: 'a module-level let binding',
            fix: FIX,
          },
        },
      ],
    },
    {
      name: 'Should_Report_ConstMap_When_ExecutorFile',
      code: `const cache = new Map()`,
      filename: 'confirm-order.executor.ts',
      errors: [
        {
          messageId: 'moduleLevelCollection',
          data: {
            name: 'cache',
            expected: EXPECTED,
            actual: 'a module-level Map',
            fix: FIX,
          },
        },
      ],
    },
    {
      name: 'Should_Report_ConstSet_When_ExecutorFile',
      code: `const seen = new Set()`,
      filename: 'confirm-order.executor.ts',
      errors: [
        {
          messageId: 'moduleLevelCollection',
          data: {
            name: 'seen',
            expected: EXPECTED,
            actual: 'a module-level Set',
            fix: FIX,
          },
        },
      ],
    },
    {
      name: 'Should_Report_ConstWeakMap_When_ExecutorFile',
      code: `const weak = new WeakMap()`,
      filename: 'confirm-order.executor.ts',
      errors: [
        {
          messageId: 'moduleLevelCollection',
          data: {
            name: 'weak',
            expected: EXPECTED,
            actual: 'a module-level WeakMap',
            fix: FIX,
          },
        },
      ],
    },
    {
      name: 'Should_Report_ConstWeakSet_When_ExecutorFile',
      code: `const weakSet = new WeakSet()`,
      filename: 'confirm-order.executor.ts',
      errors: [
        {
          messageId: 'moduleLevelCollection',
          data: {
            name: 'weakSet',
            expected: EXPECTED,
            actual: 'a module-level WeakSet',
            fix: FIX,
          },
        },
      ],
    },
    {
      name: 'Should_Report_ExportedConstMap_When_ExecutorFile',
      code: `export const cache = new Map()`,
      filename: 'confirm-order.executor.ts',
      errors: [
        {
          messageId: 'moduleLevelCollection',
          data: {
            name: 'cache',
            expected: EXPECTED,
            actual: 'a module-level Map',
            fix: FIX,
          },
        },
      ],
    },
    {
      name: 'Should_Report_BothMutableAndMap_When_LetNewMap',
      code: `let cache = new Map()`,
      filename: 'confirm-order.executor.ts',
      errors: [
        {
          messageId: 'mutableModuleBinding',
          data: {
            name: 'cache',
            expected: EXPECTED,
            actual: 'a module-level let binding',
            fix: FIX,
          },
        },
        {
          messageId: 'moduleLevelCollection',
          data: {
            name: 'cache',
            expected: EXPECTED,
            actual: 'a module-level Map',
            fix: FIX,
          },
        },
      ],
    },
    {
      name: 'Should_Report_OncePerDeclarator_When_LetWithMultipleDeclarators',
      code: `let a = 1, b = 2`,
      filename: 'confirm-order.executor.ts',
      errors: [
        {
          messageId: 'mutableModuleBinding',
          data: {
            name: 'a',
            expected: EXPECTED,
            actual: 'a module-level let binding',
            fix: FIX,
          },
        },
        {
          messageId: 'mutableModuleBinding',
          data: {
            name: 'b',
            expected: EXPECTED,
            actual: 'a module-level let binding',
            fix: FIX,
          },
        },
      ],
    },
    {
      name: 'Should_Report_DestructuredName_When_LetObjectPattern',
      code: `let { a, b } = x`,
      filename: 'confirm-order.executor.ts',
      errors: [
        {
          messageId: 'mutableModuleBinding',
          data: {
            name: '<destructured>',
            expected: EXPECTED,
            actual: 'a module-level let binding',
            fix: FIX,
          },
        },
      ],
    },
  ],
})
