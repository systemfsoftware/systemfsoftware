import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import {
  HANDLE_EXPECTED,
  HANDLE_FIX,
  handleActualOf,
  RESOURCE_EXPECTED,
  RESOURCE_FIX,
  resourceActualOf,
} from '../kind-construction-location.config.js'
import { kindConstructionLocation } from '../kind-construction-location.js'

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

const IMPORT = `import { Handle, Resource } from '@systemfsoftware/effect-cell-types'`

const resourceError = (name: string) => ({
  messageId: 'misplacedConstruction',
  data: { name, expected: RESOURCE_EXPECTED, actual: resourceActualOf(name), fix: RESOURCE_FIX },
})

const handleError = (name: string) => ({
  messageId: 'misplacedConstruction',
  data: { name, expected: HANDLE_EXPECTED, actual: handleActualOf(name), fix: HANDLE_FIX },
})

ruleTester.run('kind-construction-location', kindConstructionLocation, {
  valid: [
    {
      name: 'Should_Pass_When_ResourceMakeLivesInAResourceFile',
      code: `${IMPORT}\nexport const pool = Resource.make({ spec: DeviceSpec, handle: Device })`,
      filename: '/repo/packages/effect-readiness/src/pool.resource.ts',
    },
    {
      name: 'Should_Pass_When_HandleMakeLivesInAHandleFile',
      code: `${IMPORT}\nexport const Device = Handle.make({ name: 'Device', create: (input) => created(input) })`,
      filename: '/repo/packages/effect-readiness/src/device.handle.ts',
    },
    {
      name: 'Should_Pass_When_TheConstructorComesFromAnotherPackage',
      code:
        `import { Resource } from 'cell-kinds'\nexport const pool = Resource.make({ spec: DeviceSpec, handle: Device })`,
      filename: '/repo/packages/effect-readiness/src/executor.ts',
    },
    {
      name: 'Should_Pass_When_AShadowedBindingCallsMake',
      code:
        `${IMPORT}\nconst Resource = { make: (options: unknown) => options }\nResource.make({ spec: DeviceSpec, handle: Device })`,
      filename: '/repo/packages/effect-readiness/src/executor.ts',
    },
    {
      name: 'Should_Pass_When_ATypeTestProbesTheConstructor',
      code: `${IMPORT}\nexpect(Resource.make({ spec: DeviceSpec, handle: Device })).type.toBe<unknown>()`,
      filename: '/repo/packages/effect-cell-types/test-types/resources-surface.tst.ts',
    },
    {
      name: 'Should_Pass_When_AnUnrelatedMemberIsCalled',
      code: `${IMPORT}\nexport const of = Resource.of({ spec })`,
      filename: '/repo/packages/effect-readiness/src/executor.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_When_ResourceMakeLivesInAHandleFile',
      code: `${IMPORT}\nexport const pool = Resource.make({ spec: DeviceSpec, handle: Device })`,
      filename: '/repo/packages/effect-readiness/src/pool.handle.ts',
      errors: [resourceError('pool.handle.ts')],
    },
    {
      name: 'Should_Report_When_HandleMakeLivesInACellFile',
      code: `${IMPORT}\nexport const Device = Handle.make({ name: 'Device', create: (input) => created(input) })`,
      filename: '/repo/packages/effect-readiness/src/boot-sandbox.cell.ts',
      errors: [handleError('boot-sandbox.cell.ts')],
    },
    {
      name: 'Should_Report_When_ResourceMakeLivesInAPlainModule',
      code: `${IMPORT}\nexport const pool = Resource.make({ spec: DeviceSpec, handle: Device })`,
      filename: '/repo/packages/effect-readiness/src/executor.ts',
      errors: [resourceError('executor.ts')],
    },
    {
      name: 'Should_Report_When_AnAliasedConstructorIsMisfiled',
      code: `${IMPORT}\nconst R = Resource\nexport const pool = R.make({ spec: DeviceSpec, handle: Device })`,
      filename: '/repo/packages/effect-readiness/src/executor.ts',
      errors: [resourceError('executor.ts')],
    },
    {
      name: 'Should_Report_When_AComputedConstructorIsMisfiled',
      code: `${IMPORT}\nexport const pool = Resource['make']({ spec: DeviceSpec, handle: Device })`,
      filename: '/repo/packages/effect-readiness/src/executor.ts',
      errors: [resourceError('executor.ts')],
    },
    {
      name: 'Should_Report_When_ADestructuredMakeIsMisfiled',
      code: `${IMPORT}\nconst { make } = Resource\nexport const pool = make({ spec: DeviceSpec, handle: Device })`,
      filename: '/repo/packages/effect-readiness/src/executor.ts',
      errors: [resourceError('executor.ts')],
    },
    {
      name: 'Should_Report_When_ANamespaceConstructorIsMisfiled',
      code:
        `import * as CellTypes from '@systemfsoftware/effect-cell-types'\nexport const pool = CellTypes.Resource.make({ spec: DeviceSpec, handle: Device })`,
      filename: '/repo/packages/effect-readiness/src/executor.ts',
      errors: [resourceError('executor.ts')],
    },
  ],
})
