import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import {
  COLLECTION_ACTUAL_OF,
  COLLECTION_FIX,
  EXPECTED,
  MUTATED_LITERAL_ACTUAL_OF,
  MUTATED_LITERAL_FIX,
  REBINDING_ACTUAL,
  REBINDING_FIX,
  REF_ACTUAL,
  REF_FIX,
} from '../kind-file-holds-no-module-state.config.js'
import { kindFileHoldsNoModuleState } from '../kind-file-holds-no-module-state.js'
import {
  CONTAINER_BLUEPRINT,
  CONTAINER_BLUEPRINT_FILENAME,
  RUNNING_CONTAINER_HANDLE,
  RUNNING_CONTAINER_HANDLE_FILENAME,
} from './_canonical-fixtures.js'

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

const stateError = (name: string, actual: string, fix: string) => ({
  messageId: 'moduleState' as const,
  data: { name, expected: EXPECTED, actual, fix },
})

ruleTester.run('kind-file-holds-no-module-state', kindFileHoldsNoModuleState, {
  valid: [
    {
      name: 'Should_Pass_When_ABlueprintModuleHoldsOnlyImmutableDefinitions',
      code: `import { Blueprint } from '@systemfsoftware/effect-cell-types'
export const TypeId = Symbol.for('~example/shop/Container')
const Container = Blueprint.make<string>()(TypeId).steps({ steps: {}, targets: {} })
export const make = (image: string) => Container.of(image)`,
      filename: '/repo/packages/shop/src/container.blueprint.ts',
    },
    {
      name: 'Should_Pass_When_AHandleModuleHoldsOnlyImmutableDefinitions',
      code: `import { Handle } from '@systemfsoftware/effect-cell-types'
export const TypeId = Symbol.for('~example/shop/RunningContainer')
const RunningContainer = Handle.make<{ readonly id: string }>()(TypeId)
export type RunningContainer = Handle.Of<typeof RunningContainer>
export const isRunningContainer = RunningContainer.is`,
      filename: '/repo/packages/shop/src/running-container.handle.ts',
    },
    {
      name: 'Should_Pass_When_TheCanonicalContainerFixtureHoldsNoModuleState',
      code: CONTAINER_BLUEPRINT,
      filename: CONTAINER_BLUEPRINT_FILENAME,
    },
    {
      name: 'Should_Pass_When_TheCanonicalRunningContainerFixtureHoldsNoModuleState',
      code: RUNNING_CONTAINER_HANDLE,
      filename: RUNNING_CONTAINER_HANDLE_FILENAME,
    },
    {
      name: 'Should_Pass_When_ModuleConstsStayUnmutated',
      code: `const DEFAULTS = { timeoutMs: 30_000, pollMs: 250 } as const
export const withTimeout = (timeoutMs: number) => ({ ...DEFAULTS, timeoutMs })`,
      filename: '/repo/packages/shop/src/gate.blueprint.ts',
    },
    {
      name: 'Should_Pass_When_CollectionsAndRefsAreMintedInsideOperations',
      code: `import * as Effect from 'effect/Effect'
import * as Ref from 'effect/Ref'
export const make = (limit: number) =>
  Effect.suspend(() => Effect.map(Ref.make(0), (count) => ({ count, leases: new WeakMap() as WeakMap<string, number>, limit })))`,
      filename: '/repo/packages/shop/src/pool.handle.ts',
    },
    {
      name: 'Should_Pass_When_ARebindingSitsInsideAFunction',
      code: `export const once = (input: string) => {
  let seen: string | null = null
  seen = input
  return seen
}`,
      filename: '/repo/packages/shop/src/gate.blueprint.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_When_ABlueprintFileHoldsAModuleLevelLet',
      code: `export let leases = 0`,
      filename: '/repo/packages/shop/src/pool.blueprint.ts',
      errors: [stateError('leases', REBINDING_ACTUAL, REBINDING_FIX)],
    },
    {
      name: 'Should_Report_When_ABlueprintFileHoldsAModuleLevelVar',
      code: `export var attempts = 0`,
      filename: '/repo/packages/shop/src/gate.blueprint.ts',
      errors: [stateError('attempts', REBINDING_ACTUAL, REBINDING_FIX)],
    },
    {
      name: 'Should_Report_When_AHandleFileHoldsAModuleLevelWeakMap',
      code: `const cache = new WeakMap()`,
      filename: '/repo/packages/shop/src/probe.handle.ts',
      errors: [stateError('cache', COLLECTION_ACTUAL_OF('new WeakMap()'), COLLECTION_FIX)],
    },
    {
      name: 'Should_Report_When_ABlueprintFileHoldsAModuleLevelRef',
      code: `import * as Ref from 'effect/Ref'
const open = Ref.make(false)`,
      filename: '/repo/packages/shop/src/gate.blueprint.ts',
      errors: [stateError('open', REF_ACTUAL, REF_FIX)],
    },
    {
      name: 'Should_Report_When_ANamespacedMutableRefIsMintedAtModuleLevel',
      code: `import { MutableRef } from 'effect'
const drivers = MutableRef.make([] as const)`,
      filename: '/repo/packages/shop/src/pool.handle.ts',
      errors: [stateError('drivers', REF_ACTUAL, REF_FIX)],
    },
    {
      name: 'Should_Report_When_AModuleLevelArrayIsPushedLater',
      code: `const pending: Array<string> = []
export const enqueue = (item: string): void => {
  pending.push(item)
}`,
      filename: '/repo/packages/shop/src/pool.blueprint.ts',
      errors: [stateError('pending', MUTATED_LITERAL_ACTUAL_OF('pending.push() is called'), MUTATED_LITERAL_FIX)],
    },
    {
      name: 'Should_Report_When_AModuleLevelObjectIsAssignedLater',
      code: `const flags: Record<string, boolean> = {}
export const arm = (name: string): void => {
  flags[name] = true
}`,
      filename: '/repo/packages/shop/src/gate.handle.ts',
      errors: [stateError('flags', MUTATED_LITERAL_ACTUAL_OF('flags is assigned'), MUTATED_LITERAL_FIX)],
    },
  ],
})
