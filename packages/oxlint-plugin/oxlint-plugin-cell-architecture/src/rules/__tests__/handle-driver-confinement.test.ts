import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import {
  DEFINITION_ACTUAL_OF,
  DEFINITION_EXPECTED,
  DEFINITION_FIX,
  DRIVER_ACTUAL_OF,
  DRIVER_EXPECTED,
  DRIVER_FIX,
  PARAMETER_ACTUAL,
  PARAMETER_EXPECTED,
  PARAMETER_FIX,
} from '../handle-driver-confinement.config.js'
import { handleDriverConfinement } from '../handle-driver-confinement.js'

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

const PREAMBLE = `import { Handle } from '@systemfsoftware/effect-cell-types'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Ref from 'effect/Ref'
import * as Stream from 'effect/Stream'
import { RecordingFile } from './recording-file.handle.js'
`

const escapeError = (role: string, source: string) => ({
  messageId: 'driverEscapes',
  data: {
    name: `a reference to the ${role}'s driver`,
    expected: DRIVER_EXPECTED,
    actual: DRIVER_ACTUAL_OF(source),
    fix: DRIVER_FIX,
  },
})

const byReferenceError = (role: string) => ({
  messageId: 'definitionByReference',
  data: {
    name: `the ${role}`,
    expected: DEFINITION_EXPECTED,
    actual: DEFINITION_ACTUAL_OF(role),
    fix: DEFINITION_FIX,
  },
})

const nonIdentifierError = (role: string) => ({
  messageId: 'driverNotAnIdentifier',
  data: {
    name: `the ${role}'s driver parameter`,
    expected: PARAMETER_EXPECTED,
    actual: PARAMETER_ACTUAL,
    fix: PARAMETER_FIX,
  },
})

const handle = (body: string): string =>
  `${PREAMBLE}\nexport const RecordingDevice = Handle.make({\n  name: 'RecordingDevice',\n${body}\n})\n`

