import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { EXPECTED, FIX, MISSING_GUARD_ACTUAL, UNBOUND_GUARD_ACTUAL_OF } from '../handle-exports-guard.config.js'
import { handleExportsGuard } from '../handle-exports-guard.js'
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

ruleTester.run('handle-exports-guard', handleExportsGuard, {
  valid: [
    {
      name: 'Should_Pass_When_TheGuardIsBoundToTheDefinitionIs',
      code: `import { Handle } from '@systemfsoftware/effect-cell-types'
export const TypeId = Symbol.for('~example/shop/RunningContainer')
const RunningContainer = Handle.make<{ readonly id: string }>()(TypeId)
export type RunningContainer = Handle.Of<typeof RunningContainer>
export const isRunningContainer = RunningContainer.is`,
      filename: '/repo/packages/shop/src/running-container.handle.ts',
    },
    {
      name: 'Should_Pass_When_TheGuardLeavesThroughAnExportSpecifier',
      code: `import { Handle } from '@systemfsoftware/effect-cell-types'
export const TypeId = Symbol.for('~example/shop/Device')
const Device = Handle.make<{ readonly name: string }>()(TypeId)
const isDevice = Device.is
export { isDevice }`,
      filename: '/repo/packages/shop/src/device.handle.ts',
    },
    {
      name: 'Should_Pass_When_TheCanonicalRunningContainerFixtureExportsItsGuard',
      code: RUNNING_CONTAINER_HANDLE,
      filename: RUNNING_CONTAINER_HANDLE_FILENAME,
    },
    {
      name: 'Should_Pass_When_ABlueprintFileExportsNoGuard',
      code: `import { Blueprint } from '@systemfsoftware/effect-cell-types'
export const TypeId = Symbol.for('~example/shop/Container')
const Container = Blueprint.make<string>()(TypeId).steps({ steps: {}, targets: {} })
export const make = (image: string) => Container.of(image)`,
      filename: '/repo/packages/shop/src/container.blueprint.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_When_ThePreMigrationRunningVMGuardsWithoutItsDefinition',
      code: `import { Predicate } from 'effect'
export const TypeId = Symbol.for('~systemfsoftware/microvm/RunningVM')
export const isRunningVM = (u: unknown): u is RunningVM => Predicate.hasProperty(u, TypeId)`,
      filename: '/repo/packages/effect-microsandbox/src/running-vm.handle.ts',
      errors: [{
        messageId: 'missingGuard' as const,
        data: {
          name: 'the exported guard `isRunningVM`',
          expected: EXPECTED,
          actual: UNBOUND_GUARD_ACTUAL_OF('isRunningVM'),
          fix: FIX,
        },
      }],
    },
    {
      name: 'Should_Report_When_ThePreMigrationOpenFileGuardsWithoutItsDefinition',
      code: `import { Predicate } from 'effect'
export const TypeId = Symbol.for('~systemfsoftware/memfs/OpenFile')
export const isOpenFile = (u: unknown): u is OpenFile => Predicate.hasProperty(u, TypeId)`,
      filename: '/repo/packages/effect-memfs/src/open-file.handle.ts',
      errors: [{
        messageId: 'missingGuard' as const,
        data: {
          name: 'the exported guard `isOpenFile`',
          expected: EXPECTED,
          actual: UNBOUND_GUARD_ACTUAL_OF('isOpenFile'),
          fix: FIX,
        },
      }],
    },
    {
      name: 'Should_Report_When_AHandleFileExportsNoGuardAtAll',
      code: `import { Handle } from '@systemfsoftware/effect-cell-types'
export const TypeId = Symbol.for('~example/shop/Device')
const Device = Handle.make<{ readonly name: string }>()(TypeId)
export const make = (name: string) => Device.make({ name })`,
      filename: '/repo/packages/shop/src/device.handle.ts',
      errors: [{
        messageId: 'missingGuard' as const,
        data: { name: 'a handle type guard', expected: EXPECTED, actual: MISSING_GUARD_ACTUAL, fix: FIX },
      }],
    },
  ],
})
