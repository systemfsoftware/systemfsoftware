import * as PgliteClient from '@effect/sql-pglite/PgliteClient'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { UnitOfWork } from '@systemfsoftware/effect-unit-of-work'
import {
  concurrentUnitsSerialize,
  crossKeyCommute,
  endedUnitDies,
  failedUnitWritesNothing,
  Held,
  idempotentRead,
  readAfterWrite,
  type StoreSubject,
} from '@systemfsoftware/effect-unit-of-work/laws'
import { postgres, type RetryBudget } from '@systemfsoftware/effect-unit-of-work/postgres'
import { Context, Duration, Effect, Layer, Match, Option, Schedule } from 'effect'
import * as Result from 'effect/Result'
import { SqlClient } from 'effect/sql/SqlClient'
import { isSqlError, type SqlError, type SqlErrorReason } from 'effect/sql/SqlError'
import {
  armSeamAlways,
  armSeamOnce,
  countUnitRun,
  serializationSeamLayer,
  unitRuns,
} from './__fixtures__/serialization-seam.fixture.js'

const Feature = makeFeature({ it })

const PG_BUDGET: RetryBudget = {
  attempts: 3,
  schedule: Schedule.min([Schedule.exponential(Duration.millis(1)), Schedule.spaced(Duration.millis(10))]),
}

const heldEverywhere = () => ({
  readAfterWrite: Held.make({}),
  idempotentRead: Held.make({}),
  crossKeyCommute: Held.make({}),
  failedUnitWritesNothing: Held.make({}),
  concurrentUnitsSerialize: Held.make({}),
  endedUnitDies: Held.make({}),
})

interface PgSeatsDriver {
  readonly read: (key: string) => Effect.Effect<Option.Option<string>, SqlError, SqlClient>
  readonly write: (key: string, value: string) => Effect.Effect<void, SqlError, SqlClient>
  readonly collide: (key: string) => Effect.Effect<void, SqlError, SqlClient>
  readonly isolation: Effect.Effect<string, SqlError, SqlClient>
}

const pgDriverOn = (sql: SqlClient): PgSeatsDriver => ({
  read: (key) =>
    Effect.map(
      sql<{ readonly value: string }>`SELECT value FROM seam_seats WHERE key = ${key}`,
      (rows) => Option.map(Option.fromUndefinedOr(rows[0]), (row) => row.value),
    ),
  write: (key, value) =>
    sql`INSERT INTO seam_seats (key, value) VALUES (${key}, ${value})
      ON CONFLICT (key) DO UPDATE SET value = excluded.value`.pipe(Effect.asVoid),
  collide: (key) => sql`INSERT INTO seam_seats (key, value) VALUES (${key}, ${key})`.pipe(Effect.asVoid),
  isolation: Effect.map(
    sql<{ readonly isolation: string }>`SELECT current_setting('transaction_isolation') AS isolation`,
    (rows) => Option.match(Option.fromUndefinedOr(rows[0]), { onNone: () => '', onSome: (row) => row.isolation }),
  ),
})

interface PgSeatsService {
  readonly unitOfWork: UnitOfWork.UnitOfWork<PgSeatsDriver>
  readonly subject: StoreSubject<PgSeatsDriver>
  readonly raw: {
    readonly read: (unit: UnitOfWork.Unit<PgSeatsDriver>, key: string) => Effect.Effect<Option.Option<string>, SqlError>
    readonly write: (unit: UnitOfWork.Unit<PgSeatsDriver>, key: string, value: string) => Effect.Effect<void, SqlError>
    readonly collide: (unit: UnitOfWork.Unit<PgSeatsDriver>, key: string) => Effect.Effect<void, SqlError>
    readonly isolation: (unit: UnitOfWork.Unit<PgSeatsDriver>) => Effect.Effect<string, SqlError>
  }
  readonly runs: Effect.Effect<number>
  readonly armOnce: Effect.Effect<void>
  readonly armAlways: Effect.Effect<void>
}

class PgSeats extends Context.Service<PgSeats, PgSeatsService>()(
  '@systemfsoftware/effect-unit-of-work/tests/PgSeats',
) {}

