import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import {
  ESCAPING_STATE_EXPECTED,
  MODULE_LEVEL_LET_FIX,
  MUTABLE_MODULE_CONSTANT_FIX,
} from '../observer-no-escaping-state.config.js'
import { observerNoEscapingState } from '../observer-no-escaping-state.js'

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

const letError = (kind: 'let' | 'var') => ({
  messageId: 'moduleLevelLet',
  data: {
    name: kind,
    expected: ESCAPING_STATE_EXPECTED,
    actual: `a module-level ${kind} binding`,
    fix: MODULE_LEVEL_LET_FIX,
  },
})

const constError = (name: string, container: string) => ({
  messageId: 'mutableModuleConstant',
  data: {
    name,
    expected: ESCAPING_STATE_EXPECTED,
    actual: `a module-level const holding a mutable ${container}`,
    fix: MUTABLE_MODULE_CONSTANT_FIX,
  },
})

ruleTester.run('observer-no-escaping-state', observerNoEscapingState, {
  valid: [
    {
      name: 'Should_Pass_When_StateIsInsideFunction',
      code: `export const run = () => { let counter = 0; return counter }`,
      filename: 'step-harness.observer.ts',
    },
    {
      name: 'Should_Pass_When_ContainerIsInsideFunction',
      code: `export const run = () => { const cache = new Map(); return cache.size }`,
      filename: 'step-harness.observer.ts',
    },
    {
      name: 'Should_Pass_When_ModuleConstIsPrimitive',
      code: `const STEP_TIMEOUT_MS = 5000`,
      filename: 'step-harness.observer.ts',
    },
    {
      name: 'Should_Pass_When_ModuleConstIsFunctionCall',
      code: `export const runSteps = makeRunner()`,
      filename: 'step-harness.observer.ts',
    },
    {
      name: 'Should_Pass_When_ModuleConstIsFrozen',
      code: `const DEFAULTS = Object.freeze({ timeout: 1000 })`,
      filename: 'step-harness.observer.ts',
    },
    {
      name: 'Should_Pass_When_ModuleConstIsFrozenContainer',
      code: `const registry = Object.freeze(new Map())`,
      filename: 'step-harness.observer.ts',
    },
    {
      name: 'Should_Pass_When_ModuleConstHasNoInitializer',
      code: `declare const registry: Map<string, number>`,
      filename: 'step-harness.observer.ts',
    },
    {
      name: 'Should_Pass_When_ModuleConstIsTemplateLiteral',
      code: 'const NAME = `harness`',
      filename: 'step-harness.observer.ts',
    },
    {
      name: 'Should_Pass_When_ConstructingNonContainerClass',
      code: `const clock = new Date()`,
      filename: 'step-harness.observer.ts',
    },
    {
      name: 'Should_Pass_When_ConstructingMemberCallee',
      code: `const registry = new env.Map()`,
      filename: 'step-harness.observer.ts',
    },
    {
      name: 'Should_Pass_When_DestructuredContainerConst',
      code: `const [first] = new Set()`,
      filename: 'step-harness.observer.ts',
    },
    {
      name: 'Should_Pass_When_ModuleLetInNonObserverFile',
      code: `let counter = 0`,
      filename: 'cancel-order.workflow.ts',
    },
    {
      name: 'Should_Pass_When_ModuleContainerInNonObserverFile',
      code: `const registry = new Map()`,
      filename: 'order.executor.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_When_ModuleLevelLetBinding',
      code: `let counter = 0`,
      filename: 'step-harness.observer.ts',
      errors: [letError('let')],
    },
    {
      name: 'Should_Report_When_ModuleLevelVarBinding',
      code: `var counter = 0`,
      filename: 'step-harness.observer.ts',
      errors: [letError('var')],
    },
    {
      name: 'Should_Report_When_LetWithoutInitializer',
      code: `let counter: number`,
      filename: 'step-harness.observer.ts',
      errors: [letError('let')],
    },
    {
      name: 'Should_Report_When_ExportedLetBinding',
      code: `export let count = 0`,
      filename: 'step-harness.observer.ts',
      errors: [letError('let')],
    },
    {
      name: 'Should_Report_Once_When_LetHoldsContainer',
      code: `let registry = new Map()`,
      filename: 'step-harness.observer.ts',
      errors: [letError('let')],
    },
    {
      name: 'Should_Report_When_ModuleConstHoldsMap',
      code: `const registry = new Map()`,
      filename: 'step-harness.observer.ts',
      errors: [constError('registry', 'Map')],
    },
    {
      name: 'Should_Report_When_ModuleConstHoldsSet',
      code: `const seen = new Set()`,
      filename: 'step-harness.observer.ts',
      errors: [constError('seen', 'Set')],
    },
    {
      name: 'Should_Report_When_ModuleConstHoldsWeakMap',
      code: `const pending = new WeakMap()`,
      filename: 'step-harness.observer.ts',
      errors: [constError('pending', 'WeakMap')],
    },
    {
      name: 'Should_Report_When_ModuleConstHoldsWeakSet',
      code: `const cleanup = new WeakSet()`,
      filename: 'step-harness.observer.ts',
      errors: [constError('cleanup', 'WeakSet')],
    },
    {
      name: 'Should_Report_When_ModuleConstHoldsArray',
      code: `const STEPS = []`,
      filename: 'step-harness.observer.ts',
      errors: [constError('STEPS', 'array')],
    },
    {
      name: 'Should_Report_When_ModuleConstHoldsObject',
      code: `const defaults = { timeout: 1000 }`,
      filename: 'step-harness.observer.ts',
      errors: [constError('defaults', 'object')],
    },
    {
      name: 'Should_Report_When_ExportedConstHoldsContainer',
      code: `export const registry = new Map()`,
      filename: 'step-harness.observer.ts',
      errors: [constError('registry', 'Map')],
    },
  ],
})
