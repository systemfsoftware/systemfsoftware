import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import {
  EXPECTED,
  PROTOTYPE_ACTUAL,
  PROTOTYPE_FIX,
  TYPEID_KEY_ACTUAL,
  TYPEID_KEY_FIX,
} from '../kind-record-minted-by-kind.config.js'
import { kindRecordMintedByKind } from '../kind-record-minted-by-kind.js'
import {
  CONTAINER_RESOURCE,
  CONTAINER_RESOURCE_FILENAME,
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

const prototypeError = {
  messageId: 'prototypeSpread' as const,
  data: { name: 'a hand-rolled kind record', expected: EXPECTED, actual: PROTOTYPE_ACTUAL, fix: PROTOTYPE_FIX },
}

const typeIdKeyError = {
  messageId: 'typeIdKey' as const,
  data: { name: 'a hand-rolled kind record', expected: EXPECTED, actual: TYPEID_KEY_ACTUAL, fix: TYPEID_KEY_FIX },
}

const PRE_MIGRATION_RUNNING_VM_MAKE = `import { Effect, Option, Predicate, Stream } from 'effect'
import * as Arr from 'effect/Array'
import { dual } from 'effect/Function'
import { type Pipeable, Prototype } from 'effect/Pipeable'
import type { Sandbox } from 'microsandbox'
import type { PortBinding } from './render-sandbox-plan.schema.js'

export const TypeId = Symbol.for('~systemfsoftware/microvm/RunningVM')
const SandboxTypeId: unique symbol = Symbol.for('~systemfsoftware/microvm/RunningVM/sandbox')

export type TypeId = typeof TypeId
export const make = (options: {
  readonly name: string
  readonly portBindings: ReadonlyArray<PortBinding>
  readonly sandbox: Sandbox
}): RunningVM => ({
  [TypeId]: TypeId,
  [SandboxTypeId]: options.sandbox,
  name: options.name,
  portBindings: options.portBindings,
  ...Prototype,
})`

const PRE_MIGRATION_OPEN_FILE_MAKE = `import { Effect, Ref } from 'effect'
import { type Pipeable, Prototype } from 'effect/Pipeable'

export const TypeId = Symbol.for('~systemfsoftware/memfs/OpenFile')
export type TypeId = typeof TypeId

const DriverId: unique symbol = Symbol.for('~systemfsoftware/memfs/OpenFile/driver')
const CursorId: unique symbol = Symbol.for('~systemfsoftware/memfs/OpenFile/cursor')

export const make = (driver: Driver): Effect.Effect<OpenFile> =>
  Effect.map(Ref.make(0n), (cursor) => ({
    [TypeId]: TypeId,
    [DriverId]: driver,
    [CursorId]: cursor,
    fd: driver.fd,
    ...Prototype,
  }))`

ruleTester.run('kind-record-minted-by-kind', kindRecordMintedByKind, {
  valid: [
    {
      name: 'Should_Pass_When_TheCanonicalContainerFixtureMintsThroughTheKind',
      code: CONTAINER_RESOURCE,
      filename: CONTAINER_RESOURCE_FILENAME,
    },
    {
      name: 'Should_Pass_When_TheCanonicalRunningContainerFixtureMintsThroughTheKind',
      code: RUNNING_CONTAINER_HANDLE,
      filename: RUNNING_CONTAINER_HANDLE_FILENAME,
    },
    {
      name: 'Should_Pass_When_AResourceModuleHoldsNoHandRolledRecord',
      code: `import { Resource } from '@systemfsoftware/effect-cell-types'
export const TypeId = Symbol.for('~example/shop/Container')
const Container = Resource.make<string>()({ typeId: TypeId, combinators: {}, projections: {} })
export const make = (image: string) => Container.of(image)`,
      filename: '/repo/packages/shop/src/container.resource.ts',
    },
    {
      name: 'Should_Pass_When_AHandleModuleHoldsNoHandRolledRecord',
      code: `import { Handle } from '@systemfsoftware/effect-cell-types'
export const TypeId = Symbol.for('~example/shop/RunningContainer')
const RunningContainer = Handle.make<{ readonly id: string }>()(TypeId)
export type RunningContainer = Handle.Of<typeof RunningContainer>
export const isRunningContainer = RunningContainer.is`,
      filename: '/repo/packages/shop/src/running-container.handle.ts',
    },
    {
      name: 'Should_Pass_When_ObjectLiteralsCarryNoPrototypeOrSymbolKeys',
      code: `const DEFAULTS = { timeoutMs: 30_000 } as const
export const ready = { ...DEFAULTS, ready: true }
export const keyed = { ['region']: 'us' }`,
      filename: '/repo/packages/shop/src/gate.resource.ts',
    },
    {
      name: 'Should_Pass_When_ANonKindFileRollsItsOwnRecord',
      code: `import { Prototype } from 'effect/Pipeable'
export const rolled = { ...Prototype }`,
      filename: '/repo/packages/shop/src/device.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_When_ThePreMigrationRunningVMMintsItsOwnRecord',
      code: PRE_MIGRATION_RUNNING_VM_MAKE,
      filename: '/repo/packages/effect-microsandbox/src/running-vm.handle.ts',
      errors: [typeIdKeyError, typeIdKeyError, prototypeError],
    },
    {
      name: 'Should_Report_When_ThePreMigrationOpenFileMintsItsOwnRecord',
      code: PRE_MIGRATION_OPEN_FILE_MAKE,
      filename: '/repo/packages/effect-memfs/src/open-file.handle.ts',
      errors: [typeIdKeyError, typeIdKeyError, typeIdKeyError, prototypeError],
    },
    {
      name: 'Should_Report_When_ANamespacedPrototypeIsSpread',
      code: `import * as Pipeable from 'effect/Pipeable'
export const TypeId = Symbol.for('~example/shop/Device')
export const make = (name: string): unknown => ({ name, ...Pipeable.Prototype })`,
      filename: '/repo/packages/shop/src/device.handle.ts',
      errors: [prototypeError],
    },
  ],
})
