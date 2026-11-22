/**
 * The run's property settings reaching `it.prop` (R9): `PROPERTY_RUNS` over a property's own count, `PROPERTY_SEED`
 * over its own seed, and a seed the commit decides off the local tier. Each scenario hands the run its settings, as
 * `PropertyConfig` carries them from the environment.
 */
import { it, PropertyRefuted, type PropertySettings } from '@systemfsoftware/vitest'
import { type FailureRecord, recordOfProperty } from '@systemfsoftware/vitest/failure'
import { Effect, Option, Schema } from 'effect'

const LOCAL: PropertySettings = {
  tier: 'local',
  runs: Option.none(),
  seed: Option.none(),
  replay: Option.none(),
  commit: Option.none(),
}

const refutedOf = (record: FailureRecord | undefined): PropertyRefuted => {
  if (record !== undefined && Schema.is(PropertyRefuted)(record.failure)) return record.failure
  throw new Error('expected a PropertyRefuted failure')
}

const identity = (value: number): number => value

// Runs a holding property that asks for three runs and counts the ones made on its own subject; the runner also
// checks each draw against an impostor subject, which this leaves out.
const runsUnder = (name: string, settings: PropertySettings) =>
  Effect.gen(function*() {
    let calls = 0
    yield* Effect.promise(() =>
      recordOfProperty({
        name,
        spec: { of: [Schema.Int] as const, subject: identity, runs: 3 },
        holds: (subject) => {
          if (subject === identity) calls += 1
          return true
        },
        settings,
      })
    )
    return calls
  })

const refutedSeedUnder = (name: string, settings: PropertySettings, own: Option.Option<number>) =>
  Effect.map(
    Effect.promise(() =>
      recordOfProperty({
        name,
        spec: {
          of: [Schema.Int] as const,
          subject: (value: number): number => value,
          runs: 1,
          ...Option.match(own, { onNone: () => ({}), onSome: (seed) => ({ arbitrary: { seed } }) }),
        },
        holds: (): boolean => false,
        settings,
      })
    ),
    (record) => refutedOf(record).property.seed,
  )

it('Should_KeepThreeRuns_When_TheSettingsCarryNoRunCount', function*({ expect }) {
  yield* expect(yield* runsUnder('∀x_OwnRunsKept_⊆Int', LOCAL)).toEqual(3)
})

it('Should_RunSevenTimes_When_PropertyRunsIsSevenOverTheOwnThree', function*({ expect }) {
  yield* expect(yield* runsUnder('∀x_RunsOverridden_⊆Int', { ...LOCAL, runs: Option.some(7) })).toEqual(7)
})

it('Should_DrawFromSeedFortyTwo_When_PropertySeedIsFortyTwoOverTheOwnSeed', function*({ expect }) {
  yield* expect(
    yield* refutedSeedUnder('∀x_SeedOverridden_≢Itself', { ...LOCAL, seed: Option.some(42) }, Option.some(999)),
  ).toEqual(42)
})

const ciAt = (commit: string): PropertySettings => ({ ...LOCAL, tier: 'ci', commit: Option.some(commit) })

const COMMIT = '0000002a' + 'f'.repeat(32)
const OTHER_COMMIT = '0000002b' + 'f'.repeat(32)

it('Should_DrawTheSameSeed_When_CiRunsTheSameCommitTwice', function*({ expect }) {
  const first = yield* refutedSeedUnder('∀x_CommitSeeded_≢Itself', ciAt(COMMIT), Option.none())
  const second = yield* refutedSeedUnder('∀x_CommitSeeded_≢Itself', ciAt(COMMIT), Option.none())
  yield* expect(second).toEqual(first)
})

it('Should_DrawAnotherSeed_When_CiRunsAnotherCommit', function*({ expect }) {
  const first = yield* refutedSeedUnder('∀x_CommitSeeded_≢Itself', ciAt(COMMIT), Option.none())
  const other = yield* refutedSeedUnder('∀x_CommitSeeded_≢Itself', ciAt(OTHER_COMMIT), Option.none())
  yield* expect(other).toSatisfy((seed) => seed !== first, 'another commit draws another seed')
})
