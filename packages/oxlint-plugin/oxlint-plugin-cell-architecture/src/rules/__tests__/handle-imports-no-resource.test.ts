import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import {
  dynamicActualOf,
  EXPECTED,
  FIX,
  reexportActualOf,
  staticActualOf,
} from '../handle-imports-no-resource.config.js'
import { handleImportsNoResource } from '../handle-imports-no-resource.js'

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

const importError = (specifier: string) => ({
  messageId: 'resourceImport',
  data: { name: specifier, expected: EXPECTED, actual: staticActualOf(specifier), fix: FIX },
})

const reexportError = (specifier: string) => ({
  messageId: 'resourceImport',
  data: { name: specifier, expected: EXPECTED, actual: reexportActualOf(specifier), fix: FIX },
})

const dynamicError = (specifier: string) => ({
  messageId: 'resourceImport',
  data: { name: specifier, expected: EXPECTED, actual: dynamicActualOf(specifier), fix: FIX },
})

ruleTester.run('handle-imports-no-resource', handleImportsNoResource, {
  valid: [
    {
      name: 'Should_Pass_When_TheRecordingDeviceImportsSiblingHandles',
      code: `
        import { Handle } from '@systemfsoftware/effect-cell-types'
        import * as Effect from 'effect/Effect'
        import * as Stream from 'effect/Stream'
        import { DeviceRefused, recordingDriver, tallyLayer } from './recording-driver.js'
        import { RecordingFile } from './recording-file.handle.js'

        export const RecordingDevice = Handle.make({ name: 'RecordingDevice', create: (input) => created(input) })
      `,
      filename: '/repo/packages/effect-cell-types/tests/__fixtures__/recording-device.handle.ts',
    },
    {
      name: 'Should_Pass_When_AHandleFileImportsANonResourceModule',
      code: `import { spec } from './spec.schema.js'\nexport const gate = spec`,
      filename: '/repo/packages/effect-readiness/src/gate.handle.ts',
    },
    {
      name: 'Should_Pass_When_AResourceFileImportsAResourceModule',
      code: `import { Pool } from './pool.resource.js'\nexport const gate = Pool`,
      filename: '/repo/packages/effect-readiness/src/gate.resource.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_When_AHandleFileImportsAResourceModule',
      code: `import { RecordingDevices } from './recording.resource.js'\nexport const gate = RecordingDevices`,
      filename: '/repo/packages/effect-readiness/src/gate.handle.ts',
      errors: [importError('./recording.resource.js')],
    },
    {
      name: 'Should_Report_When_AHandleFileReExportsAResourceModule',
      code: `export * from './gate.resource.js'`,
      filename: '/repo/packages/effect-readiness/src/gate.handle.ts',
      errors: [reexportError('./gate.resource.js')],
    },
    {
      name: 'Should_Report_When_AHandleFileReExportsANamedResourceBinding',
      code: `export { Pool } from './pool.resource.js'`,
      filename: '/repo/packages/effect-readiness/src/pool.handle.ts',
      errors: [reexportError('./pool.resource.js')],
    },
    {
      name: 'Should_Report_When_AHandleFileDynamicallyImportsAResourceModule',
      code: `export const load = async () => await import('./gate.resource.js')`,
      filename: '/repo/packages/effect-readiness/src/gate.handle.ts',
      errors: [dynamicError('./gate.resource.js')],
    },
    {
      name: 'Should_Report_When_TheSpecifierHasNoExtension',
      code: `import { Pool } from './pool.resource'\nexport const gate = Pool`,
      filename: '/repo/packages/effect-readiness/src/pool.handle.ts',
      errors: [importError('./pool.resource')],
    },
    {
      name: 'Should_Report_When_TheSpecifierClimbsDirectories',
      code: `import { RecordingVolumes } from '../volumes/recording.resource.js'\nexport const gate = RecordingVolumes`,
      filename: '/repo/packages/effect-readiness/src/deep/gate.handle.ts',
      errors: [importError('../volumes/recording.resource.js')],
    },
  ],
})
