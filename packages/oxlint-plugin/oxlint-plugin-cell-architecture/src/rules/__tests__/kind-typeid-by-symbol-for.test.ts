import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import {
  extraSymbolActualOf,
  MISSING_TYPEID_ACTUAL,
  NOT_SYMBOL_CALL_ACTUAL,
  SLOT_FIX,
  STRING_TYPEID_ACTUAL_OF,
  TYPEID_EXPECTED,
  TYPEID_FIX,
  UNEXPORTED_TYPEID_ACTUAL,
} from '../kind-typeid-by-symbol-for.config.js'
import { kindTypeIdBySymbolFor } from '../kind-typeid-by-symbol-for.js'
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

const notSymbolForError = (actual: string) => ({
  messageId: 'notSymbolFor' as const,
  data: { name: 'TypeId', expected: TYPEID_EXPECTED, actual, fix: TYPEID_FIX },
})

const extraSymbolError = (call: string) => ({
  messageId: 'extraSymbol' as const,
  data: {
    name: 'a hand-rolled symbol declaration',
    expected: TYPEID_EXPECTED,
    actual: extraSymbolActualOf(call),
    fix: SLOT_FIX,
  },
})

ruleTester.run('kind-typeid-by-symbol-for', kindTypeIdBySymbolFor, {
  valid: [
    {
      name: 'Should_Pass_When_AResourceModuleBrandsItselfWithSymbolFor',
      code: `export const TypeId = Symbol.for('~example/shop/Container')
export type TypeId = typeof TypeId`,
      filename: '/repo/packages/shop/src/container.resource.ts',
    },
    {
      name: 'Should_Pass_When_AHandleModuleBrandsItselfWithSymbolFor',
      code: `export const TypeId = Symbol.for('~example/shop/RunningContainer')
export type TypeId = typeof TypeId`,
      filename: '/repo/packages/shop/src/running-container.handle.ts',
    },
    {
      name: 'Should_Pass_When_TheCanonicalContainerFixtureBrandsWithSymbolFor',
      code: CONTAINER_RESOURCE,
      filename: CONTAINER_RESOURCE_FILENAME,
    },
    {
      name: 'Should_Pass_When_TheCanonicalRunningContainerFixtureBrandsWithSymbolFor',
      code: RUNNING_CONTAINER_HANDLE,
      filename: RUNNING_CONTAINER_HANDLE_FILENAME,
    },
    {
      name: 'Should_Pass_When_ANonKindFileCarriesAnyIdentity',
      code: `const TypeId = '~example/shop/Container'`,
      filename: '/repo/packages/shop/src/container.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_When_ThePreMigrationMicroVMKeepsAStringTypeId',
      code: `const TypeId = '~systemfsoftware/microvm/MicroVM'
export type TypeId = typeof TypeId`,
      filename: '/repo/packages/effect-microsandbox/src/micro-vm.resource.ts',
      errors: [notSymbolForError(UNEXPORTED_TYPEID_ACTUAL)],
    },
    {
      name: 'Should_Report_When_AHandleModuleBrandsItselfWithABareSymbolCall',
      code: `export const TypeId = makeTypeId('~example/shop/Device')`,
      filename: '/repo/packages/shop/src/device.handle.ts',
      errors: [notSymbolForError(NOT_SYMBOL_CALL_ACTUAL)],
    },
    {
      name: 'Should_Report_When_ThePreMigrationOpenFileKeepsHandRolledDriverSymbols',
      code: `export const TypeId = Symbol.for('~systemfsoftware/memfs/OpenFile')
export type TypeId = typeof TypeId

const DriverId: unique symbol = Symbol.for('~systemfsoftware/memfs/OpenFile/driver')
const CursorId: unique symbol = Symbol.for('~systemfsoftware/memfs/OpenFile/cursor')`,
      filename: '/repo/packages/effect-memfs/src/open-file.handle.ts',
      errors: [
        extraSymbolError(`Symbol.for('~systemfsoftware/memfs/OpenFile/driver')`),
        extraSymbolError(`Symbol.for('~systemfsoftware/memfs/OpenFile/cursor')`),
      ],
    },
    {
      name: 'Should_Report_When_AHandleModuleExportsAStringTypeId',
      code: `export const TypeId = '~example/shop/Device'
export type TypeId = typeof TypeId`,
      filename: '/repo/packages/shop/src/device.handle.ts',
      errors: [notSymbolForError(STRING_TYPEID_ACTUAL_OF('TypeId', '~example/shop/Device'))],
    },
    {
      name: 'Should_Report_When_AResourceModuleHasNoTypeIdAtAll',
      code: `export const make = (image: string) => ({ image })`,
      filename: '/repo/packages/shop/src/container.resource.ts',
      errors: [notSymbolForError(MISSING_TYPEID_ACTUAL)],
    },
    {
      name: 'Should_Report_When_AHandleModuleMintsItsBrandWithBareSymbol',
      code: `export const TypeId = Symbol.for('~example/shop/Device')
const DriverId: unique symbol = Symbol('~example/shop/Device/driver')`,
      filename: '/repo/packages/shop/src/device.handle.ts',
      errors: [extraSymbolError(`Symbol('~example/shop/Device/driver')`)],
    },
  ],
})
