import * as PgliteClient from '@effect/sql-pglite/PgliteClient'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { type PostgresUnitFailure, retryBudget } from '@systemfsoftware/effect-unit-of-work/postgres'
import { Effect, Layer, Match, Option } from 'effect'
import * as Result from 'effect/Result'
import { SqlClient } from 'effect/sql/SqlClient'
import { isSqlError, type SqlError, type SqlErrorReason } from 'effect/sql/SqlError'

import {
  adapterSchedule,
  type PostgresSeats,
  postgresSeatsFor,
  raceSeatsLayer,
} from './__fixtures__/postgres-seats.fixture.js'
import { serializationSeamLayer } from './__fixtures__/serialization-seam.fixture.js'

const Feature = makeFeature({ it })

/**
 * A PGlite Postgres with the seats schema and the serialization seam installed. Each scenario gets a
 * fresh one, so the seam's arming and its run counter never leak between scenarios.
 */
const pgliteStores: Layer.Layer<SqlClient> = Layer
  .merge(raceSeatsLayer, serializationSeamLayer)
  .pipe(Layer.provideMerge(PgliteClient.layer()), Layer.orDie)

/** The seats store over the scenario's client, spending `attempts` runs on a unit. */
const seatsWith = (attempts: number): Effect.Effect<PostgresSeats, never, SqlClient> =>
  Effect.gen(function*() {
    const sql = yield* SqlClient
    return yield* postgresSeatsFor(sql, yield* retryBudget(attempts, adapterSchedule))
  }).pipe(Effect.orDie)

const valueName = (observed: Option.Option<string>): string =>
  Option.match(observed, { onNone: () => 'absent', onSome: (value) => value })

const hasSqlState = (candidate: unknown): candidate is { readonly code: string } =>
  typeof candidate === 'object' && candidate !== null && 'code' in candidate && typeof candidate.code === 'string'

const sqlStateOf = (reason: SqlErrorReason): string => {
  const cause = reason.cause
  return hasSqlState(cause) ? cause.code : 'none'
}

interface FailureShape {
  readonly tag: string
  readonly attempts: number
  readonly reason: string
  readonly sqlState: string
}

const noFailure: FailureShape = { tag: 'none', attempts: 0, reason: 'none', sqlState: 'none' }

const causeShape = (cause: SqlError | undefined): FailureShape =>
  cause === undefined
    ? noFailure
    : { tag: 'none', attempts: 0, reason: cause.reason._tag, sqlState: sqlStateOf(cause.reason) }

/** The engine failure a unit carried, when what it carried was one. */
const engineFailureOf = <A>(cause: A): SqlError | undefined =>
  Option.getOrUndefined(Option.filter(Option.some(cause), isSqlError))

/** What a failed unit reported: its own tag, the runs a spent budget names, and the engine's reason. */
const failedShape = (outcome: Result.Result<void, SqlError | PostgresUnitFailure>): FailureShape =>
  Result.match(outcome, {
    onSuccess: () => noFailure,
    onFailure: (failure) =>
      isSqlError(failure)
        ? { tag: 'SqlError', attempts: 0, reason: failure.reason._tag, sqlState: sqlStateOf(failure.reason) }
        : Match.value(failure).pipe(
          Match.tag('SerializationBudgetExhausted', (spent): FailureShape => ({
            ...causeShape(engineFailureOf(spent.lastCause)),
            tag: 'SerializationBudgetExhausted',
            attempts: spent.attempts,
          })),
          Match.tag('StoreUnavailable', (unavailable): FailureShape => ({
            ...causeShape(engineFailureOf(unavailable.cause)),
            tag: 'StoreUnavailable',
          })),
          Match.tag('UnitInsideTransaction', (): FailureShape => noFailure),
          Match.exhaustive,
        ),
  })

