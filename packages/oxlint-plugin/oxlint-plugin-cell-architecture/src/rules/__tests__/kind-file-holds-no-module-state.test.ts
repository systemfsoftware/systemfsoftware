import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import {
  COLLECTION_ACTUAL_OF,
  COLLECTION_FIX,
  EXPECTED,
  REBINDING_ACTUAL,
  REBINDING_FIX,
  REF_ACTUAL,
  REF_FIX,
} from '../kind-file-holds-no-module-state.config.js'
import { kindFileHoldsNoModuleState } from '../kind-file-holds-no-module-state.js'

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
  messageId: 'moduleState',
  data: { name, expected: EXPECTED, actual, fix },
})

const rebindingError = (name: string) => stateError(name, REBINDING_ACTUAL, REBINDING_FIX)

ruleTester.run('kind-file-holds-no-module-state', kindFileHoldsNoModuleState, {
  valid: [
    {
      name: 'Should_Pass_When_TheRecordingResourceHoldsNoModuleState',
      code: `
        import { Resource } from '@systemfsoftware/effect-cell-types'
        import * as Effect from 'effect/Effect'

        const inputOf = (spec: DeviceSpec) => Effect.map(DeviceLog, (log) => ({ log, name: spec.name, failing: [] }))

        export const RecordingDevices = Resource.make({
          spec: DeviceSpec,
          handle: RecordingDevice,
          prepare: (spec) => inputOf(spec),
        })
      `,
      filename: '/repo/packages/effect-cell-types/tests/__fixtures__/recording.resource.ts',
    },
    {
      name: 'Should_Pass_When_ARebindingSitsInsideAFunction',
      code: `
        export const once = (input: string) => {
          let seen: string | null = null
          seen = input
          return seen
        }
      `,
      filename: '/repo/packages/effect-readiness/src/gate.resource.ts',
    },
    {
      name: 'Should_Pass_When_ARebindingSitsInsideAnInSourceTestBlock',
      code: `
        export const pool = { size: 1 }

        if (import.meta.vitest !== undefined) {
          let attempts = 0
          attempts += 1
        }
      `,
      filename: '/repo/packages/effect-readiness/src/pool.resource.ts',
    },
    {
      name: 'Should_Pass_When_AModuleConstHoldsADefinition',
      code: `
        import { Handle } from '@systemfsoftware/effect-cell-types'
        const DEFAULTS = { timeoutMs: 30_000, pollMs: 250 } as const
        export const Device = Handle.make({ name: 'Device', create: (input) => Effect.succeed({ driver: DEFAULTS, data: {} }) })
      `,
      filename: '/repo/packages/effect-readiness/src/device.handle.ts',
    },
    {
      name: 'Should_Pass_When_AMutableCollectionIsBuiltInsideTheDefinition',
      code: `
        import { Resource } from '@systemfsoftware/effect-cell-types'
        export const Pool = Resource.make({
          spec: PoolSpec,
          handle: Pool,
          prepare: (spec) => Effect.succeed({ leases: new WeakMap(), spec }),
        })
      `,
      filename: '/repo/packages/effect-readiness/src/pool.resource.ts',
    },
    {
      name: 'Should_Pass_When_ARefIsMintedInsideTheDefinition',
      code: `
        import { Resource } from '@systemfsoftware/effect-cell-types'
        import * as Ref from 'effect/Ref'
        export const Gate = Resource.make({
          spec: GateSpec,
          handle: Gate,
          prepare: (spec) => Effect.map(Ref.make(false), (open) => ({ open, spec })),
        })
      `,
      filename: '/repo/packages/effect-readiness/src/gate.resource.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_When_AResourceFileHoldsAModuleLevelLet',
      code: `export let leases = 0`,
      filename: '/repo/packages/effect-readiness/src/pool.resource.ts',
      errors: [rebindingError('leases')],
    },
    {
      name: 'Should_Report_When_AResourceFileHoldsAModuleLevelVar',
      code: `export var attempts = 0`,
      filename: '/repo/packages/effect-readiness/src/gate.resource.ts',
      errors: [rebindingError('attempts')],
    },
    {
      name: 'Should_Report_When_AHandleFileHoldsAModuleLevelRebinding',
      code: `let probes = 0\nexport const probe = () => probes`,
      filename: '/repo/packages/effect-readiness/src/probe.handle.ts',
      errors: [rebindingError('probes')],
    },
    {
      name: 'Should_Report_When_AResourceFileHoldsAModuleLevelWeakMap',
      code: `const cache = new WeakMap()`,
      filename: '/repo/packages/effect-readiness/src/pool.resource.ts',
      errors: [stateError('cache', COLLECTION_ACTUAL_OF('new WeakMap()'), COLLECTION_FIX)],
    },
    {
      name: 'Should_Report_When_AResourceFileHoldsAModuleLevelMap',
      code: `const cache = new Map()`,
      filename: '/repo/packages/effect-readiness/src/pool.resource.ts',
      errors: [stateError('cache', COLLECTION_ACTUAL_OF('new Map()'), COLLECTION_FIX)],
    },
    {
      name: 'Should_Report_When_AResourceFileHoldsAModuleLevelRef',
      code: `import * as Ref from 'effect/Ref'\nconst open = Ref.make(false)`,
      filename: '/repo/packages/effect-readiness/src/gate.resource.ts',
      errors: [stateError('open', REF_ACTUAL, REF_FIX)],
    },
    {
      name: 'Should_Report_When_ANamespacedRefIsMintedAtModuleLevel',
      code: `import { Ref } from 'effect'\nconst open = Ref.make(false)`,
      filename: '/repo/packages/effect-readiness/src/gate.resource.ts',
      errors: [stateError('open', REF_ACTUAL, REF_FIX)],
    },
  ],
})
