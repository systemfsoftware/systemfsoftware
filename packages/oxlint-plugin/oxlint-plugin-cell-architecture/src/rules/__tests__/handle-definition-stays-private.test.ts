import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import {
  actualOf,
  DECLARATION_FORM,
  DEFAULT_FORM,
  EXPECTED,
  FIX,
  SPECIFIER_FORM,
} from '../handle-definition-stays-private.config.js'
import { handleDefinitionStaysPrivate } from '../handle-definition-stays-private.js'

import { RUNNING_CONTAINER_HANDLE, RUNNING_CONTAINER_HANDLE_FILENAME } from './_canonical-fixtures.js'
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

const declarationError = (name: string) => ({
  messageId: 'exportedDefinition' as const,
  data: {
    name: `the handle definition binding \`${name}\``,
    expected: EXPECTED,
    actual: actualOf(name, DECLARATION_FORM),
    fix: FIX,
  },
})

const specifierError = (name: string) => ({
  messageId: 'exportedDefinition' as const,
  data: {
    name: `the handle definition binding \`${name}\``,
    expected: EXPECTED,
    actual: actualOf(name, SPECIFIER_FORM),
    fix: FIX,
  },
})

const defaultError = (name: string) => ({
  messageId: 'exportedDefinition' as const,
  data: {
    name: `the handle definition binding \`${name}\``,
    expected: EXPECTED,
    actual: actualOf(name, DEFAULT_FORM),
    fix: FIX,
  },
})

ruleTester.run('handle-definition-stays-private', handleDefinitionStaysPrivate, {
  valid: [
    {
      name: 'Should_Pass_When_TheDefinitionBindingStaysModulePrivate',
      code: `import { Handle } from '@systemfsoftware/effect-cell-types'
export const TypeId = Symbol.for('~example/shop/RunningContainer')
const RunningContainer = Handle.make<{ readonly id: string }>()(TypeId)
export type RunningContainer = Handle.Of<typeof RunningContainer>
export const isRunningContainer = RunningContainer.is
export const make = (id: string): RunningContainer => RunningContainer.make({ id })`,
      filename: '/repo/packages/shop/src/running-container.handle.ts',
    },
    {
      name: 'Should_Pass_When_TheCanonicalRunningContainerFixtureStaysPrivate',
      code: RUNNING_CONTAINER_HANDLE,
      filename: RUNNING_CONTAINER_HANDLE_FILENAME,
    },
    {
      name: 'Should_Pass_When_AnExportedFactorySitsBesideAPrivateDefinition',
      code: `import { Handle } from '@systemfsoftware/effect-cell-types'
export const TypeId = Symbol.for('~example/shop/Device')
const Device = Handle.make<{ readonly name: string }>()(TypeId)
export type Device = Handle.Of<typeof Device>
export const isDevice = Device.is
export const DeviceName = 'device'`,
      filename: '/repo/packages/shop/src/device.handle.ts',
    },
    {
      name: 'Should_Pass_When_ABlueprintFileExportsABlueprintBinding',
      code: `import { Blueprint } from '@systemfsoftware/effect-cell-types'
export const TypeId = Symbol.for('~example/shop/Container')
const Container = Blueprint.make<string>()(TypeId).steps({ steps: {}, targets: {} })
export const make = (image: string) => Container.of(image)`,
      filename: '/repo/packages/shop/src/container.blueprint.ts',
    },
    {
      name: 'Should_Pass_When_ANonKindFileExportsAHandleMakeBinding',
      code: `import { Handle } from '@systemfsoftware/effect-cell-types'
export const Device = Handle.make<{ readonly name: string }>()({} as never)`,
      filename: '/repo/packages/shop/src/device.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_When_TheDiscardedMigrationExportsItsDefinition',
      code: `import { Handle } from '@systemfsoftware/effect-cell-types'
import { Effect } from 'effect'

export const RunningVM = Handle.make({
  name: 'RunningVM',
  create: (input: BootInput) => createSandbox(input),
})`,
      filename: '/repo/packages/effect-microsandbox/src/running-vm.handle.ts',
      errors: [declarationError('RunningVM')],
    },
    {
      name: 'Should_Report_When_TheDiscardedMemfsMigrationExportsItsDefinition',
      code: `import { Handle } from '@systemfsoftware/effect-cell-types'

export const OpenFile = Handle.make({
  name: 'OpenFile',
  release: [[(driver) => driver.file.close()]],
})`,
      filename: '/repo/packages/effect-memfs/src/open-file.handle.ts',
      errors: [declarationError('OpenFile')],
    },
    {
      name: 'Should_Report_When_TheDefinitionLeavesThroughAnExportSpecifier',
      code: `import { Handle } from '@systemfsoftware/effect-cell-types'
export const TypeId = Symbol.for('~example/shop/Device')
const Device = Handle.make<{ readonly name: string }>()(TypeId)
export { Device }
export const isDevice = Device.is`,
      filename: '/repo/packages/shop/src/device.handle.ts',
      errors: [specifierError('Device')],
    },
    {
      name: 'Should_Report_When_TheDefinitionLeavesThroughADefaultExport',
      code: `import { Handle } from '@systemfsoftware/effect-cell-types'
export const TypeId = Symbol.for('~example/shop/Device')
const Device = Handle.make<{ readonly name: string }>()(TypeId)
export default Device`,
      filename: '/repo/packages/shop/src/device.handle.ts',
      errors: [defaultError('Device')],
    },
  ],
})
