import { Handle } from '@systemfsoftware/effect-cell-types'
import { UnitOfWork } from '@systemfsoftware/effect-unit-of-work'
import {
  Broken,
  CONCURRENT_UNITS_SERIAL,
  concurrentUnitsSerialize,
  Controls,
  CROSS_KEY_COMMUTE,
  crossKeyCommute,
  ENDED_UNIT_DIES,
  endedUnitDies,
  ENGINE_RERUNS_SERIALIZATION_FAILURE,
  EngineRerun,
  engineRerunsSerializationFailure,
  FAILED_UNIT_WRITES_NOTHING,
  failedUnitWritesNothing,
  Granted,
  JudgeLaw,
  judgeLaw,
  type LawObservation,
  RACE,
  race,
  type RaceSubject,
  type StoreSubject,
  type Verdict,
} from '@systemfsoftware/effect-unit-of-work/laws'
import { retryBudget } from '@systemfsoftware/effect-unit-of-work/postgres'
import { Effect, Layer, Option, Ref } from 'effect'
import * as Result from 'effect/Result'
import { SqlClient } from 'effect/sql/SqlClient'
import {
  type LawFailure,
  type LawName,
  type LawRun,
  LawSubject,
  type LawSubjectShape,
  lawSubjectWith,
} from './law-subject.fixture.js'
import {
  adapterSchedule,
  postgresSeatsFor,
  RACE_CLAIMS,
  raceSubjectOf,
  SEAT_CAP,
  seatsDriverOn,
} from './postgres-seats.fixture.js'
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

/** The budget a race is allowed to spend, and the three runs an always-armed seam costs. */
const RACE_ATTEMPTS = 60
const EXHAUSTION_ATTEMPTS = 3

const rendered = (value: string): string => JSON.stringify(value)

const renderedRead = (observed: Option.Option<string>): string =>
  Option.match(observed, { onNone: () => 'absent', onSome: rendered })

const judged = (law: string, observation: LawObservation): Verdict =>
  Result.getOrThrow(judgeLaw(new JudgeLaw({ law, observation })))

const builtBudget = (attempts: number) => retryBudget(attempts, adapterSchedule).pipe(Effect.orDie)

/**
 * A law-subject Layer whose one law runs against the live Postgres subject the suite owns: the run is
 * built from the ambient `SqlClient`, so the tripwire reaches the same throwaway server.
 */
const postgresTripwire = (
  name: string,
  law: LawName,
  run: (sql: SqlClient) => Effect.Effect<Verdict, LawFailure>,
  broken: Broken,
): Tripwire => ({
  name,
  law,
  broken,
  layer: Layer.effect(
    LawSubject,
    Effect.map(
      Effect.service(SqlClient),
      (sql): LawSubjectShape => ({ runLaw: () => run(sql) }),
    ),
  ),
})

/**
 * The READ COMMITTED control must oversell: every claim reads an empty table, sleeps past the other
 * claims' inserts and writes anyway, so more rows than the cap are stored and the race law says so.
 */
const readCommittedRace = (sql: SqlClient): Effect.Effect<Verdict, LawFailure> =>
  Effect.gen(function*() {
    const port = yield* Effect.provideService(
      Controls.postgresReadCommitted(seatsDriverOn, yield* builtBudget(RACE_ATTEMPTS)),
      SqlClient,
      sql,
    )
    return yield* race(raceSubjectOf(sql, port), RACE_CLAIMS)
  })

/**
 * An always-armed seam on the live server: the engine raises `40001` on every attempt, spends the
 * whole budget, and leaves the unit uncommitted, so the engine law sees three runs and no value.
 */
const exhaustedEngine = (sql: SqlClient): Effect.Effect<Verdict, LawFailure> =>
  Effect.gen(function*() {
    const seats = yield* postgresSeatsFor(sql, yield* builtBudget(EXHAUSTION_ATTEMPTS))
    yield* seats.armAlways
    yield* Effect.exit(seats.unitOfWork((unit) => seats.raw.write(unit, 'law/engine-exhausted', 'settled')))
    const runs = yield* seats.runs
    const observed = yield* seats.unitOfWork((unit) => seats.raw.read(unit, 'law/engine-exhausted'))
    return judged(
      ENGINE_RERUNS_SERIALIZATION_FAILURE,
      new EngineRerun({ runs, expected: rendered('settled'), observed: renderedRead(observed) }),
    )
  })

export type Tripwire = {
  readonly name: string
  readonly law: LawName
  readonly layer: Layer.Layer<LawSubject, never, SqlClient>
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
  postgresTripwire(
    'a unit at READ COMMITTED',
    'race',
    readCommittedRace,
    Broken.make({
      law: RACE,
      witness: `granted ${RACE_CLAIMS} of ${SEAT_CAP}, cap ${SEAT_CAP} over ${RACE_CLAIMS} claims`,
    }),
  ),
  postgresTripwire(
    'an engine that spends its whole budget',
    'engineRerunsSerializationFailure',
    exhaustedEngine,
    Broken.make({
      law: ENGINE_RERUNS_SERIALIZATION_FAILURE,
      witness: `the unit ran ${EXHAUSTION_ATTEMPTS} time(s) under a once-armed 40001, not twice`,
    }),
  ),
]
