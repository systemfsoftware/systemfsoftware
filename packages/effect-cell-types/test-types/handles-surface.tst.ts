import { Handle } from '@systemfsoftware/effect-cell-types'
import { pipe } from 'effect'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import type * as Scope from 'effect/Scope'
import * as Stream from 'effect/Stream'
import { describe, expect, it } from 'tstyche'

import { type DeviceInput, RecordingDevice } from '../tests/__fixtures__/recording-device.handle.js'
import type {
  DeviceRefused,
  FileDriver,
  ProbeService,
  RecordingDriver,
  StepFailed,
  TallyService,
} from '../tests/__fixtures__/recording-driver.js'
import { RecordingFile } from '../tests/__fixtures__/recording-file.handle.js'
import { RecordingVolume } from '../tests/__fixtures__/recording-volume.handle.js'

type Top<A = unknown> = A

interface Driver {
  readonly run: (line: string) => Effect.Effect<void>
}

interface Label {
  readonly label: string
}

type Plain = Handle.Handle<'Plain', Label>
type Device = Handle.Handle<'RecordingDevice', { name: string }>
type File = Handle.Handle<'RecordingFile', { readonly path: string }>

declare const fileDriver: FileDriver
declare const opaque: Top
declare const create: (input: Label) => Effect.Effect<Handle.Acquired<Driver, Label>>
declare const device: Device
declare const volume: Handle.Handle<'RecordingVolume', { readonly label: string }>

class Tracer extends Context.Service<Tracer, { readonly span: (name: string) => Effect.Effect<void> }>()('Tracer') {}

class Provider extends Context.Service<Provider, Driver>()('Provider') {}

interface Undeclared {
  readonly undeclared: true
}

declare const tracerLayer: Layer.Layer<Tracer, never, Provider>
declare const undeclaredLayer: Layer.Layer<Undeclared>

describe('Handle.make', () => {
  it('Should_AcceptPlainData_When_NoMemberIsAFunction', () => {
    expect(Handle.make).type.toBeCallableWith({ name: 'Plain', create })
    expect(Handle.make).type.not.toBeCallableWith({
      name: 'Plain',
      create: (input: Label) =>
        Effect.succeed({ driver: { run: (_line: string) => Effect.void }, data: { label: input.label, run: () => 1 } }),
    })
  })

  it('Should_RefuseData_When_AMemberCanHoldTheDriver', () => {
    expect(Handle.make).type.toBeCallableWith({
      name: 'Plain',
      create: (input: Label) =>
        Effect.succeed({ driver: { run: (_line: string) => Effect.void }, data: { meta: input.label.length } }),
    })
    expect(Handle.make).type.not.toBeCallableWith({
      name: 'Plain',
      create: (_input: Label) =>
        Effect.succeed({ driver: { run: (_line: string) => Effect.void }, data: { meta: opaque } }),
    })
  })

  it('Should_RefuseACreate_When_ItsInputCanHoldTheDriver', () => {
    expect(Handle.make).type.toBeCallableWith({
      name: 'Plain',
      create: (input: { readonly label: string }) =>
        Effect.succeed({ driver: { run: (_line: string) => Effect.void }, data: input }),
    })
    expect(Handle.make).type.not.toBeCallableWith({
      name: 'Plain',
      create: (input: { readonly driver: Driver }) => Effect.succeed({ driver: input.driver, data: { label: 'lent' } }),
    })
  })

  it('Should_RefuseAnOperation_When_AnArgumentIsAFunctionAcceptingTheDriver', () => {
    expect(Handle.make).type.toBeCallableWith({
      name: 'Plain',
      create,
      operations: {
        each: (driver: Driver, _self: Plain, f: (line: string) => string) => driver.run(f('line')),
      },
    })
    expect(Handle.make).type.not.toBeCallableWith({
      name: 'Plain',
      create,
      operations: {
        use: (driver: Driver, _self: Plain, f: (driver: Driver) => string) => Effect.sync(() => f(driver)),
      },
    })
  })

  it('Should_RefuseAnOperation_When_ItSucceedsWithTheDriverOrAFunction', () => {
    expect(Handle.make).type.toBeCallableWith({
      name: 'Plain',
      create,
      operations: { label: (_driver: Driver, self: Plain) => Effect.succeed(self.label) },
    })
    expect(Handle.make).type.not.toBeCallableWith({
      name: 'Plain',
      create,
      operations: { leak: (driver: Driver) => Effect.succeed({ driver }) },
    })
    expect(Handle.make).type.not.toBeCallableWith({
      name: 'Plain',
      create,
      operations: { later: (driver: Driver) => Effect.succeed(() => driver.run('later')) },
    })
  })

  it('Should_RefuseAStream_When_AnElementCanHoldTheDriver', () => {
    expect(Handle.make).type.toBeCallableWith({
      name: 'Plain',
      create,
      streams: { labels: (_driver: Driver, self: Plain) => Stream.make(self.label) },
    })
    expect(Handle.make).type.not.toBeCallableWith({
      name: 'Plain',
      create,
      streams: { drivers: (driver: Driver) => Stream.make(driver) },
    })
  })

  it('Should_AcceptAnIntegration_When_ItProvidesTheDriverAndOutputsOnlyTheLibrarysService', () => {
    expect(Handle.make).type.toBeCallableWith({
      name: 'Plain',
      create,
      integration: (driver: Driver) => Layer.provide(tracerLayer, Layer.succeed(Provider, driver)),
    })
    expect(Handle.make).type.not.toBeCallableWith({
      name: 'Plain',
      create,
      integration: (driver: Driver) => Layer.provideMerge(tracerLayer, Layer.succeed(Provider, driver)),
    })
  })

  it('Should_RefuseAnIntegration_When_AnOutputServiceIsNotClassDeclared', () => {
    expect(Handle.make).type.toBeCallableWith({
      name: 'Plain',
      create,
      integration: (driver: Driver) => Layer.provide(tracerLayer, Layer.succeed(Provider, driver)),
    })
    expect(Handle.make).type.not.toBeCallableWith({ name: 'Plain', create, integration: () => undeclaredLayer })
  })

  it('Should_RefuseAChild_When_ItsCreatorDisagreesWithTheChildShape', () => {
    expect(Handle.make).type.toBeCallableWith({
      name: 'Plain',
      create,
      children: {
        open: {
          handle: RecordingFile,
          create: (_driver: Driver, _self: Plain, path: string) =>
            Effect.succeed({ driver: fileDriver, data: { path } }),
        },
      },
    })
    expect(Handle.make).type.not.toBeCallableWith({
      name: 'Plain',
      create,
      children: {
        open: {
          handle: RecordingFile,
          create: (_driver: Driver, _self: Plain, path: string) =>
            Effect.succeed({ driver: fileDriver, data: { size: path.length } }),
        },
      },
    })
  })

  it('Should_TypeEachDefinitionFunction_When_TheDriverAndHandleAreInferred', () => {
    Handle.make({
      name: 'Plain',
      create,
      release: [[(driver, self) => {
        expect(driver).type.toBe<Driver>()
        expect(self).type.toBe<Plain>()
        return driver.run('stop')
      }]],
      operations: {
        run: (driver, self, line: string) => {
          expect(driver).type.toBe<Driver>()
          expect(self).type.toBe<Plain>()
          return driver.run(line)
        },
      },
    })
  })
})

