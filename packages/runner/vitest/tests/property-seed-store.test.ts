import { it, PropertyRefuted, SeedStoreUnreadable } from '@systemfsoftware/vitest'
import { type FailureRecord, recordOfFile, recordOfProperty } from '@systemfsoftware/vitest/failure'
import { Effect, Option, Schema } from 'effect'
import { seedStorePath, tempTestFile, writeStoreLines } from './__fixtures__/seed-store-temp.js'

type Opaque<A = unknown> = A

const identitySubject = (value: number): number => value

const successor = (value: number): number => value + 1

const returnsAnObject = (): boolean => {
  const verdict: { value: boolean } = { value: true }
  return Object.assign(verdict, { value: { member: 1 } }).value
}

const sameNumbers = (left: ReadonlyArray<number>, right: ReadonlyArray<number>): boolean =>
  left.length === right.length && left.every((value, index) => value === right[index])

const replayShape = (
  left: ReadonlyArray<number>,
  right: ReadonlyArray<number>,
  counterexample: ReadonlyArray<number>,
): { readonly identical: boolean; readonly nonEmpty: boolean; readonly endsAtCounterexample: boolean } => ({
  identical: sameNumbers(left, right),
  nonEmpty: left.length > 0,
  endsAtCounterexample: sameNumbers(left.slice(-counterexample.length), counterexample),
})

const failureOf = (record: FailureRecord | undefined): Opaque => {
  if (record === undefined) throw new Error('expected a failure record')
  return record.failure
}

const refutedOf = (record: FailureRecord | undefined): PropertyRefuted => {
  const failure = failureOf(record)
  if (Schema.is(PropertyRefuted)(failure)) return failure
  throw new Error('expected a refuted property')
}

const unreadableOf = (record: FailureRecord | undefined): SeedStoreUnreadable => {
  const failure = failureOf(record)
  if (Schema.is(SeedStoreUnreadable)(failure)) return failure
  throw new Error('expected an unreadable seed store')
}

const counterexampleOf = (failure: PropertyRefuted): ReadonlyArray<number> =>
  Option.getOrThrow(Schema.decodeUnknownOption(Schema.Array(Schema.Finite))(failure.counterexample.value))

const refuting = (name: string, seen: Array<number>) => ({
  name,
  spec: { of: [Schema.Natural] as const, subject: identitySubject },
  holds: (_subject: (value: number) => number, values: ReadonlyArray<number>): boolean => {
    seen.push(values[0] ?? 0)
    return false
  },
})

const writing = (name: string) => ({
  name,
  spec: { of: [Schema.Int] as const, subject: successor, runs: 1 },
  holds: (): boolean => returnsAnObject(),
})

const increasing = (name: string) => ({
  name,
  spec: { of: [Schema.Int] as const, subject: successor, runs: 1 },
  holds: (subject: (value: number) => number, values: ReadonlyArray<number>): boolean => {
    const value = values[0] ?? 0
    return subject(value) === value + 1
  },
})

it('Should_ReplayTheRefutingDrawFirst_When_TheDefaultBudgetRefutedLastRun', function*({ expect }) {
  const store = tempTestFile()
  const name = '∀n_StoreDefault_≢Fresh'
  const first: Array<number> = []
  const left: Array<number> = []
  const right: Array<number> = []
  const refuted = refutedOf(
    yield* Effect.promise(() => recordOfProperty({ ...refuting(name, first), store, budget: {} })),
  )
  const counterexample = counterexampleOf(refuted)
  yield* Effect.promise(() => recordOfProperty({ ...refuting(name, left), store, budget: {} }))
  yield* Effect.promise(() => recordOfProperty({ ...refuting(name, right), store, budget: { seed: 1 } }))
  yield* expect(replayShape(left, right, counterexample)).toEqual({
    identical: true,
    nonEmpty: true,
    endsAtCounterexample: true,
  })
})

