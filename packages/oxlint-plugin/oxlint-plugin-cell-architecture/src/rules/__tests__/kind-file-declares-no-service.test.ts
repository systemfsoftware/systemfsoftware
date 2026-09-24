import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { actualOf, EXPECTED, FIX } from '../kind-file-declares-no-service.config.js'
import { kindFileDeclaresNoService } from '../kind-file-declares-no-service.js'

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

const serviceError = (name: string) => ({
  messageId: 'serviceDeclaration',
  data: { name, expected: EXPECTED, actual: actualOf(name), fix: FIX },
})

ruleTester.run('kind-file-declares-no-service', kindFileDeclaresNoService, {
  valid: [
    {
      name: 'Should_Pass_When_TheRecordingResourceDeclaresOnlySchemas',
      code: `
        import { Resource } from '@systemfsoftware/effect-cell-types'
        import * as Schema from 'effect/Schema'

        export class DeviceSpec extends Schema.Class<DeviceSpec>('DeviceSpec')({ name: Schema.String }) {}

        export const RecordingDevices = Resource.make({ spec: DeviceSpec, handle: RecordingDevice })
      `,
      filename: '/repo/packages/effect-cell-types/tests/__fixtures__/recording.resource.ts',
    },
    {
      name: 'Should_Pass_When_AServiceClassLivesOutsideAKindFile',
      code: `
        import { Context, Effect } from 'effect'

        interface Probe { readonly ping: Effect.Effect<void> }
        export class ProbeService extends Context.Service<ProbeService, Probe>()('probe', {
          make: Effect.succeed({ ping: Effect.void }),
        }) {}
      `,
      filename: '/repo/packages/effect-readiness/src/probe.service.ts',
    },
    {
      name: 'Should_Pass_When_ACallersKeyIsAParameter',
      code: `
        import * as Context from 'effect/Context'
        export const serve = (key: Context.Key<Probe>) => key
      `,
      filename: '/repo/packages/effect-readiness/src/probe.handle.ts',
    },
    {
      name: 'Should_Pass_When_AKindFileExtendsASchemaClass',
      code: `
        import * as Schema from 'effect/Schema'
        export class DeviceSpec extends Schema.Class<DeviceSpec>('DeviceSpec')({ name: Schema.String }) {}
      `,
      filename: '/repo/packages/effect-readiness/src/device.handle.ts',
    },
    {
      name: 'Should_Pass_When_TheServiceIsImportedFromAnotherModule',
      code: `import { ProbeService } from './probe.service.js'\nexport const device = ProbeService`,
      filename: '/repo/packages/effect-readiness/src/device.handle.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_When_AHandleFileDeclaresAContextService',
      code: `
        import { Context, Effect } from 'effect'

        interface Probe { readonly ping: Effect.Effect<void> }
        export class ProbeService extends Context.Service<ProbeService, Probe>()('probe', {
          make: Effect.succeed({ ping: Effect.void }),
        }) {}
      `,
      filename: '/repo/packages/effect-readiness/src/probe.handle.ts',
      errors: [serviceError('ProbeService')],
    },
    {
      name: 'Should_Report_When_AResourceFileDeclaresAContextService',
      code: `
        import { Service } from 'effect/Context'
        import * as Effect from 'effect/Effect'

        export class VolumeService extends Service<VolumeService>()('volume', {
          make: Effect.succeed({}),
        }) {}
      `,
      filename: '/repo/packages/effect-readiness/src/volume.resource.ts',
      errors: [serviceError('VolumeService')],
    },
    {
      name: 'Should_Report_When_ANamespacedContextServiceIsDeclaredInAHandleFile',
      code: `
        import * as Context from 'effect/Context'
        import * as Effect from 'effect/Effect'

        const mount = class extends Context.Service<object, object>()('mount', { make: Effect.succeed({}) }) {}
      `,
      filename: '/repo/packages/effect-readiness/src/mount.handle.ts',
      errors: [serviceError('anonymous class')],
    },
  ],
})
