import { Handle } from '@systemfsoftware/effect-cell-types'
import type * as Context from 'effect/Context'
import type * as Effect from 'effect/Effect'
import { pipe } from 'effect/Function'
import type * as Layer from 'effect/Layer'
import { describe, expect, it } from 'tstyche'

import {
  type Container,
  type ContainerSpec,
  isContainer,
  type Job,
  job,
  type JobSpec,
  make,
  withPort,
  withWorkdir,
} from '../tests/__fixtures__/container.resource.js'
import {
  exec,
  isRunningContainer,
  make as running,
  type RawDriver,
  type RunningContainer,
  type TypeId as RunningContainerTypeId,
} from '../tests/__fixtures__/running-container.handle.js'

type Top<A = unknown> = A

declare const driver: RawDriver
declare const PlainId: unique symbol
declare const Plain: Handle.Definition<typeof PlainId, { readonly count: number }, never>
declare const Slotted: Handle.Definition<typeof PlainId, { readonly count: number }, RawDriver>
declare const key: Context.Key<'Redis', RunningContainer>

describe('Resource', () => {
  it('Should_AgreeAcrossMethodAndDual_When_ACombinatorIsApplied', () => {
    expect(make('redis:7').withPort(6379)).type.toBe<Container>()
    expect(withPort(make('redis:7'), 6379)).type.toBe<Container>()
    expect(pipe(make('redis:7'), withPort(6379))).type.toBe<Container>()
  })

  it('Should_RefuseACombinatorArgument_When_ItIsNotTheDeclaredType', () => {
    expect(withPort).type.toBeCallableWith(make('redis:7'), 6379)
    expect(withPort).type.not.toBeCallableWith(make('redis:7'), '6379')
    expect(make('redis:7').withPort).type.toBeCallableWith(6379)
    expect(make('redis:7').withPort).type.not.toBeCallableWith('6379')
  })

  it('Should_CarryItsSpecUnchanged_When_Configured', () => {
    expect(make('redis:7').withPort(6379).spec).type.toBe<ContainerSpec>()
    expect(job('alpine').withWorkdir('/srv').spec).type.toBe<JobSpec>()
  })

  it('Should_ExposeProjectionsAsProperties_When_TheResourceIsConfigured', () => {
    expect(make('redis:7').scoped).type.toBe<Effect.Effect<RunningContainer, never, never>>()
    expect(make('redis:7').layer(key)).type.toBe<Layer.Layer<'Redis', never, never>>()
    expect(job('alpine').run).type.toBe<Effect.Effect<string, never, never>>()
  })

  it('Should_OfferVariantOnlyCombinators_When_TheVariantDeclaresThem', () => {
    expect(job('alpine')).type.toHaveProperty('withWorkdir')
    expect(make('redis:7')).type.not.toHaveProperty('withWorkdir')
    expect(make('redis:7')).type.not.toHaveProperty('run')
    expect(pipe(job('alpine'), withWorkdir('/srv'))).type.toBe<Job>()
    expect(job('alpine').withPort(80)).type.toBe<Job>()
    expect(withWorkdir).type.toBeCallableWith(job('alpine'), '/srv')
    expect(withWorkdir).type.not.toBeCallableWith(make('redis:7'), '/srv')
  })

  it('Should_StandInForItsBaseResource_When_AVariantSharesTheBrand', () => {
    expect<Job>().type.toBeAssignableTo<Container>()
    expect<Container>().type.not.toBeAssignableTo<Job>()
  })

  it('Should_NarrowToTheResource_When_TheGuardHolds', () => {
    expect(isContainer).type.toBe<(u: Top) => u is Container>()
  })
})

describe('Handle', () => {
  it('Should_BuildTheProtocolRecord_When_DataAndSlotAreGiven', () => {
    expect(running({ id: 'redis', driver })).type.toBe<RunningContainer>()
    expect(running({ id: 'redis', driver }).id).type.toBe<string>()
    expect(running({ id: 'redis', driver })[RunningContainerTypeIdValue]).type.toBe<RunningContainerTypeId>()
  })

  it('Should_RequireTheSlot_When_TheKindDeclaresOne', () => {
    expect(Slotted.make).type.toBeCallableWith({ count: 1 }, driver)
    expect(Slotted.make).type.not.toBeCallableWith({ count: 1 })
    expect(Plain.make).type.toBeCallableWith({ count: 1 })
    expect(Plain.make).type.not.toBeCallableWith({ count: 1 }, driver)
  })

  it('Should_KeepTheSlotKeyUnnameable_When_ReadFromOutside', () => {
    expect<keyof typeof Handle>().type.toBe<'make'>()
    expect<Extract<keyof RunningContainer, string>>().type.toBe<'id' | 'pipe'>()
    expect<Extract<keyof RunningContainer, symbol>>().type.not.toBe<RunningContainerTypeId>()
    expect<Extract<keyof Handle.Of<typeof Plain>, symbol>>().type.toBe<typeof PlainId>()
  })

  it('Should_TakeTheHandleFirstOrLast_When_AnOperationIsCalled', () => {
    expect(exec(running({ id: 'redis', driver }), 'ping')).type.toBe<Effect.Effect<number, never, never>>()
    expect(pipe(running({ id: 'redis', driver }), exec('ping'))).type.toBe<Effect.Effect<number, never, never>>()
    expect(exec).type.not.toBeCallableWith(make('redis:7'), 'ping')
  })

  it('Should_NarrowToTheHandle_When_TheGuardHolds', () => {
    expect(isRunningContainer).type.toBe<(u: Top) => u is RunningContainer>()
  })
})

declare const RunningContainerTypeIdValue: RunningContainerTypeId