it('Should_RecordNothing_When_TheBudgetIsDerandomized', function*({ expect }) {
  const store = tempTestFile()
  const name = '∀n_StoreSeeded_≢Write'
  const first: Array<number> = []
  const second: Array<number> = []
  const budget = { seed: 1, runs: 3 }
  yield* Effect.promise(() => recordOfProperty({ ...refuting(name, first), store, budget }))
  yield* Effect.promise(() => recordOfProperty({ ...refuting(name, second), store, budget }))
  yield* expect({ same: sameNumbers(first, second), drewNovel: first.length > 1 }).toEqual({
    same: true,
    drewNovel: true,
  })
})

it('Should_ReplayTheStoredDrawFirst_When_TheBudgetCarriesAProvidedSeed', function*({ expect }) {
  const store = tempTestFile()
  const name = '∀n_StoreProvided_=Replay'
  const first: Array<number> = []
  const left: Array<number> = []
  const right: Array<number> = []
  const refuted = refutedOf(
    yield* Effect.promise(() => recordOfProperty({ ...refuting(name, first), store, budget: {} })),
  )
  const counterexample = counterexampleOf(refuted)
  yield* Effect.promise(() => recordOfProperty({ ...refuting(name, left), store, budget: { seed: 1 } }))
  yield* Effect.promise(() => recordOfProperty({ ...refuting(name, right), store, budget: { seed: 2 } }))
  yield* expect(replayShape(left, right, counterexample)).toEqual({
    identical: true,
    nonEmpty: true,
    endsAtCounterexample: true,
  })
})

it('Should_ReplayTheStoredDrawFirst_When_TheBudgetRunsOnce', function*({ expect }) {
  const store = tempTestFile()
  const name = '∀n_StoreOneRun_=Replay'
  const first: Array<number> = []
  const left: Array<number> = []
  const right: Array<number> = []
  const refuted = refutedOf(
    yield* Effect.promise(() => recordOfProperty({ ...refuting(name, first), store, budget: {} })),
  )
  const counterexample = counterexampleOf(refuted)
  yield* Effect.promise(() => recordOfProperty({ ...refuting(name, left), store, budget: { runs: 1 } }))
  yield* Effect.promise(() => recordOfProperty({ ...refuting(name, right), store, budget: { runs: 3 } }))
  yield* expect(replayShape(left, right, counterexample)).toEqual({
    identical: true,
    nonEmpty: true,
    endsAtCounterexample: true,
  })
})

it('Should_LeaveNothingToReplay_When_RecordingIsOptedOut', function*({ expect }) {
  const store = tempTestFile()
  const name = '∀n_StoreOptedOut_∅Replay'
  const first: Array<number> = []
  const withStore: Array<number> = []
  const control: Array<number> = []
  yield* Effect.promise(() => recordOfProperty({ ...refuting(name, first), store, budget: { record: false } }))
  yield* Effect.promise(() => recordOfProperty({ ...refuting(name, withStore), store, budget: { seed: 1 } }))
  yield* Effect.promise(() => recordOfProperty({ ...refuting(name, control), budget: { seed: 1 } }))
  yield* expect({ sameAsControl: sameNumbers(withStore, control), drew: withStore.length > 0 }).toEqual({
    sameAsControl: true,
    drew: true,
  })
})

it('Should_LeaveNothingToReplay_When_TheVerdictIsVacuous', function*({ expect }) {
  const store = tempTestFile()
  const name = '∀x_StoreVacuous_∅Replay'
  const withStore: Array<number> = []
  const control: Array<number> = []
  yield* Effect.promise(() =>
    recordOfFile((api) => {
      api.prop(
        name,
        { of: [Schema.Literal(1)] as const, subject: (): Record<string, never> | undefined => ({}), runs: 3 },
        (subject) => subject() !== undefined,
      )
    }, { store, budget: {} })
  )
  yield* Effect.promise(() => recordOfProperty({ ...refuting(name, withStore), store, budget: { seed: 1 } }))
  yield* Effect.promise(() => recordOfProperty({ ...refuting(name, control), budget: { seed: 1 } }))
  yield* expect({ sameAsControl: sameNumbers(withStore, control), drew: withStore.length > 0 }).toEqual({
    sameAsControl: true,
    drew: true,
  })
})