const pgSeatsOf = (sql: SqlClient): Effect.Effect<PgSeatsService> =>
  Effect.gen(function*() {
    const withClient = <A, E>(effect: Effect.Effect<A, E, SqlClient>): Effect.Effect<A, E> =>
      Effect.provideService(effect, SqlClient, sql)
    const inUnit = <A, E>(
      unit: UnitOfWork.Unit<PgSeatsDriver>,
      f: (seats: PgSeatsDriver) => Effect.Effect<A, E, SqlClient>,
    ): Effect.Effect<A, E> => Effect.provideService(UnitOfWork.use(unit, f), SqlClient, sql)
    const unavailable = (cause: SqlError) => new UnitOfWork.StoreUnavailable({ cause })
    const port = yield* Effect.provideService(postgres(pgDriverOn, PG_BUDGET), SqlClient, sql)
    const unitOfWork: UnitOfWork.UnitOfWork<PgSeatsDriver> = (use) =>
      port((unit) => Effect.andThen(withClient(countUnitRun), use(unit)))
    return {
      unitOfWork,
      subject: {
        unitOfWork,
        read: (unit, key) =>
          inUnit(unit, (seats) => seats.read(key)).pipe(
            Effect.catchTag('SqlError', (cause) => Effect.fail(unavailable(cause))),
          ),
        write: (unit, key, value) =>
          inUnit(unit, (seats) => seats.write(key, value)).pipe(
            Effect.catchTag('SqlError', (cause) => Effect.fail(unavailable(cause))),
          ),
      },
      raw: {
        read: (unit, key) => inUnit(unit, (seats) => seats.read(key)),
        write: (unit, key, value) => inUnit(unit, (seats) => seats.write(key, value)),
        collide: (unit, key) => inUnit(unit, (seats) => seats.collide(key)),
        isolation: (unit) => inUnit(unit, (seats) => seats.isolation),
      },
      runs: withClient(unitRuns),
      armOnce: withClient(armSeamOnce),
      armAlways: withClient(armSeamAlways),
    }
  })

const pgliteSeatsLayer = Layer
  .effect(PgSeats, Effect.flatMap(Effect.service(SqlClient), pgSeatsOf))
  .pipe(
    Layer.provide(serializationSeamLayer.pipe(Layer.provideMerge(PgliteClient.layer()))),
    Layer.orDie,
  )

type PgFailure = UnitOfWork.StoreUnavailable | SqlError

const sqlErrorOn = (failure: PgFailure): Option.Option<SqlError> =>
  Match.value(failure).pipe(
    Match.tag('SqlError', (cause) => Option.some(cause)),
    Match.tag('StoreUnavailable', (unavailable) => Option.filter(Option.some(unavailable.cause), isSqlError)),
    Match.exhaustive,
  )

const hasSqlState = (candidate: unknown): candidate is { readonly code: string } =>
  typeof candidate === 'object' && candidate !== null && 'code' in candidate && typeof candidate.code === 'string'

const sqlStateOf = (reason: SqlErrorReason): string => {
  const cause = reason.cause
  return hasSqlState(cause) ? cause.code : 'none'
}

const failureRecord = <A>(outcome: Result.Result<A, PgFailure>) => {
  const found = Option.flatMap(
    Result.match(outcome, { onFailure: Option.some, onSuccess: () => Option.none() }),
    sqlErrorOn,
  )
  return {
    failed: Result.isFailure(outcome),
    reason: Option.match(found, { onNone: () => 'none', onSome: (cause) => cause.reason._tag }),
    sqlState: Option.match(found, { onNone: () => 'none', onSome: (cause) => sqlStateOf(cause.reason) }),
  }
}

const valueNameOf = (observed: Option.Option<string>): string =>
  Option.match(observed, { onNone: () => 'absent', onSome: (value) => value })

