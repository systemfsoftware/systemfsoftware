import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import {
  BLUEPRINT_ACTUAL,
  BLUEPRINT_EXPECTED,
  BLUEPRINT_FIX,
  HANDLE_ACTUAL,
  HANDLE_EXPECTED,
  HANDLE_FIX,
  RETIRED_ACTUAL,
  RETIRED_EXPECTED,
  RETIRED_FIX,
} from '../kind-file-construction.config.js'
import { kindFileConstruction } from '../kind-file-construction.js'
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

const blueprintError = (name: string) => ({
  messageId: 'missingConstruction' as const,
  data: { name, expected: BLUEPRINT_EXPECTED, actual: BLUEPRINT_ACTUAL, fix: BLUEPRINT_FIX },
})

const retiredError = (name: string) => ({
  messageId: 'retiredResourceFile' as const,
  data: { name, expected: RETIRED_EXPECTED, actual: RETIRED_ACTUAL, fix: RETIRED_FIX },
})

const handleError = (name: string) => ({
  messageId: 'missingConstruction' as const,
  data: { name, expected: HANDLE_EXPECTED, actual: HANDLE_ACTUAL, fix: HANDLE_FIX },
})

const PRE_MIGRATION_READINESS_BLUEPRINT = `import { Effect, Predicate, Schedule } from 'effect'
import { dual } from 'effect/Function'
import { probeConditionCell } from './await-condition.cell.js'
import { AwaitCondition } from './AwaitCondition.schema.js'
import type { Condition } from './Condition.schema.js'
import { Satisfied } from './evaluate-probe.workflow.js'
import type { HostProber } from './host-prober.service.js'
import type { LogSource } from './log-source.service.js'
import type { PortBinding } from './Port.schema.js'
import type { ProbeTarget } from './ProbeTarget.schema.js'
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

const DEFAULTS = { timeoutMs: 30_000, pollMs: 250 } as const`

const PRE_MIGRATION_RUNNING_VM_HANDLE = `import { Effect, Option, Predicate, Stream } from 'effect'
import * as Arr from 'effect/Array'
import { dual } from 'effect/Function'
import { type Pipeable, Prototype } from 'effect/Pipeable'
import type { Sandbox } from 'microsandbox'
import { ExecError, PortAllocationError, SandboxBootError } from './MicroVMError.schema.js'
import type { PortBinding } from './render-sandbox-plan.schema.js'

export const TypeId = Symbol.for('~systemfsoftware/microvm/RunningVM')
export type TypeId = typeof TypeId

const SandboxTypeId: unique symbol = Symbol.for('~systemfsoftware/microvm/RunningVM/sandbox')

export const isRunningVM = (u: unknown): u is RunningVM => Predicate.hasProperty(u, TypeId)

export interface ExecResult {
  readonly code: number
  readonly stdout: string
  readonly stderr: string
}

export interface LogLine {
  readonly source: string
  readonly text: string
}`

