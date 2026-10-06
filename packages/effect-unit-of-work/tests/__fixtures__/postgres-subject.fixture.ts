import * as PgClient from '@effect/sql-pg/PgClient'
import * as PgliteClient from '@effect/sql-pglite/PgliteClient'
import {
  concurrentUnitsSerialize,
  crossKeyCommute,
  endedUnitDies,
  engineRerunsSerializationFailure,
  failedUnitWritesNothing,
  idempotentRead,
  race,
  readAfterWrite,
} from '@systemfsoftware/effect-unit-of-work/laws'
import { retryBudget } from '@systemfsoftware/effect-unit-of-work/postgres'
import { Effect, Layer } from 'effect'
import { SqlClient } from 'effect/sql/SqlClient'
import { type LawName, type LawRun, LawSubject, lawSubjectOf, type LawSubjectShape } from './law-subject.fixture.js'
import {
  adapterSchedule,
  type PostgresSeats,
  postgresSeatsFor,
  RACE_CLAIMS,
  raceSeatsLayer,
} from './postgres-seats.fixture.js'
import { throwawayPostgres } from './postgres-server.fixture.js'
import { serializationSeamLayer } from './serialization-seam.fixture.js'

/** The server subject may spend many runs on a race, so its budget is generous; PGlite's is small. */
const SERVER_ATTEMPTS = 60
const PGLITE_ATTEMPTS = 3

/**
 * The one throwaway PostgreSQL 17 this suite file drives: the server, its schema, and the seam. It is
 * the suite's shared Layer, so the file starts one server and stops it when the suite ends.
 */
export const postgresServerStores: Layer.Layer<PgClient.PgClient | SqlClient, never> = Layer
  .merge(raceSeatsLayer, serializationSeamLayer)
  .pipe(
    Layer.provideMerge(
      Layer.unwrap(
        Effect.map(throwawayPostgres, (url) => PgClient.layer({ url, maxConnections: RACE_CLAIMS * 4 })),
      ),
    ),
    Layer.orDie,
  )

/** Every law a Postgres subject answers for runs against its own seats store. */
const lawRunsOf = (seats: PostgresSeats): Partial<Record<LawName, LawRun>> => ({
  readAfterWrite: () => readAfterWrite(seats.subject, 'law/read-after-write', 'settled'),
  idempotentRead: () => idempotentRead(seats.subject, 'law/idempotent-read', 'settled'),
  crossKeyCommute: () => crossKeyCommute(seats.subject, ['law/left', 'held'], ['law/right', 'held']),
  failedUnitWritesNothing: () => failedUnitWritesNothing(seats.subject, 'law/failed', 'settled'),
  concurrentUnitsSerialize: () => concurrentUnitsSerialize(seats.subject, 'law/serial', 'first', 'second'),
  endedUnitDies: () => endedUnitDies(seats.subject),
  engineRerunsSerializationFailure: () => engineRerunsSerializationFailure(seats.engine, 'law/engine', 'settled'),
})

/** The race law: the claims a race races, over the subject's own port. */
const raceLaw = (seats: PostgresSeats): LawRun => () => race(seats.race, RACE_CLAIMS)

const subjectServing = (
  attempts: number,
  over: (seats: PostgresSeats) => Partial<Record<LawName, LawRun>>,
): Effect.Effect<LawSubjectShape, never, SqlClient> =>
  Effect.gen(function*() {
    const sql = yield* SqlClient
    const seats = yield* postgresSeatsFor(sql, yield* retryBudget(attempts, adapterSchedule))
    return lawSubjectOf({ ...lawRunsOf(seats), ...over(seats) })
  }).pipe(Effect.orDie)

/** The SERIALIZABLE adapter on the suite's live PostgreSQL 17, as one law-subject Layer. */
export const postgresServerSubject: Layer.Layer<LawSubject, never, SqlClient> = Layer.effect(
  LawSubject,
  subjectServing(SERVER_ATTEMPTS, (seats) => ({ race: raceLaw(seats) })),
)

/**
 * The same adapter on PGlite, one wasm Postgres per scenario. PGlite has one connection, so it
 * cannot race; the suite lists `race` among the laws this subject does not answer for.
 */
export const postgresPgliteSubject: Layer.Layer<LawSubject> = Layer
  .effect(LawSubject, subjectServing(PGLITE_ATTEMPTS, () => ({})))
  .pipe(
    Layer.provide(
      Layer.merge(raceSeatsLayer, serializationSeamLayer).pipe(Layer.provideMerge(PgliteClient.layer())),
    ),
    Layer.orDie,
  )
