import { UnitOfWork } from '@systemfsoftware/effect-unit-of-work'
import {
  type ClaimDecision,
  type EngineRetrySubject,
  Granted,
  type RaceSubject,
  Refused,
  type StoreSubject,
} from '@systemfsoftware/effect-unit-of-work/laws'
import { postgres, type PostgresUnitFailure, type RetryBudget } from '@systemfsoftware/effect-unit-of-work/postgres'
import { Duration, Effect, Layer, Option, Schedule } from 'effect'
import { dual } from 'effect/Function'
import { SqlClient } from 'effect/sql/SqlClient'
import type { SqlError } from 'effect/sql/SqlError'
import { armSeam, armSeamAlways, armSeamOnce, countUnitRun, unitRuns } from './serialization-seam.fixture.js'

/** The cap a race races for, and the claims it races with — the gap below is what makes the race real. */
export const SEAT_CAP = 20
export const RACE_CLAIMS = 24
const RACE_GAP_SECONDS = 0.02

/** The schedule every Postgres subject retries on: a jittered exponential walk up to 50ms. */
export const adapterSchedule: RetryBudget['schedule'] = Schedule.jittered(
  Schedule.min([Schedule.exponential(Duration.millis(2)), Schedule.spaced(Duration.millis(50))]),
)

const installRaceSeats = Effect.gen(function*() {
  const sql = yield* SqlClient
  yield* sql`CREATE TABLE IF NOT EXISTS race_seats (request text PRIMARY KEY)`
  yield* sql`TRUNCATE race_seats`
}).pipe(Effect.orDie)

export const raceSeatsLayer: Layer.Layer<never, never, SqlClient> = Layer.effectDiscard(installRaceSeats)

/**
 * The seats store a Postgres subject drives: keyed values in `seam_seats` (the same table the
 * serialization seam watches), a deferred-write variant in `deferred_seam_seats` whose seam fires at
 * COMMIT, and the `race_seats` claim the race law races for.
 */
export interface SeatsDriver {
  readonly read: (key: string) => Effect.Effect<Option.Option<string>, SqlError, SqlClient>
  readonly readDeferred: (key: string) => Effect.Effect<Option.Option<string>, SqlError, SqlClient>
  readonly write: (key: string, value: string) => Effect.Effect<void, SqlError, SqlClient>
  readonly writeDeferred: (key: string, value: string) => Effect.Effect<void, SqlError, SqlClient>
  readonly collide: (key: string) => Effect.Effect<void, SqlError, SqlClient>
  readonly isolation: Effect.Effect<string, SqlError, SqlClient>
  readonly claim: (request: string) => Effect.Effect<ClaimDecision, SqlError, SqlClient>
  readonly count: Effect.Effect<number, SqlError, SqlClient>
}

export const seatsDriverOn = (sql: SqlClient): SeatsDriver => ({
  read: (key) =>
    Effect.map(
      sql<{ readonly value: string }>`SELECT value FROM seam_seats WHERE key = ${key}`,
      (rows) => Option.map(Option.fromUndefinedOr(rows[0]), (row) => row.value),
    ),
  readDeferred: (key) =>
    Effect.map(
      sql<{ readonly value: string }>`SELECT value FROM deferred_seam_seats WHERE key = ${key}`,
      (rows) => Option.map(Option.fromUndefinedOr(rows[0]), (row) => row.value),
    ),
  write: (key, value) =>
    sql`INSERT INTO seam_seats (key, value) VALUES (${key}, ${value})
      ON CONFLICT (key) DO UPDATE SET value = excluded.value`.pipe(Effect.asVoid),
  writeDeferred: (key, value) =>
    sql`INSERT INTO deferred_seam_seats (key, value) VALUES (${key}, ${value})
      ON CONFLICT (key) DO UPDATE SET value = excluded.value`.pipe(Effect.asVoid),
  collide: (key) => sql`INSERT INTO seam_seats (key, value) VALUES (${key}, ${key})`.pipe(Effect.asVoid),
  isolation: Effect.map(
    sql<{ readonly isolation: string }>`SELECT current_setting('transaction_isolation') AS isolation`,
    (rows) => Option.match(Option.fromUndefinedOr(rows[0]), { onNone: () => '', onSome: (row) => row.isolation }),
  ),
  claim: (request) =>
    Effect.gen(function*() {
      const rows = yield* sql<{ readonly taken: number }>`SELECT count(*)::int AS taken FROM race_seats`
      const taken = rows[0]?.taken ?? 0
      yield* sql`SELECT pg_sleep(${RACE_GAP_SECONDS})`
      if (taken >= SEAT_CAP) return new Refused({})
      yield* sql`INSERT INTO race_seats (request) VALUES (${request})`
      return new Granted({})
    }),
  count: Effect.map(
    sql<{ readonly taken: number }>`SELECT count(*)::int AS taken FROM race_seats`,
    (rows) => rows[0]?.taken ?? 0,
  ),
})

const provided = <A, E>(sql: SqlClient, effect: Effect.Effect<A, E, SqlClient>): Effect.Effect<A, E> =>
  Effect.provideService(effect, SqlClient, sql)

const inUnit = <A>(
  sql: SqlClient,
  unit: UnitOfWork.Unit<SeatsDriver>,
  f: (seats: SeatsDriver) => Effect.Effect<A, SqlError, SqlClient>,
): Effect.Effect<A, SqlError> => provided(sql, UnitOfWork.use(unit, f))