ruleTester.run('handle-driver-confinement', handleDriverConfinement, {
  valid: [
    {
      name: 'Should_Pass_When_TheRecordingDeviceConfinesItsDriver',
      code: handle(`  create: (input) => created(input),
  release: [
    [(driver) => driver.step('stop'), (driver) => driver.step('kill')],
    [(driver) => driver.step('destroy')],
  ],
  operations: {
    ping: (driver) => driver.record('ping'),
    echo: (driver, _device, text: string) => driver.echo(text),
  },
  streams: {
    ticks: (driver, _device, count: number) => Stream.take(Stream.fromEffectRepeat(driver.record('tick')), count),
  },
  children: {
    open: {
      handle: RecordingFile,
      create: (driver, _device, path: string) =>
        Effect.map(driver.open(path), (file) => ({ driver: file, data: { path } })),
    },
  },
  services: (device, members) => Context.make(ProbeService, { ping: members.operations.ping(device) }),
  integration: (driver) => tallyLayer(driver),`),
      filename: '/repo/packages/effect-cell-types/tests/__fixtures__/recording-device.handle.ts',
    },
    {
      name: 'Should_Pass_When_AnInlineFunctionIsAnArgumentOfAnEffectCall',
      code: handle(`  operations: {
    exec: (driver, _device, cmd: string) =>
      Effect.tryPromise({ try: () => driver.exec(cmd), catch: (cause) => new BootError({ cause }) }),
    snapshot: (driver) => Effect.sync(() => driver.snapshot()),
    drain: (driver, _device, queue: Queue) => Effect.flatMap(take(queue), (job) => driver.drain(job)),
    settle: (driver) => Effect.tryPromise(async () => driver.settle()),
  },`),
      filename: '/repo/packages/effect-readiness/src/probe.handle.ts',
    },
    {
      name: 'Should_Pass_When_InlineFunctionsNestThroughEffectAndStream',
      code: handle(`  streams: {
    watch: (driver, _device) =>
      Stream.callback((queue) =>
        Effect.gen(function*() {
          yield* driver.watch(queue)
        })
      ),
    ingest: (driver) => Stream.fromAsyncIterable(driver.chunks(), (cause) => new ReadError({ cause })),
  },`),
      filename: '/repo/packages/effect-readiness/src/probe.handle.ts',
    },
    {
      name: 'Should_Pass_When_AMemberChainIsTheFirstArgumentOfARefFunction',
      code: handle(`  operations: {
    peek: (driver) => Ref.get(driver.cursor),
    advance: (driver, _device, by: bigint) => Ref.update(driver.cursor, (position) => position + by),
  },`),
      filename: '/repo/packages/effect-readiness/src/probe.handle.ts',
    },
    {
      name: 'Should_Pass_When_TheIntegrationHandsTheDriverToALibrary',
      code: handle(
        `  integration: (driver) => Layer.merge(tallyLayer(driver), Layer.succeed(ProbeConfig, driver.tally)),`,
      ),
      filename: '/repo/packages/effect-readiness/src/probe.handle.ts',
    },
    {
      name: 'Should_Pass_When_AChildDefinitionConfinesItsDriver',
      code: `
        import { Handle } from '@systemfsoftware/effect-cell-types'

        export const RecordingFile = Handle.make({
          name: 'RecordingFile',
          shape: Handle.shape(),
          release: [[(file) => file.close('release')]],
          operations: {
            read: (file, _file, length: number) => file.read(length),
          },
        })
      `,
      filename: '/repo/packages/effect-cell-types/tests/__fixtures__/recording-file.handle.ts',
    },
    {
      name: 'Should_Pass_When_ATypeTestProbesTheSurface',
      code: `
        import { Handle } from '@systemfsoftware/effect-cell-types'
        expect(Handle.make({ name: 'Device', operations: { use: (driver) => caller(driver) } })).type.toBe<unknown>()
      `,
      filename: '/repo/packages/effect-cell-types/test-types/handles-surface.tst.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_When_AnOperationPassesTheDriverToACallerCallback',
      code: handle(`  operations: {
    use: (driver, _device, run: (d: Driver) => Effect.Effect<string>) => run(driver),
  },`),
      filename: '/repo/packages/effect-microsandbox/src/micro-vm.handle.ts',
      errors: [escapeError('operation', 'driver')],
    },
    {
      name: 'Should_Report_When_AFunctionIsPassedToANonEffectCall',
      code: handle(`  operations: {
    stream: (driver, _device) => pipeThrough(() => driver.exec('ls')),
  },`),
      filename: '/repo/packages/effect-readiness/src/probe.handle.ts',
      errors: [escapeError('operation', 'driver.exec')],
    },
    {
      name: 'Should_Report_When_AFunctionIsReturned',
      code: handle(`  operations: {
    deferred: (driver, _device, cmd: string) => () => driver.exec(cmd),
  },`),
      filename: '/repo/packages/effect-readiness/src/probe.handle.ts',
      errors: [escapeError('operation', 'driver.exec')],
    },
    {
      name: 'Should_Report_When_AFunctionIsAssignedToLocal',
      code: handle(`  operations: {
    lazy: (driver, _device, cmd: string) => {
      const run = () => driver.exec(cmd)
      return Effect.suspend(run)
    },
  },`),
      filename: '/repo/packages/effect-readiness/src/probe.handle.ts',
      errors: [escapeError('operation', 'driver.exec')],
    },
    {
      name: 'Should_Report_When_ANamedLocalFunctionReadsTheDriver',
      code: handle(`  operations: {
    viaAlias: (driver, _device) => {
      const draining = (p: string) => driver.drain(p)
      return draining('x')
    },
  },`),
      filename: '/repo/packages/effect-readiness/src/probe.handle.ts',
      errors: [escapeError('operation', 'driver.drain')],
    },
    {
      name: 'Should_Report_When_ARefSinkGetsTheDriverInALaterPosition',
      code: handle(`  operations: {
    stash: (driver, _device, store: Ref.Ref<Driver>) => Ref.set(store, driver),
    stashCursor: (driver) => Ref.set(store, driver.cursor),
  },`),
      filename: '/repo/packages/effect-readiness/src/probe.handle.ts',
      errors: [escapeError('operation', 'driver'), escapeError('operation', 'driver.cursor')],
    },
    {
      name: 'Should_Report_When_ADriverMethodIsReferencedWithoutACall',
      code: handle(`  operations: {
    probe: (driver) => driver.record,
  },`),
      filename: '/repo/packages/effect-readiness/src/probe.handle.ts',
      errors: [escapeError('operation', 'driver.record')],
    },
    {
      name: 'Should_Report_When_ADriverMethodIsBound',
      code: handle(`  operations: {
    twice: (driver) => driver.exec.bind(null),
  },`),
      filename: '/repo/packages/effect-readiness/src/probe.handle.ts',
      errors: [escapeError('operation', 'driver.exec.bind')],
    },
    {
      name: 'Should_Report_When_TheDriverFlowsThroughAnAlias',
      code: handle(`  operations: {
    alias: (driver, _device) => {
      const d = driver
      return d.record('x')
    },
  },`),
      filename: '/repo/packages/effect-readiness/src/probe.handle.ts',
      errors: [escapeError('operation', 'driver')],
    },
    {
      name: 'Should_Report_When_TheDriverParameterIsDestructured',
      code: handle(`  operations: {
    use: ({ exec }: Driver, _device) => exec('ls'),
  },`),
      filename: '/repo/packages/effect-readiness/src/probe.handle.ts',
      errors: [nonIdentifierError('operation')],
    },
    {
      name: 'Should_Report_When_AnOperationIsGivenByReference',
      code: `const moduleLevelPing = (driver: Driver) => driver.record('ping')\n${
        handle(`  operations: {\n    ping: moduleLevelPing,\n  },`)
      }`,
      filename: '/repo/packages/effect-readiness/src/probe.handle.ts',
      errors: [byReferenceError('operation')],
    },
    {
      name: 'Should_Report_When_AReleaseStepIsGivenByReference',
      code: `const teardownStep = (driver: Driver) => driver.step('destroy')\n${
        handle(`  release: [[teardownStep]],`)
      }`,
      filename: '/repo/packages/effect-readiness/src/probe.handle.ts',
      errors: [byReferenceError('release step')],
    },
    {
      name: 'Should_Report_When_AChildCreatorIsGivenByReference',
      code:
        `const openFile = (driver: Driver, _device: object, path: string) => Effect.map(driver.open(path), (file) => ({ driver: file, data: { path } }))\n${
          handle(`  children: {\n    open: {\n      handle: RecordingFile,\n      create: openFile,\n    },\n  },`)
        }`,
      filename: '/repo/packages/effect-readiness/src/probe.handle.ts',
      errors: [byReferenceError('child creator')],
    },
    {
      name: 'Should_Report_When_AnIntegrationIsGivenByReference',
      code: `const integrate = (driver: Driver) => tallyLayer(driver)\n${handle(`  integration: integrate,`)}`,
      filename: '/repo/packages/effect-readiness/src/probe.handle.ts',
      errors: [byReferenceError('integration')],
    },
    {
      name: 'Should_Report_When_ADriverReachesALayerInsideAnOperation',
      code: handle(`  operations: {
    expose: (driver) => Layer.succeed(ProbeConfig, driver),
    config: (driver) => Layer.succeed(ProbeConfig, driver.tally),
  },`),
      filename: '/repo/packages/effect-readiness/src/probe.handle.ts',
      errors: [escapeError('operation', 'driver'), escapeError('operation', 'driver.tally')],
    },
  ],
})