it('Should_LeaveNothingToReplay_When_TheVerdictIsUnderCovered', function*({ expect }) {
  const store = tempTestFile()
  const name = '∀n_StoreUncovered_∅Replay'
  const withStore: Array<number> = []
  const control: Array<number> = []
  yield* Effect.promise(() =>
    recordOfProperty({
      name,
      spec: {
        of: [Schema.Literal(1)] as const,
        subject: identitySubject,
        runs: 2048,
        cover: { never: [(): boolean => false, 0.5] as const },
      },
      holds: (): boolean => true,
      store,
      budget: {},
    })
  )
  yield* Effect.promise(() => recordOfProperty({ ...refuting(name, withStore), store, budget: { seed: 1 } }))
  yield* Effect.promise(() => recordOfProperty({ ...refuting(name, control), budget: { seed: 1 } }))
  yield* expect({ sameAsControl: sameNumbers(withStore, control), drew: withStore.length > 0 }).toEqual({
    sameAsControl: true,
    drew: true,
  })
})

it('Should_FailWithSeedStoreUnreadable_When_TheLineIsInvalidJson', function*({ expect }) {
  const store = tempTestFile()
  const seen: Array<number> = []
  writeStoreLines({
    testFile: store,
    lines: ['{"_tag":"NonBoolean","property":"nobody","seed":5,"runs":1}', '{not json'],
  })
  const unreadable = unreadableOf(
    yield* Effect.promise(() => recordOfProperty({ ...refuting('∀n_BadLine_⊥', seen), store })),
  )
  yield* expect({ tag: unreadable._tag, line: unreadable.line, file: unreadable.file }).toEqual({
    tag: 'SeedStoreUnreadable',
    line: 2,
    file: seedStorePath(store),
  })
})

it('Should_IgnoreAStoreEntry_When_NoPropertyMatchesItsName', function*({ expect }) {
  const store = tempTestFile()
  const name = '∀n_UnmatchedEntry_∅Replay'
  const withStore: Array<number> = []
  const control: Array<number> = []
  writeStoreLines({
    testFile: store,
    lines: ['{"_tag":"NonBoolean","property":"nobody","seed":5,"runs":1}'],
  })
  const refuted = refutedOf(
    yield* Effect.promise(() => recordOfProperty({ ...refuting(name, withStore), store, budget: { seed: 1 } })),
  )
  yield* Effect.promise(() => recordOfProperty({ ...refuting(name, control), budget: { seed: 1 } }))
  yield* expect({ tag: refuted._tag, sameAsControl: sameNumbers(withStore, control) }).toEqual({
    tag: 'PropertyRefuted',
    sameAsControl: true,
  })
})

it('Should_CountARecordedCheckTowardTheFileJudgment_When_TheImpostorIsRefutedByIt', function*({ expect }) {
  const store = tempTestFile()
  const name = '∀n_RecordedDraw_⊆Judgment'
  yield* Effect.promise(() => recordOfProperty({ ...writing(name), store, budget: {} }))
  const recorded = yield* Effect.promise(() =>
    recordOfFile((api) => {
      api.prop(name, increasing(name).spec, increasing(name).holds)
    }, { store, budget: {} })
  )
  const control = yield* Effect.promise(() =>
    recordOfFile((api) => {
      api.prop(name, increasing(name).spec, increasing(name).holds)
    }, { budget: {} })
  )
  yield* expect({
    withRecorded: recorded.vacuous === undefined,
    controlVacuous: control.vacuous !== undefined,
  }).toEqual({ withRecorded: true, controlVacuous: true })
})
