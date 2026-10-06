import { Handle } from '@systemfsoftware/effect-cell-types'
import { UnitOfWork } from '@systemfsoftware/effect-unit-of-work'
import {
  Broken,
  CONCURRENT_UNITS_SERIAL,
  concurrentUnitsSerialize,
  CROSS_KEY_COMMUTE,
  crossKeyCommute,
  ENDED_UNIT_DIES,
  endedUnitDies,
  ENGINE_RERUNS_SERIALIZATION_FAILURE,
  engineRerunsSerializationFailure,
  FAILED_UNIT_WRITES_NOTHING,
  failedUnitWritesNothing,
  Granted,
  RACE,
  race,
  type RaceSubject,
  type StoreSubject,
} from '@systemfsoftware/effect-unit-of-work/laws'
import { Effect, Layer, Option, Ref } from 'effect'
import { type LawName, type LawRun, type LawSubject, lawSubjectWith } from './law-subject.fixture.js'
import {
  empty,
  makeDriver,
  type SeatsDriver,
  seatsEngineRetrySubject,
  seatsEscapingSubject,
  type SeatsState,
  seatsSubject,
  subjectOf,
} from './seats.fixture.js'

const seatsHeld = (state: SeatsState, prefix: string): readonly string[] =>
  Object.keys(state).filter((key) => key.startsWith(prefix))

const unavailable = (cause: string): UnitOfWork.StoreUnavailable => new UnitOfWork.StoreUnavailable({ cause })

const writeWith = (base: SeatsDriver, write: SeatsDriver['write']): SeatsDriver => ({ ...base, write })

/** Swallows every write after the first one a unit makes. */
const swallowingSecondWrite = (state: Ref.Ref<SeatsState>): SeatsDriver => {
  const seen = { wrote: false }
  return writeWith(makeDriver(state), (key, value) =>
    seen.wrote
      ? Effect.void
      : Effect.andThen(
        Effect.sync(() => {
          seen.wrote = true
        }),
        Ref.update(state, (current) => ({ ...current, [key]: value })),
      ))
}

/** Truncates a write to a key ordered below one the same unit already wrote. */
const tearingLowerKey = (state: Ref.Ref<SeatsState>): SeatsDriver => {
  const seen = { last: '' }
  return writeWith(makeDriver(state), (key, value) =>
    key < seen.last
      ? Ref.update(state, (current) => ({ ...current, [key]: '' }))
      : Effect.andThen(
        Effect.sync(() => {
          seen.last = key
        }),
        Ref.update(state, (current) => ({ ...current, [key]: value })),
      ))
}

/** Stores a torn constant instead of the value it was handed. */
const tearingWrite = (state: Ref.Ref<SeatsState>): SeatsDriver =>
  writeWith(makeDriver(state), (key) => Ref.update(state, (current) => ({ ...current, [key]: 'torn' })))

/** Refuses every claim before it can decide. */
const refusingClaim = (state: Ref.Ref<SeatsState>): SeatsDriver => ({
  ...makeDriver(state),
  claim: () => Effect.fail(unavailable('the claim failed')),
})

/** Grants every claim, so the cap is not honoured. */
const grantingEveryClaim = (state: Ref.Ref<SeatsState>): SeatsDriver => ({
  ...makeDriver(state),
  claim: () => Effect.succeed(new Granted({})),
})

/** Reports one fewer stored row than the store holds. */
const droppingOneCount = (state: Ref.Ref<SeatsState>): SeatsDriver => ({
  ...makeDriver(state),
  count: (prefix) => Effect.map(Ref.get(state), (current) => Math.max(0, seatsHeld(current, prefix).length - 1)),
})

const subjectFrom = (
  variant: (state: Ref.Ref<SeatsState>) => SeatsDriver,
): Effect.Effect<StoreSubject<SeatsDriver>> => Effect.map(UnitOfWork.memory(empty, variant), subjectOf)

const raceFrom = (
  variant: (state: Ref.Ref<SeatsState>) => SeatsDriver,
  cap: number,
): Effect.Effect<RaceSubject<SeatsDriver>> =>
  Effect.map(UnitOfWork.memory(empty, variant), (port): RaceSubject<SeatsDriver> => ({
    unitOfWork: port,
    cap,
    read: (unit, key) => UnitOfWork.use(unit, (driver) => driver.read(key)),
    write: (unit, key, value) => UnitOfWork.use(unit, (driver) => driver.write(key, value)),
    claim: (unit, request) => UnitOfWork.use(unit, (driver) => driver.claim(request)),
    count: (unit) => UnitOfWork.use(unit, (driver) => driver.count('seat/')),
  }))

/** The handle the package mints its units with, so a broken subject can leak a live one. */
const UnitHandle = Handle.make<Record<never, never>, UnitOfWork.UnitSlot, Record<never, never>>()(UnitOfWork.TypeId)

/**
 * A deliberately broken subject whose unit of work hands back a unit it never closes. A real
 * adapter must close the unit it minted; leaking it is exactly the defect the ended-unit law
 * trips over, and the only way to produce the observation the workflow's remaining branch needs.
 */
