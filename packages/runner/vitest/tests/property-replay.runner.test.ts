/**
 * The replay channel (R9-R12, KTD5, AE4): a property failure's replay text, fed back through `CONFORMANCE_REPLAY`,
 * reproduces the same verdict. A refuted property's text rebuilds the generator's token, so the same shrunk
 * counterexample returns; a vacuous verdict's text names each property's seed and runs, so the same frozen outputs
 * return without a novel draw. A text naming another identity, or the kernel's own form, leaves the property on its
 * normal draws; a text naming neither form refuses the run.
 *
 * Expected values are the first run's fields or literals (CONST-T10), never the parser's own output.
 */
import {
  afterAll,
  it,
  onTestFinished,
  PropertyRefuted,
  ReplayNoLongerReproduces,
  ReplayUnreadable,
  type VacuousProperty,
  vi,
} from '@systemfsoftware/vitest'
import { type FailureRecord, recordOfFile, recordOfProperty, replayOfText } from '@systemfsoftware/vitest/failure'
import { Effect, Schema } from 'effect'

type Opaque<A = unknown> = A

const failureOf = (record: FailureRecord | undefined): Opaque => {
  if (record === undefined) throw new Error('expected a failure record')
  return record.failure
}

const refutedOf = (record: FailureRecord | undefined): PropertyRefuted => {
  const failure = failureOf(record)
  if (Schema.is(PropertyRefuted)(failure)) return failure
  throw new Error('expected a PropertyRefuted failure')
}

const refusalOf = (record: FailureRecord | undefined): ReplayUnreadable => {
  const failure = failureOf(record)
  if (Schema.is(ReplayUnreadable)(failure)) return failure
  throw new Error('expected a ReplayUnreadable failure')
}

const staleOf = (record: FailureRecord | undefined): ReplayNoLongerReproduces => {
  const failure = failureOf(record)
  if (Schema.is(ReplayNoLongerReproduces)(failure)) return failure
  throw new Error('expected a ReplayNoLongerReproduces failure')
}

const vacuousOf = (vacuous: VacuousProperty | undefined): VacuousProperty => {
  if (vacuous !== undefined) return vacuous
  throw new Error('expected a VacuousProperty verdict')
}

const firstEntryOf = (vacuous: VacuousProperty): VacuousProperty['subjects'][number]['properties'][number] => {
  const entry = vacuous.subjects[0]?.properties[0]
  if (entry === undefined) throw new Error('expected a vacuous property entry')
  return entry
}

const refutedFor = (name: string, seed: number) => ({
  name,
  spec: { of: [Schema.Int] as const, subject: (value: number): number => value, runs: 1, arbitrary: { seed } },
  holds: (): boolean => false,
})

const holdingFor = (name: string) => ({
  name,
  spec: { of: [Schema.Literal(1)] as const, subject: (value: number): number => value, runs: 1 },
  holds: (): boolean => true,
})

const passingIntFor = (name: string) => ({
  name,
  spec: { of: [Schema.Int] as const, subject: (value: number): number => value, runs: 1, arbitrary: { seed: 999 } },
  holds: (): boolean => true,
})

const emptySubject = (): Record<string, never> => ({})

const VACUOUS_NAME = '∀x_VacuousReplayed_⊆Frozen'

it('Should_ReproduceTheRefutedVerdict_When_ItsReplayTextIsFedBack', function*({ expect }) {
  const first = yield* Effect.promise(() => recordOfProperty(refutedFor('∀x_RefutedFirst_≢Itself', 1)))
  const refuted = refutedOf(first)
  yield* Effect.sync(() => {
    vi.stubEnv('CONFORMANCE_REPLAY', refuted.replay)
  })
  onTestFinished(() => {
    vi.unstubAllEnvs()
  })
  const second = yield* Effect.promise(() => recordOfProperty(refutedFor('∀x_RefutedFirst_≢Itself', 999)))
  const replayed = refutedOf(second)
  yield* expect({
    firstSeed: refuted.property.seed,
    replayedSeed: replayed.property.seed,
    firstRuns: refuted.property.runs,
    replayedRuns: replayed.property.runs,
    sameCounterexample: JSON.stringify(replayed.counterexample) === JSON.stringify(refuted.counterexample),
    sameReplay: replayed.replay === refuted.replay,
  }).toEqual({
    firstSeed: 1,
    replayedSeed: 1,
    firstRuns: 1,
    replayedRuns: 1,
    sameCounterexample: true,
    sameReplay: true,
  })
})