Feature('A Postgres store holds its units in one transaction and re-runs the engine-aborted ones', {
  timeout: 120_000,
})
  .live('PGlite is real wasm Postgres: its connection is outside the simulation kernel')
  .withScenarioLayer(pgliteSeatsLayer)
  .body(({ scenario }) => {
    scenario(
      'Every store law holds when the unit runs SERIALIZABLE on Postgres',
      Gherkin.Do.pipe(
        Given('a Postgres store whose units run SERIALIZABLE')('store', () => Effect.service(PgSeats)),
        When('the base and unit laws run against it')('verdicts', (s) =>
          Effect.all({
            readAfterWrite: readAfterWrite(s.store.subject, 'law/1', 'settled'),
            idempotentRead: idempotentRead(s.store.subject, 'law/2', 'settled'),
            crossKeyCommute: crossKeyCommute(s.store.subject, ['law/3', 'held'], ['law/4', 'held']),
            failedUnitWritesNothing: failedUnitWritesNothing(s.store.subject, 'law/5', 'settled'),
            concurrentUnitsSerialize: concurrentUnitsSerialize(s.store.subject, 'law/6', 'first', 'second'),
            endedUnitDies: endedUnitDies(s.store.subject),
          })),
        Then('every law holds')((s, expect) => expect(s.verdicts).toEqual(heldEverywhere())),
      ),
    )

    scenario(
      'The unit reads the isolation level it set',
      Gherkin.Do.pipe(
        Given('a Postgres store whose units run SERIALIZABLE')('store', () => Effect.service(PgSeats)),
        When('a unit reads the transaction isolation setting inside itself')(
          'isolation',
          (s) => s.store.unitOfWork((unit) => s.store.raw.isolation(unit)),
        ),
        Then('the unit reads serializable')((s, expect) => expect(s.isolation).toBe('serializable')),
      ),
    )

    scenario(
      'A once-armed serialization failure re-runs the unit and commits its write',
      Gherkin.Do.pipe(
        Given('a Postgres store whose units run SERIALIZABLE')('store', () => Effect.service(PgSeats)),
        When('a unit writes while the engine raises one 40001')('observed', (s) =>
          Effect.gen(function*() {
            yield* s.store.armOnce
            const written = yield* Effect.result(
              s.store.unitOfWork((unit) => s.store.raw.write(unit, 'seam/once', 'settled')),
            )
            const runs = yield* s.store.runs
            const read = yield* s.store.unitOfWork((unit) => s.store.subject.read(unit, 'seam/once'))
            return { committed: Result.isSuccess(written), runs, value: valueNameOf(read) }
          })),
        Then('the unit ran twice and its write is visible')((s, expect) =>
          expect(s.observed).toEqual({ committed: true, runs: 2, value: 'settled' })
        ),
      ),
    )

    scenario(
      'A seam that never clears spends its budget and leaves nothing written',
      Gherkin.Do.pipe(
        Given('a Postgres store whose units run SERIALIZABLE')('store', () => Effect.service(PgSeats)),
        When('a unit writes while the engine raises 40001 on every attempt')('observed', (s) =>
          Effect.gen(function*() {
            yield* s.store.armAlways
            const written = yield* Effect.result(
              s.store.unitOfWork((unit) => s.store.raw.write(unit, 'seam/exhausted', 'settled')),
            )
            const runs = yield* s.store.runs
            const read = yield* s.store.unitOfWork((unit) => s.store.subject.read(unit, 'seam/exhausted'))
            return { ...failureRecord(written), runs, value: valueNameOf(read) }
          })),
        Then('the unit fails unavailable after three runs with nothing written')((s, expect) =>
          expect(s.observed).toEqual({
            failed: true,
            reason: 'SerializationError',
            sqlState: '40001',
            runs: 3,
            value: 'absent',
          })
        ),
      ),
    )

    scenario(
      'A unique violation inside the unit is not re-run',
      Gherkin.Do.pipe(
        Given('a Postgres store whose units run SERIALIZABLE')('store', () => Effect.service(PgSeats)),
        When('a unit inserts the same key twice')('observed', (s) =>
          Effect.gen(function*() {
            const written = yield* Effect.result(
              s.store.unitOfWork((unit) =>
                Effect.andThen(s.store.raw.collide(unit, 'collide/1'), s.store.raw.collide(unit, 'collide/1'))
              ),
            )
            const runs = yield* s.store.runs
            return { ...failureRecord(written), runs }
          })),
        Then('the unit fails on the unique violation after one run')((s, expect) =>
          expect(s.observed).toEqual({ failed: true, reason: 'UniqueViolation', sqlState: '23505', runs: 1 })
        ),
      ),
    )
  })