const leakedUnitSubject: StoreSubject<Record<never, never>> = {
  unitOfWork: <A, E, R>(f: (unit: UnitOfWork.Unit<Record<never, never>>) => Effect.Effect<A, E, R>) =>
    Effect.gen(function*() {
      const state = yield* Ref.make<UnitOfWork.UnitState>(UnitOfWork.Open.make({}))
      const unit = UnitHandle.make<Record<never, never>>({}, { driver: {}, state })
      return yield* f(unit)
    }),
  read: () => Effect.succeed(Option.none<string>()),
  write: () => Effect.void,
}

/** An engine-shaped subject that never retries, so the unit is seen to run once. */
const runsOnceEngine = Effect.map(
  seatsSubject,
  (subject) => ({ ...subject, armSerializationFailure: Effect.void, unitRuns: Effect.succeed(1) }),
)

export type Tripwire = {
  readonly name: string
  readonly law: LawName
  readonly layer: Layer.Layer<LawSubject>
  readonly broken: Broken
}

const escapingLaw: LawRun = () =>
  Effect.flatMap(seatsEscapingSubject, (s) => failedUnitWritesNothing(s, 'law/escaping', 'settled'))

const swallowedOrderLaw: LawRun = () =>
  Effect.flatMap(
    subjectFrom(swallowingSecondWrite),
    (s) => crossKeyCommute(s, ['law/left', 'held'], ['law/right', 'held']),
  )

const tornOrderLaw: LawRun = () =>
  Effect.flatMap(subjectFrom(tearingLowerKey), (s) => crossKeyCommute(s, ['law/left', 'held'], ['law/right', 'held']))

const tornSerialLaw: LawRun = () =>
  Effect.flatMap(subjectFrom(tearingWrite), (s) => concurrentUnitsSerialize(s, 'law/serial', 'first', 'second'))

const leakedUnitLaw: LawRun = () => endedUnitDies(leakedUnitSubject)

const rerunMismatchLaw: LawRun = () =>
  Effect.flatMap(
    seatsEngineRetrySubject((value) => `${value}-rerun`),
    (s) => engineRerunsSerializationFailure(s, 'law/engine', 'settled'),
  )

const rerunOnceLaw: LawRun = () =>
  Effect.flatMap(runsOnceEngine, (s) => engineRerunsSerializationFailure(s, 'law/engine', 'settled'))

const raceUndecidedLaw: LawRun = () => Effect.flatMap(raceFrom(refusingClaim, 1), (s) => race(s, 3))
const raceOversellLaw: LawRun = () => Effect.flatMap(raceFrom(grantingEveryClaim, 1), (s) => race(s, 3))
const raceLostRowLaw: LawRun = () => Effect.flatMap(raceFrom(droppingOneCount, 1), (s) => race(s, 1))

const tripwire = (
  name: string,
  law: LawName,
  run: LawRun,
  broken: Broken,
): Tripwire => ({ name, law, layer: lawSubjectWith({ [law]: run }), broken })

export const tripwires: readonly Tripwire[] = [
  tripwire(
    'a write that escapes its unit',
    'failedUnitWritesNothing',
    escapingLaw,
    Broken.make({ law: FAILED_UNIT_WRITES_NOTHING, witness: 'expected absent, observed "settled"' }),
  ),
  tripwire(
    'a second write swallowed in one order',
    'crossKeyCommute',
    swallowedOrderLaw,
    Broken.make({ law: CROSS_KEY_COMMUTE, witness: 'expected "held"|"held", observed "held"|absent' }),
  ),
  tripwire(
    'a lower key torn in one order',
    'crossKeyCommute',
    tornOrderLaw,
    Broken.make({ law: CROSS_KEY_COMMUTE, witness: 'expected "held"|"held", observed ""|"held"' }),
  ),
  tripwire(
    'a write that tears instead of storing',
    'concurrentUnitsSerialize',
    tornSerialLaw,
    Broken.make({
      law: CONCURRENT_UNITS_SERIAL,
      witness: 'observed "torn", no serial order over "first" or "second" leaves that',
    }),
  ),
  tripwire(
    'a unit leaked past its unit of work',
    'endedUnitDies',
    leakedUnitLaw,
    Broken.make({ law: ENDED_UNIT_DIES, witness: 'the leaked unit ran without dying' }),
  ),
  tripwire(
    'a rerun that commits another value',
    'engineRerunsSerializationFailure',
    rerunMismatchLaw,
    Broken.make({
      law: ENGINE_RERUNS_SERIALIZATION_FAILURE,
      witness: 'expected "settled", observed "settled-rerun"',
    }),
  ),
  tripwire(
    'an engine that never reruns',
    'engineRerunsSerializationFailure',
    rerunOnceLaw,
    Broken.make({
      law: ENGINE_RERUNS_SERIALIZATION_FAILURE,
      witness: 'the unit ran 1 time(s) under a once-armed 40001, not twice',
    }),
  ),
  tripwire(
    'claims that fail before deciding',
    'race',
    raceUndecidedLaw,
    Broken.make({ law: RACE, witness: '3 of 3 claim(s) went undecided' }),
  ),
  tripwire(
    'a cap that grants every claim',
    'race',
    raceOversellLaw,
    Broken.make({ law: RACE, witness: 'granted 3 of 1, cap 1 over 3 claims' }),
  ),
  tripwire(
    'a count that drops a stored row',
    'race',
    raceLostRowLaw,
    Broken.make({ law: RACE, witness: 'stored 0 row(s) after granting 1' }),
  ),
]