ruleTester.run('kind-file-construction', kindFileConstruction, {
  valid: [
    {
      name: 'Should_Pass_When_ABlueprintFileConstructsThroughANamedImport',
      code: `import { Blueprint } from '@systemfsoftware/effect-cell-types'
export const TypeId = Symbol.for('~example/shop/Container')
const Container = Blueprint.make<string>()(TypeId).steps({ steps: {}, targets: {} })
export const make = (image: string) => Container.of(image)`,
      filename: '/repo/packages/shop/src/container.blueprint.ts',
    },
    {
      name: 'Should_Pass_When_TheCanonicalContainerFixtureConstructs',
      code: CONTAINER_BLUEPRINT,
      filename: CONTAINER_BLUEPRINT_FILENAME,
    },
    {
      name: 'Should_Pass_When_TheCanonicalRunningContainerFixtureConstructs',
      code: RUNNING_CONTAINER_HANDLE,
      filename: RUNNING_CONTAINER_HANDLE_FILENAME,
    },
    {
      name: 'Should_Pass_When_ABlueprintFileConstructsThroughANamespaceImport',
      code: `import * as CellTypes from '@systemfsoftware/effect-cell-types'
export const TypeId = Symbol.for('~example/shop/Container')
const Container = CellTypes.Blueprint.make<string>()(TypeId).steps({ steps: {}, targets: {} })
export const make = (image: string) => Container.of(image)`,
      filename: '/repo/packages/shop/src/container.blueprint.ts',
    },
    {
      name: 'Should_Pass_When_ABlueprintFileConstructsThroughAnAliasedComputedMember',
      code: `import { Blueprint as Kinds } from '@systemfsoftware/effect-cell-types'
export const TypeId = Symbol.for('~example/shop/Container')
const Container = Kinds['make']<string>()(TypeId).operations<Record<string, never>>()({ operations: {}, targets: {} })
export const make = (image: string) => Container.of(image)`,
      filename: '/repo/packages/shop/src/container.blueprint.ts',
    },
    {
      name: 'Should_Pass_When_AHandleFileConstructsThroughANamedImport',
      code: `import { Handle } from '@systemfsoftware/effect-cell-types'
export const TypeId = Symbol.for('~example/shop/RunningContainer')
const RunningContainer = Handle.make<{ readonly id: string }>()(TypeId)
export type RunningContainer = Handle.Of<typeof RunningContainer>
export const isRunningContainer = RunningContainer.is`,
      filename: '/repo/packages/shop/src/running-container.handle.ts',
    },
    {
      name: 'Should_Pass_When_ANonKindFileConstructsNothing',
      code: `export const awaitCondition = 1`,
      filename: '/repo/packages/shop/src/readiness.ts',
    },
    {
      name: 'Should_Pass_When_ATypeTestFileSkipsTheRule',
      code: `import { Blueprint } from '@systemfsoftware/effect-cell-types'
expect(Blueprint.make<string>({} as never)).type.toBe<unknown>()`,
      filename: '/repo/packages/effect-cell-types/test-types/blueprints-surface.tst.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_When_ThePreMigrationReadinessBlueprintConstructsNoBlueprint',
      code: PRE_MIGRATION_READINESS_BLUEPRINT,
      filename: '/repo/packages/effect-readiness/src/readiness.blueprint.ts',
      errors: [blueprintError('readiness.blueprint.ts')],
    },
    {
      name: 'Should_Report_When_ThePreMigrationRunningVMHandleConstructsNoHandle',
      code: PRE_MIGRATION_RUNNING_VM_HANDLE,
      filename: '/repo/packages/effect-microsandbox/src/running-vm.handle.ts',
      errors: [handleError('running-vm.handle.ts')],
    },
    {
      name: 'Should_Report_When_AHandleFileConstructsThroughAnotherPackage',
      code: `import { Handle } from 'cell-kinds'
export const TypeId = Symbol.for('~example/shop/Device')
const Device = Handle.make<{ readonly name: string }>()(TypeId)
export const make = (name: string) => Device.make({ name })`,
      filename: '/repo/packages/shop/src/device.handle.ts',
      errors: [handleError('device.handle.ts')],
    },
    {
      name: 'Should_Report_When_ARetiredResourceFileConstructsOnlyItsHandle',
      code: `import { Handle } from '@systemfsoftware/effect-cell-types'
export const TypeId = Symbol.for('~example/shop/Device')
const Device = Handle.make<{ readonly name: string }>()(TypeId)
export const make = (name: string) => Device.make({ name })`,
      filename: '/repo/packages/shop/src/device.resource.ts',
      errors: [retiredError('device.resource.ts')],
    },
    {
      name: 'Should_Report_When_ARetiredResourceFileMintsThroughTheOldKind',
      code: `import { Resource } from '@systemfsoftware/effect-cell-types'
export const TypeId = Symbol.for('~example/shop/Container')
const Container = Resource.make<string>()(TypeId).steps({ steps: {}, targets: {} })
export const make = (image: string) => Container.of(image)`,
      filename: '/repo/packages/shop/src/container.resource.ts',
      errors: [retiredError('container.resource.ts')],
    },
  ],
})