Feature('A Postgres store holds its units in one transaction and re-runs the engine-aborted ones', {
  timeout: 120_000,
})
  .live('PGlite is real wasm Postgres: its connection is outside the simulation kernel')
  .withScenarioLayer(pgliteStores)
  .body(({ scenario }) => {
    scenario(
      'The unit reads the isolation level it set',
      Gherkin.Do.pipe(
        Given('a Postgres store whose units run SERIALIZABLE')('store', () => seatsWith(3)),
        When('a unit reads the transaction isolation setting inside itself')(
          'isolation',
          (s) => s.store.unitOfWork((unit) => s.store.raw.isolation(unit)),
        ),
        Then('the unit reads serializable')((s, expect) => expect(s.isolation).toBe('serializable')),
      ),
    )

    scenario(
      'A serialization failure raised at commit re-runs the unit and commits its write',
      Gherkin.Do.pipe(
        Given('a Postgres store whose units run SERIALIZABLE')('store', () => seatsWith(3)),
        When('a unit writes while the engine refuses the commit once')(
          'observed',
          (s) =>
            Effect.gen(function*() {
              yield* s.store.armOnce
              const written = yield* Effect.result(
                s.store.unitOfWork((unit) => s.store.raw.writeDeferred(unit, 'seam/commit', 'settled')),
              )
              const runs = yield* s.store.runs
              const read = yield* s.store.unitOfWork((unit) => s.store.raw.readDeferred(unit, 'seam/commit'))
              return { committed: Result.isSuccess(written), runs, value: valueName(read) }
            }),
        ),
        Then('the unit ran twice and its write is visible')((s, expect) =>
          expect(s.observed).toEqual({ committed: true, runs: 2, value: 'settled' })
        ),
      ),
    )

    scenario(
      'A seam that never clears spends its budget and names the runs it spent',
      Gherkin.Do.pipe(
        Given('a Postgres store whose units may run three times')('store', () => seatsWith(3)),
        When('a unit writes while the engine raises 40001 on every attempt')(
          'observed',
          (s) =>
            Effect.gen(function*() {
              yield* s.store.armAlways
              const written = yield* Effect.result(
                s.store.unitOfWork((unit) => s.store.raw.write(unit, 'seam/exhausted', 'settled')),
              )
              const runs = yield* s.store.runs
              const read = yield* s.store.unitOfWork((unit) => s.store.subject.read(unit, 'seam/exhausted'))
              return { failure: failedShape(written), runs, value: valueName(read) }
            }),
        ),
        Then('the unit fails naming the three runs it spent and leaves nothing written')((s, expect) =>
          expect(s.observed).toEqual({
            failure: {
              tag: 'SerializationBudgetExhausted',
              attempts: 3,
              reason: 'SerializationError',
              sqlState: '40001',
            },
            runs: 3,
            value: 'absent',
          })
        ),
      ),
    )

    scenario(
      'A budget of one run is spent by a single refusal',
      Gherkin.Do.pipe(
        Given('a Postgres store whose units may run once')('store', () => seatsWith(1)),
        When('a unit writes while the engine refuses it once')(
          'observed',
          (s) =>
            Effect.gen(function*() {
              yield* s.store.armOnce
              const written = yield* Effect.result(
                s.store.unitOfWork((unit) => s.store.raw.write(unit, 'seam/once', 'settled')),
              )
              const runs = yield* s.store.runs
              return { failure: failedShape(written), runs }
            }),
        ),
        Then('the unit fails naming the one run it spent')((s, expect) =>
          expect(s.observed).toEqual({
            failure: {
              tag: 'SerializationBudgetExhausted',
              attempts: 1,
              reason: 'SerializationError',
              sqlState: '40001',
            },
            runs: 1,
          })
        ),
      ),
    )

    scenario(
      'A unique violation inside the unit is not re-run',
      Gherkin.Do.pipe(
        Given('a Postgres store whose units run SERIALIZABLE')('store', () => seatsWith(3)),
        When('a unit inserts the same key twice')(
          'observed',
          (s) =>
            Effect.gen(function*() {
              const written = yield* Effect.result(
                s.store.unitOfWork((unit) =>
                  Effect.andThen(s.store.raw.collide(unit, 'collide/1'), s.store.raw.collide(unit, 'collide/1'))
                ),
              )
              const runs = yield* s.store.runs
              return { failure: failedShape(written), runs }
            }),
        ),
        Then('the unit fails on the unique violation after one run')((s, expect) =>
          expect(s.observed).toEqual({
            failure: { tag: 'StoreUnavailable', attempts: 0, reason: 'UniqueViolation', sqlState: '23505' },
            runs: 1,
          })
        ),
      ),
    )
  })
