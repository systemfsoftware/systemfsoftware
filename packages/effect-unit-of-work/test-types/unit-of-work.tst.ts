import * as Effect from 'effect/Effect'
import type { Pipeable } from 'effect/Pipeable'
import { describe, expect, it } from 'tstyche'
import { engineRerunsSerializationFailure, type EngineRetrySubject, type StoreSubject } from '../src/laws/mod.js'
import { UnitOfWork } from '../src/mod.js'

interface Driver {
  readonly read: (key: string) => Effect.Effect<string>
}

declare const driver: Driver
declare const port: UnitOfWork.UnitOfWork<Driver>
declare const unit: UnitOfWork.Unit<Driver>
declare const forged: Pipeable & { readonly [K in UnitOfWork.TypeId]: UnitOfWork.TypeId }
declare const subject: StoreSubject<Driver>
declare const engineSubject: EngineRetrySubject<Driver>

describe('a store port', () => {
  it('Should_TakeAFunctionOfTheUnit_When_AUnitOfWorkRuns', () => {
    expect(port).type.toBeCallableWith((_opened: UnitOfWork.Unit<Driver>) => Effect.void)
    expect(port).type.not.toBeCallableWith(Effect.void)
  })

  it('Should_ReachTheDriverInBothForms_When_AUnitIsOpen', () => {
    expect(UnitOfWork.use(unit, (opened: Driver) => opened.read('a'))).type.toBe<Effect.Effect<string, never, never>>()
    expect(UnitOfWork.use((opened: Driver) => opened.read('a'))(unit)).type.toBe<Effect.Effect<string, never, never>>()
  })

  it('Should_RefuseARecordCarryingTheBrand_When_ItDidNotComeFromAUnit', () => {
    expect(UnitOfWork.use).type.toBeCallableWith(unit, (opened: Driver) => opened.read('a'))
    expect(UnitOfWork.use).type.not.toBeCallableWith(forged, (opened: Driver) => opened.read('a'))
  })

  it('Should_HandBackAUnitOfWork_When_AnAdapterMintsOne', () => {
    expect(UnitOfWork.memory({}, () => driver)).type.toBe<Effect.Effect<UnitOfWork.UnitOfWork<Driver>, never, never>>()
  })
})

describe('the engine rerun law', () => {
  it('Should_RefuseASubjectWithoutAnArmingEffect_When_TheEngineLawIsApplied', () => {
    expect(engineRerunsSerializationFailure).type.toBeCallableWith(engineSubject, 'key', 'value')
    expect(engineRerunsSerializationFailure).type.not.toBeCallableWith(subject, 'key', 'value')
  })
})