describe('Handle.Definition', () => {
  it('Should_AcquireAHandle_When_TheCreateInputIsGiven', () => {
    expect(RecordingDevice.acquire).type.toBe<
      (input: DeviceInput) => Effect.Effect<Device, DeviceRefused, Scope.Scope>
    >()
    expect(RecordingFile).type.not.toHaveProperty('acquire')
  })

  it('Should_ApplyAnOperation_When_CalledDataFirstOrPiped', () => {
    expect(RecordingDevice.operations.echo(device, 'hi')).type.toBe<Effect.Effect<string, never, never>>()
    expect(pipe(device, RecordingDevice.operations.echo('hi'))).type.toBe<Effect.Effect<string, never, never>>()
    expect(RecordingDevice.operations.echo).type.toBeCallableWith(device, 'hi')
    expect(RecordingDevice.operations.echo).type.not.toBeCallableWith(volume, 'hi')
  })

  it('Should_ApplyAStream_When_CalledDataFirstOrPiped', () => {
    expect(RecordingDevice.streams.ticks(device, 2)).type.toBe<Stream.Stream<void, never, never>>()
    expect(pipe(device, RecordingDevice.streams.ticks(2))).type.toBe<Stream.Stream<void, never, never>>()
  })

  it('Should_AcquireAChild_When_TheParentsChildEntryRuns', () => {
    expect(RecordingDevice.children.open(device, '/a')).type.toBe<Effect.Effect<File, never, Scope.Scope>>()
    expect(RecordingFile.operations.read).type.not.toBeCallableWith(device, 1)
  })

  it('Should_ProvideTheServicesAndIntegrationOutputs_When_TheContextIsBuilt', () => {
    expect(RecordingDevice.context(device)).type.toBe<
      Effect.Effect<Context.Context<ProbeService | TallyService>, never, Scope.Scope>
    >()
    expect(RecordingVolume.context(volume)).type.toBe<Effect.Effect<Context.Context<never>, never, Scope.Scope>>()
  })

  it('Should_ReleaseWithTypedSteps_When_TheStepsFail', () => {
    expect<Handle.ReleaseStep<RecordingDriver, Device>>().type.toBeAssignableFrom<
      (driver: RecordingDriver) => Effect.Effect<void, StepFailed>
    >()
  })
})
