import { it } from '@systemfsoftware/vitest'
import { type FailureRecord, recordOfProperty, testIdentityOf } from '@systemfsoftware/vitest/failure'
import { Effect, Schema } from 'effect'

const replaySeedOf = (record: FailureRecord | undefined): string | undefined => {
  if (record === undefined) return undefined
  return /seed=(\d+)/u.exec(record.record)?.[1]
}

const sameNumbers = (left: ReadonlyArray<number>, right: ReadonlyArray<number>): boolean =>
  left.length === right.length && left.every((value, index) => value === right[index])

const FNV_OFFSET_BASIS = 2166136261
const FNV_PRIME = 16777619

const referenceFnv1a32 = (text: string): number =>
  new TextEncoder().encode(text).reduce((hash, byte) => Math.imul(hash ^ byte, FNV_PRIME), FNV_OFFSET_BASIS) >>> 0

const referenceIdentitySeed = (salt: number | string, identity: Identity): number =>
  referenceFnv1a32([String(salt), identity.package, identity.file, identity.name].join('\u0000'))

interface Identity {
  readonly package: string
  readonly file: string
  readonly name: string
}

const IDENTITY: Identity = { package: 'pkg', file: 'tests/a.test.ts', name: 'prop' }
const HASH_OF_HELLO = 0x4f9f2cab
const HASH_OF_SALTED_IDENTITY = 0x4925757f

const identitySubject = (value: number): number => value

const recording = (name: string, seen: Array<number>, runs?: number) => ({
  name,
  spec: { of: [Schema.Natural] as const, subject: identitySubject, ...(runs === undefined ? {} : { runs }) },
  holds: (subject: (value: number) => number, values: ReadonlyArray<number>): boolean => {
    const value = values[0] ?? 0
    if (subject === identitySubject) seen.push(value)
    return subject(value) === value
  },
})

const covering = (name: string, seen: Array<number>) => ({
  name,
  spec: {
    of: [Schema.Natural] as const,
    subject: identitySubject,
    runs: 1,
    cover: {
      never: [
        (value: number): boolean => {
          seen.push(value)
          return false
        },
        0.6,
      ] as const,
    },
  },
  holds: (): boolean => true,
})

it('Should_DrawOneHundredFreshValues_When_NoBudgetIsProvided', function*({ expect }) {
  const first: Array<number> = []
  const second: Array<number> = []
  yield* Effect.promise(() => recordOfProperty(recording('∀n_FreshDraws_=Configured', first)))
  yield* Effect.promise(() => recordOfProperty(recording('∀n_FreshDraws_=Configured', second)))
  yield* expect({
    length: first.length,
    differs: first.some((value, index) => value !== second[index]),
  }).toEqual({ length: 100, differs: true })
})

it('Should_DrawDifferentValues_When_TwoPropertyNamesShareAProvidedSeed', function*({ expect }) {
  const left: Array<number> = []
  const right: Array<number> = []
  yield* Effect.promise(() => recordOfProperty({ ...recording('∀n_SeedSalt_≠Left', left, 3), budget: { seed: 1 } }))
  yield* Effect.promise(() => recordOfProperty({ ...recording('∀n_SeedSalt_≠Right', right, 3), budget: { seed: 1 } }))
  yield* expect(left).not.toEqual(right)
})

it('Should_DrawTheSameValues_When_TheSamePropertyRunsTwiceUnderAProvidedSeed', function*({ expect }) {
  const first: Array<number> = []
  const second: Array<number> = []
  const name = '∀n_SeedStable_=Same'
  yield* Effect.promise(() => recordOfProperty({ ...recording(name, first, 3), budget: { seed: 1 } }))
  yield* Effect.promise(() => recordOfProperty({ ...recording(name, second, 3), budget: { seed: 1 } }))
  yield* expect(first).toEqual(second)
})

it('Should_ReportItsOwnSeed_When_ItsSeededPropertyIsRefuted', function*({ expect }) {
  const record = yield* Effect.promise(() =>
    recordOfProperty({
      name: '∀n_OwnSeed_⊥Holds',
      spec: { of: [Schema.Natural] as const, subject: identitySubject, runs: 1, arbitrary: { seed: 7 } },
      holds: () => false,
    })
  )
  yield* expect(replaySeedOf(record)).toEqual('7')
})

it('Should_RefuseANegativeOwnSeed_When_TheBudgetIsInvalid', function*({ expect }) {
  const record = yield* Effect.promise(() =>
    recordOfProperty({
      name: '∀n_InvalidSeed_⊥',
      spec: { of: [Schema.Natural] as const, subject: identitySubject, runs: 1, arbitrary: { seed: -1 } },
      holds: () => false,
    })
  )
  yield* expect(record?.name).toEqual('InvalidBudget')
})

it('Should_MapFixedInputsToTheHandComputedHashes_When_TheFnvDefinitionIsApplied', function*({ expect }) {
  yield* expect({
    hello: referenceFnv1a32('hello'),
    identity: referenceIdentitySeed(1, IDENTITY),
  }).toEqual({ hello: HASH_OF_HELLO, identity: HASH_OF_SALTED_IDENTITY })
})

it('Should_SaltItsIdentity_When_ItsProvidedSeedIsGiven', function*({ expect }) {
  const identity = testIdentityOf()
  const name = '∀n_IdentitySalt_=Hash'
  const record = yield* Effect.promise(() =>
    recordOfProperty({
      name,
      spec: { of: [Schema.Natural] as const, subject: identitySubject, runs: 1 },
      holds: () => false,
      budget: { seed: 1 },
    })
  )
  yield* expect(replaySeedOf(record)).toEqual(String(referenceIdentitySeed(1, { ...identity, name })))
})

it('Should_SeedEachTopUpBatchSeparately_When_TheCoverClassNeverSatisfies', function*({ expect }) {
  const first: Array<number> = []
  const second: Array<number> = []
  const name = '∀n_TopUpSeeds_≠Batch'
  yield* Effect.promise(() => recordOfProperty({ ...covering(name, first), budget: { seed: 1 } }))
  yield* Effect.promise(() => recordOfProperty({ ...covering(name, second), budget: { seed: 1 } }))
  yield* expect({
    longEnough: first.length > 128,
    repeatable: sameNumbers(first, second),
    batchesDiffer: first.at(1) !== first.at(65),
  }).toEqual({ longEnough: true, repeatable: true, batchesDiffer: true })
})