it('Should_Fail_When_TheExplicitReplayNoLongerReproduces', function*({ expect }) {
  const name = '∀x_StaleReplay_≢Passed'
  const first = yield* Effect.promise(() => recordOfProperty(refutedFor(name, 1)))
  const refuted = refutedOf(first)
  yield* Effect.sync(() => {
    vi.stubEnv('CONFORMANCE_REPLAY', refuted.replay)
  })
  onTestFinished(() => {
    vi.unstubAllEnvs()
  })
  const second = yield* Effect.promise(() => recordOfProperty(passingIntFor(name)))
  const stale = staleOf(second)
  yield* expect({ tag: stale._tag, name: stale.property.name, replay: stale.replay }).toEqual({
    tag: 'ReplayNoLongerReproduces',
    name,
    replay: refuted.replay,
  })
})

it('Should_ReproduceTheVacuousVerdict_When_ItsReplayTextIsFedBack', function*({ expect }) {
  const first = yield* Effect.promise(() =>
    recordOfFile((api) => {
      api.prop(
        VACUOUS_NAME,
        { of: [Schema.Literal(1)] as const, subject: emptySubject, runs: 5, arbitrary: { seed: 3 } },
        (subject) => {
          subject()
          return true
        },
      )
    })
  )
  const served = vacuousOf(first.vacuous)
  yield* Effect.sync(() => {
    vi.stubEnv('CONFORMANCE_REPLAY', served.replay)
  })
  onTestFinished(() => {
    vi.unstubAllEnvs()
  })
  const second = yield* Effect.promise(() =>
    recordOfFile((api) => {
      api.prop(
        VACUOUS_NAME,
        { of: [Schema.Literal(1)] as const, subject: emptySubject, runs: 9, arbitrary: { seed: 999 } },
        (subject) => {
          subject()
          return true
        },
      )
    })
  )
  const replayed = vacuousOf(second.vacuous)
  const firstEntry = firstEntryOf(served)
  const replayedEntry = firstEntryOf(replayed)
  yield* expect({
    firstRuns: firstEntry.property.runs,
    replayedRuns: replayedEntry.property.runs,
    firstSeed: firstEntry.property.seed,
    replayedSeed: replayedEntry.property.seed,
    sameFrozen: JSON.stringify(replayedEntry.frozen) === JSON.stringify(firstEntry.frozen),
  }).toEqual({ firstRuns: 5, replayedRuns: 5, firstSeed: 3, replayedSeed: 3, sameFrozen: true })
})

it('Should_KeepItsNormalDraws_When_TheReplayNamesAnotherIdentity', function*({ expect }) {
  const other = yield* Effect.promise(() => recordOfProperty(refutedFor('∀x_OtherIdentityFirst_≢Itself', 1)))
  yield* Effect.sync(() => {
    vi.stubEnv('CONFORMANCE_REPLAY', refutedOf(other).replay)
  })
  onTestFinished(() => {
    vi.unstubAllEnvs()
  })
  const second = yield* Effect.promise(() => recordOfProperty(refutedFor('∀x_OtherIdentitySecond_≢Itself', 999)))
  yield* expect({ seed: refutedOf(second).property.seed }).toEqual({ seed: 999 })
})

it('Should_ReadTheKernelForm_When_TheTextNamesASeedAndDecisions', function*({ expect }) {
  yield* expect(replayOfText('seed=7;path=1,2,3')).toEqual({ seed: 7, path: [1, 2, 3] })
})

it('Should_RefuseTheRun_When_TheReplayTextNamesNeitherForm', function*({ expect }) {
  yield* Effect.sync(() => {
    vi.stubEnv('CONFORMANCE_REPLAY', 'not a replay')
  })
  onTestFinished(() => {
    vi.unstubAllEnvs()
  })
  const record = yield* Effect.promise(() => recordOfProperty(holdingFor('∀x_HoldingRefused_⊆Replay')))
  yield* expect({ text: refusalOf(record).text }).toEqual({ text: 'not a replay' })
})

afterAll(() => {
  vi.unstubAllEnvs()
})
