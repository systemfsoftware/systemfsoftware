import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import {
  HANDLE_ACTUAL,
  HANDLE_EXPECTED,
  HANDLE_FIX,
  RESOURCE_ACTUAL,
  RESOURCE_EXPECTED,
  RESOURCE_FIX,
} from '../kind-file-construction.config.js'
import { kindFileConstruction } from '../kind-file-construction.js'

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

const resourceError = (name: string) => ({
  messageId: 'missingConstruction',
  data: { name, expected: RESOURCE_EXPECTED, actual: RESOURCE_ACTUAL, fix: RESOURCE_FIX },
})

const handleError = (name: string) => ({
  messageId: 'missingConstruction',
  data: { name, expected: HANDLE_EXPECTED, actual: HANDLE_ACTUAL, fix: HANDLE_FIX },
})

const PRE_MIGRATION_READINESS_RESOURCE = `import { Effect, Predicate, Schedule } from 'effect'
import { dual } from 'effect/Function'
import { probeConditionCell } from './await-condition.cell.js'
import { AwaitCondition } from './AwaitCondition.schema.js'
import type { Condition } from './Condition.schema.js'
import { Satisfied } from './evaluate-probe.workflow.js'
import type { HostProber } from './host-prober.service.js'
import type { LogSource } from './log-source.service.js'
import type { PortBinding } from './Port.schema.js'
import type { ProbeTarget } from './ProbeTarget.schema.js'
import type { LogSourceError, ProbeInputInvalid } from './ReadinessError.schema.js'
import { TimedOut } from './verdict.schema.js'

export const Wait = {
  forTcp: (guestPort: number): Condition => ({ _tag: 'Tcp', guestPort }),
  forHttp: (path: string, guestPort: number): Condition => ({ _tag: 'Http', guestPort, path }),
  forLog: (pattern: string): Condition => ({ _tag: 'Log', pattern }),
}

export interface TargetOptions {
  readonly timeoutMs?: number
  readonly pollMs?: number
}

const DEFAULTS = { timeoutMs: 30_000, pollMs: 250 } as const

export const target: {
  (options?: TargetOptions): (bindings: ReadonlyArray<PortBinding>) => ProbeTarget
  (bindings: ReadonlyArray<PortBinding>, options?: TargetOptions): ProbeTarget
} = dual(
  (args) => Array.isArray(args[0]),
  (bindings: ReadonlyArray<PortBinding>, options?: TargetOptions): ProbeTarget => ({
    ...DEFAULTS,
    ...options,
    bindings,
  }),
)

export const awaitCondition: {
  (
    target: ProbeTarget,
    condition: Condition,
  ): Effect.Effect<Satisfied | TimedOut, LogSourceError | ProbeInputInvalid, HostProber | LogSource>
  (
    condition: Condition,
  ): (target: ProbeTarget) => Effect.Effect<
    Satisfied | TimedOut,
    LogSourceError | ProbeInputInvalid,
    HostProber | LogSource
  >
} = dual(
  2,
  (probeTarget: ProbeTarget, condition: Condition) =>
    probeConditionCell.run(new AwaitCondition({ target: probeTarget, condition })).pipe(
      Effect.repeat({
        schedule: Schedule.spaced(\`\${probeTarget.pollMs} millis\`),
        until: Predicate.isTagged('Satisfied'),
      }),
      Effect.as(new Satisfied({})),
      Effect.timeoutOrElse({
        duration: \`\${probeTarget.timeoutMs} millis\`,
        orElse: () => Effect.succeed(new TimedOut({})),
      }),
    ),
)`

const namespaceResource = `
import * as CellTypes from '@systemfsoftware/effect-cell-types'
import * as Effect from 'effect/Effect'

export const RecordingVolumes = CellTypes.Resource.make({
  spec: class VolumeSpec {},
  handle: CellTypes.Handle.make({ name: 'RecordingVolume', create: () => Effect.succeed({ driver: 1, data: {} }) }),
})
`

const dynamicResource = `
const { Resource } = await import('@systemfsoftware/effect-cell-types')

export const RecordingVolumes = Resource.make({ spec: class VolumeSpec {}, handle: Volume })
`

ruleTester.run('kind-file-construction', kindFileConstruction, {
  valid: [
    {
      name: 'Should_Pass_When_ResourceFileConstructsThroughANamedImport',
      code: `
        import { Resource } from '@systemfsoftware/effect-cell-types'
        export const RecordingDevices = Resource.make({ spec: DeviceSpec, handle: RecordingDevice })
      `,
      filename: '/repo/packages/effect-readiness/src/pool.resource.ts',
    },
    {
      name: 'Should_Pass_When_ResourceFileConstructsThroughANamespaceImport',
      code: namespaceResource,
      filename: '/repo/packages/effect-readiness/src/volume.resource.ts',
    },
    {
      name: 'Should_Pass_When_ResourceFileConstructsThroughADynamicImportBinding',
      code: dynamicResource,
      filename: '/repo/packages/effect-readiness/src/gate.resource.ts',
    },
    {
      name: 'Should_Pass_When_HandleFileConstructsItsHandle',
      code: `
        import { Handle } from '@systemfsoftware/effect-cell-types'
        export const RecordingDevice = Handle.make({ name: 'RecordingDevice', create: (input) => created(input) })
      `,
      filename: '/repo/packages/effect-readiness/src/probe.handle.ts',
    },
    {
      name: 'Should_Pass_When_NonKindFileConstructsNothing',
      code: `export const awaitCondition = dual(2, (a, b) => [a, b])`,
      filename: '/repo/packages/effect-readiness/src/readiness.ts',
    },
    {
      name: 'Should_Pass_When_ATypeTestProbeSkipsTheRule',
      code: `
        import { Resource } from '@systemfsoftware/effect-cell-types'
        expect(Resource.make({ spec: DeviceSpec, handle: RecordingDevice })).type.toBe<unknown>()
      `,
      filename: '/repo/packages/effect-cell-types/test-types/resources-surface.tst.ts',
    },
    {
      name: 'Should_Pass_When_AnAliasedConstructorConstructsOnce',
      code: `
        import { Resource as Kinds } from '@systemfsoftware/effect-cell-types'
        export const pool = Kinds['make']({ spec: DeviceSpec, handle: RecordingDevice })
      `,
      filename: '/repo/packages/effect-readiness/src/pool.resource.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_When_ThePreMigrationReadinessResourceConstructsNoResource',
      code: PRE_MIGRATION_READINESS_RESOURCE,
      filename: '/repo/packages/effect-readiness/src/readiness.resource.ts',
      errors: [resourceError('readiness.resource.ts')],
    },
    {
      name: 'Should_Report_When_AHandleFileConstructsItsHandleThroughAnotherPackage',
      code: `
        import { Handle } from 'cell-kinds'
        export const RecordingDevice = Handle.make({ name: 'RecordingDevice', create: (input) => created(input) })
      `,
      filename: '/repo/packages/effect-readiness/src/probe.handle.ts',
      errors: [handleError('probe.handle.ts')],
    },
    {
      name: 'Should_Report_When_AResourceFileImportsNoConstructor',
      code: `import * as Effect from 'effect/Effect'\nexport const probe = Effect.succeed(1)`,
      filename: '/repo/packages/effect-readiness/src/idle.resource.ts',
      errors: [resourceError('idle.resource.ts')],
    },
  ],
})
