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

// Own seeds pin the recorded draw and the novel draw. The constant impostor freezes the subject's output at
// the first draw, so it is refuted only when a later draw differs; with fresh seeds the two draws matched in
// about one run in 80, and the recorded check then had nothing to refute.
const RECORDED_SEED = 1

const NOVEL_SEED = 987_654

const writing = (name: string) => ({
  name,
  spec: { of: [Schema.Int] as const, subject: successor, runs: 1, arbitrary: { seed: RECORDED_SEED } },
  holds: (): boolean => returnsAnObject(),
})

const increasing = (name: string, seen: Array<number>) => ({
  name,
  spec: { of: [Schema.Int] as const, subject: successor, runs: 1, arbitrary: { seed: NOVEL_SEED } },
  holds: (subject: (value: number) => number, values: ReadonlyArray<number>): boolean => {
    const value = values[0] ?? 0
    seen.push(value)
    return subject(value) === value + 1
  },
})

const belowFive = (name: string, seen: Array<number>) => ({
  name,
  spec: { of: [Schema.Int] as const, subject: identitySubject, arbitrary: { seed: RECORDED_SEED } },
  holds: (_subject: (value: number) => number, values: ReadonlyArray<number>): boolean => {
    const value = values[0] ?? 0
    seen.push(value)
    return value < 5
  },
})

const reportedCounterexample = (failure: PropertyRefuted): ReadonlyArray<number> | undefined =>
  Option.getOrUndefined(Schema.decodeUnknownOption(Schema.Array(Schema.Finite))(failure.counterexample.value))

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
  const drawn: Array<number> = []
  yield* Effect.promise(() => recordOfProperty({ ...writing(name), store, budget: {} }))
  const recorded = yield* Effect.promise(() =>
    recordOfFile((api) => {
      const property = increasing(name, drawn)
      api.prop(name, property.spec, property.holds)
    }, { store, budget: {} })
  )
  const control = yield* Effect.promise(() =>
    recordOfFile((api) => {
      const property = increasing(name, [])
      api.prop(name, property.spec, property.holds)
    }, { budget: {} })
  )
  yield* expect({
    distinctDraws: drawn[0] !== drawn[1],
    withRecorded: recorded.vacuous === undefined,
    controlVacuous: control.vacuous !== undefined,
  }).toEqual({ distinctDraws: true, withRecorded: true, controlVacuous: true })
})

it('Should_Hold_When_TheRecordedRefutationNoLongerReproduces', function*({ expect }) {
  const store = tempTestFile()
  const name = '∀n_FixedSinceRecorded_=Held'
  const recorded = refutedOf(yield* Effect.promise(() => recordOfProperty({ ...belowFive(name, []), store })))
  const fixed = yield* Effect.promise(() =>
    recordOfProperty({
      name,
      spec: { of: [Schema.Int] as const, subject: identitySubject, arbitrary: { seed: NOVEL_SEED } },
      holds: (subject, values) => subject(values[0]) === values[0],
      store,
    })
  )
  yield* expect({ recorded: recorded._tag, fixed: fixed === undefined }).toEqual({
    recorded: 'PropertyRefuted',
    fixed: true,
  })
})

it('Should_ReportTheRecordedRootAsTheCounterexample_When_ItsShrinkPathNoLongerReplays', function*({ expect }) {
  const store = tempTestFile()
  const name = '∀n_RootStillFails_=Root'
  const seen: Array<number> = []
  const recorded = refutedOf(yield* Effect.promise(() => recordOfProperty({ ...belowFive(name, seen), store })))
  const root = seen.find((value) => value >= 5)
  const stillRefuted = refutedOf(
    yield* Effect.promise(() =>
      recordOfProperty({
        name,
        spec: { of: [Schema.Int] as const, subject: identitySubject, arbitrary: { seed: NOVEL_SEED } },
        holds: (_subject: (value: number) => number, values: ReadonlyArray<number>): boolean => values[0] !== root,
        store,
      })
    ),
  )
  yield* expect({ shrunk: recorded.shrinks > 0, counterexample: reportedCounterexample(stillRefuted) }).toEqual({
    shrunk: true,
    counterexample: [root],
  })
})

it('Should_JudgeTheFileVacuous_When_OnlyAStaleRecordedDrawCouldRefuteTheImpostor', function*({ expect }) {
  const store = tempTestFile()
  const name = '∀n_StaleRecordedDraw_∅Refutes'
  yield* Effect.promise(() => recordOfProperty({ ...belowFive(name, []), store }))
  const judged = yield* Effect.promise(() =>
    recordOfFile((api) => {
      api.prop(
        name,
        { of: [Schema.Int] as const, subject: identitySubject, arbitrary: { seed: NOVEL_SEED } },
        (subject, values) => subject(values[0]) === subject(values[0]),
      )
    }, { store })
  )
  yield* expect({
    failed: judged.records.some((record) => record !== undefined),
    vacuous: judged.vacuous !== undefined,
  }).toEqual({ failed: false, vacuous: true })
})
