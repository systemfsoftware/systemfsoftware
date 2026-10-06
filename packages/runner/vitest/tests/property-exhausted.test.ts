import { it, PropertyExhausted } from '@systemfsoftware/vitest'
import { type FailureRecord, recordOfProperty } from '@systemfsoftware/vitest/failure'
import { Arbitrary, Effect, Schema } from 'effect'
import { storedEntries, tempTestFile, writeStoreLines } from './__fixtures__/seed-store-temp.js'

type Opaque<A = unknown> = A

const failureOf = (record: FailureRecord | undefined): Opaque => {
  if (record === undefined) throw new Error('expected a failure record')
  return record.failure
}

const exhaustedOf = (record: FailureRecord | undefined): PropertyExhausted => {
  const failure = failureOf(record)
  if (Schema.is(PropertyExhausted)(failure)) return failure
  throw new Error('expected a PropertyExhausted failure')
}

const identityNumber = (value: number): number => value

const rejectsEveryDraw = (): boolean => false

/** Every draw is rejected, so the check never reaches the property: exhaustion, not refutation. */
const neverDraws = Arbitrary.filter(Arbitrary.schema(Schema.Int), rejectsEveryDraw)

// A nested run with no `budget` inherits the run's configured defaults, and CI's carry `record: false`, under
// which "wrote nothing" holds whatever the engine does; pinning the budget keeps recording on everywhere.
const PINNED_BUDGET = {}

const exhausting = (name: string, store?: string) => ({
  name,
  spec: {
    of: [neverDraws] as const,
    subject: identityNumber,
    runs: 5,
    arbitrary: { seed: 1, maxDiscards: 4 },
  },
  holds: (): boolean => true,
  store,
  budget: PINNED_BUDGET,
})

it('Should_ReportExhaustionAndRecordNothing_When_TheGeneratorDiscardsEveryDraw', function*({ expect }) {
  const store = tempTestFile()
  const record = yield* Effect.promise(() => recordOfProperty(exhausting('∀n_Exhausted_⊇Discards', store)))
  const failure = exhaustedOf(record)
  yield* expect({
    tag: failure._tag,
    name: failure.property.name,
    seed: failure.property.seed,
    runs: failure.property.runs,
    discards: failure.discards,
    budget: failure.budget,
    stored: storedEntries(store),
  }).toEqual({
    tag: 'PropertyExhausted',
    name: '∀n_Exhausted_⊇Discards',
    seed: 1,
    runs: 5,
    discards: 5,
    budget: { runs: 5, maxDiscards: 4 },
    stored: 0,
  })
})

it('Should_CarryTheUncappedBudget_When_NoDiscardCapIsConfigured', function*({ expect }) {
  const record = yield* Effect.promise(() =>
    recordOfProperty({
      name: '∀n_Exhausted_∅Cap',
      spec: { of: [neverDraws] as const, subject: identityNumber, runs: 1, arbitrary: { seed: 1 } },
      holds: (): boolean => true,
      budget: PINNED_BUDGET,
    })
  )
  const failure = exhaustedOf(record)
  yield* expect({
    budget: failure.budget,
    namesItsDiscards: failure.message.includes(`${failure.discards} draw(s)`),
    namesTheUncappedRun: failure.message.includes('no configured discard cap'),
  }).toEqual({
    budget: { runs: 1, maxDiscards: null },
    namesItsDiscards: true,
    namesTheUncappedRun: true,
  })
})

it('Should_ReportExhaustion_When_ARecordedCheckDiscardsEveryDraw', function*({ expect }) {
  const store = tempTestFile()
  const name = '∀n_RecordedExhausted_⊇Discards'
  writeStoreLines({ testFile: store, lines: [`{"_tag":"NonBoolean","property":"${name}","seed":7,"runs":3}`] })
  const failure = exhaustedOf(yield* Effect.promise(() => recordOfProperty(exhausting(name, store))))
  yield* expect({ tag: failure._tag, seed: failure.property.seed, runs: failure.property.runs }).toEqual({
    tag: 'PropertyExhausted',
    seed: 7,
    runs: 3,
  })
})