/**
 * A Postgres subject's failures: the engine's own `SqlError` — what the adapter classifies a run by,
 * so a serialization failure inside the unit re-runs the whole unit instead of surfacing — beside the
 * adapter's own failures.
 */
export type SeatsFailure = SqlError | PostgresUnitFailure

const subjectOf = (
  sql: SqlClient,
  port: UnitOfWork.UnitOfWork<SeatsDriver, PostgresUnitFailure>,
): StoreSubject<SeatsDriver, SeatsFailure> => ({
  unitOfWork: port,
  read: (unit, key) => inUnit(sql, unit, (seats) => seats.read(key)),
  write: (unit, key, value) => inUnit(sql, unit, (seats) => seats.write(key, value)),
})

const raceSubjectOver = (
  sql: SqlClient,
  port: UnitOfWork.UnitOfWork<SeatsDriver, PostgresUnitFailure>,
): RaceSubject<SeatsDriver, SeatsFailure> => ({
  ...subjectOf(sql, port),
  cap: SEAT_CAP,
  claim: (unit, request) => inUnit(sql, unit, (seats) => seats.claim(request)),
  count: (unit) => inUnit(sql, unit, (seats) => seats.count),
})

/** The race subject a Postgres port races for: the seats subject plus the claim and the count. */
export const raceSubjectOf: {
  (
    sql: SqlClient,
    port: UnitOfWork.UnitOfWork<SeatsDriver, PostgresUnitFailure>,
  ): RaceSubject<SeatsDriver, SeatsFailure>
  (
    port: UnitOfWork.UnitOfWork<SeatsDriver, PostgresUnitFailure>,
  ): (sql: SqlClient) => RaceSubject<SeatsDriver, SeatsFailure>
} = dual(2, raceSubjectOver)

/**
 * A Postgres subject: the adapter's port, the laws' subjects over it, the raw driver operations the
 * adapter-specific tests reach for, and the seam's arming and run-count controls. The unit of work
 * counts every run, so a law (or a test) can see how many attempts the engine spent.
 */
export interface PostgresSeats {
  readonly sql: SqlClient
  readonly unitOfWork: UnitOfWork.UnitOfWork<SeatsDriver, PostgresUnitFailure>
  readonly subject: StoreSubject<SeatsDriver, SeatsFailure>
  readonly race: RaceSubject<SeatsDriver, SeatsFailure>
  readonly engine: EngineRetrySubject<SeatsDriver, SeatsFailure>
  readonly raw: {
    readonly read: (unit: UnitOfWork.Unit<SeatsDriver>, key: string) => Effect.Effect<Option.Option<string>, SqlError>
    readonly readDeferred: (
      unit: UnitOfWork.Unit<SeatsDriver>,
      key: string,
    ) => Effect.Effect<Option.Option<string>, SqlError>
    readonly write: (unit: UnitOfWork.Unit<SeatsDriver>, key: string, value: string) => Effect.Effect<void, SqlError>
    readonly writeDeferred: (
      unit: UnitOfWork.Unit<SeatsDriver>,
      key: string,
      value: string,
    ) => Effect.Effect<void, SqlError>
    readonly collide: (unit: UnitOfWork.Unit<SeatsDriver>, key: string) => Effect.Effect<void, SqlError>
    readonly isolation: (unit: UnitOfWork.Unit<SeatsDriver>) => Effect.Effect<string, SqlError>
  }
  readonly runs: Effect.Effect<number>
  readonly arm: (attempts: number) => Effect.Effect<void>
  readonly armOnce: Effect.Effect<void>
  readonly armAlways: Effect.Effect<void>
}

const postgresSeatsOver = (sql: SqlClient, budget: RetryBudget): Effect.Effect<PostgresSeats> =>
  Effect.gen(function*() {
    const port = yield* provided(sql, postgres(seatsDriverOn, budget))
    const unitOfWork: UnitOfWork.UnitOfWork<SeatsDriver, PostgresUnitFailure> = (use) =>
      port((unit) => Effect.andThen(provided(sql, countUnitRun), use(unit)))
    const subject = subjectOf(sql, unitOfWork)
    return {
      sql,
      unitOfWork,
      subject,
      race: raceSubjectOf(sql, unitOfWork),
      engine: {
        ...subject,
        armSerializationFailure: provided(sql, armSeamOnce),
        unitRuns: provided(sql, unitRuns),
      },
      raw: {
        read: (unit, key) => inUnit(sql, unit, (seats) => seats.read(key)),
        readDeferred: (unit, key) => inUnit(sql, unit, (seats) => seats.readDeferred(key)),
        write: (unit, key, value) => inUnit(sql, unit, (seats) => seats.write(key, value)),
        writeDeferred: (unit, key, value) => inUnit(sql, unit, (seats) => seats.writeDeferred(key, value)),
        collide: (unit, key) => inUnit(sql, unit, (seats) => seats.collide(key)),
        isolation: (unit) => inUnit(sql, unit, (seats) => seats.isolation),
      },
      runs: provided(sql, unitRuns),
      arm: (attempts) => provided(sql, armSeam(attempts)),
      armOnce: provided(sql, armSeamOnce),
      armAlways: provided(sql, armSeamAlways),
    }
  })

/** The seats store a Postgres client drives, spending `budget` on each unit. */
export const postgresSeatsFor: {
  (sql: SqlClient, budget: RetryBudget): Effect.Effect<PostgresSeats>
  (budget: RetryBudget): (sql: SqlClient) => Effect.Effect<PostgresSeats>
} = dual(2, postgresSeatsOver)
