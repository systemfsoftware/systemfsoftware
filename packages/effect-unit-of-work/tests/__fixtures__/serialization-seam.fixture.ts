import { Effect, Layer } from 'effect'
import { SqlClient } from 'effect/sql/SqlClient'

const installSeam = Effect.gen(function*() {
  const sql = yield* SqlClient
  yield* sql`CREATE TABLE IF NOT EXISTS seam_seats (key text PRIMARY KEY, value text NOT NULL)`
  yield* sql`CREATE TABLE IF NOT EXISTS deferred_seam_seats (key text PRIMARY KEY, value text NOT NULL)`
  yield* sql`CREATE SEQUENCE IF NOT EXISTS serialization_seam_attempts`
  yield* sql`CREATE SEQUENCE IF NOT EXISTS unit_runs`
  yield* sql`CREATE TABLE IF NOT EXISTS serialization_seam_control (id integer PRIMARY KEY, budget bigint NOT NULL)`
  yield* sql`INSERT INTO serialization_seam_control (id, budget) VALUES (1, 0) ON CONFLICT (id) DO NOTHING`
  yield* sql`
    CREATE OR REPLACE FUNCTION serialization_seam_guard() RETURNS trigger AS $$
    BEGIN
      IF nextval('serialization_seam_attempts') <= (SELECT budget FROM serialization_seam_control WHERE id = 1) THEN
        RAISE EXCEPTION 'serialization seam' USING ERRCODE = '40001';
      END IF;
      RETURN NEW;
    END; $$ LANGUAGE plpgsql`
  yield* sql`DROP TRIGGER IF EXISTS serialization_seam_guard ON seam_seats`
  yield* sql`
    CREATE TRIGGER serialization_seam_guard BEFORE INSERT ON seam_seats
    FOR EACH ROW EXECUTE FUNCTION serialization_seam_guard()`
  yield* sql`DROP TRIGGER IF EXISTS deferred_serialization_seam_guard ON deferred_seam_seats`
  yield* sql`
    CREATE CONSTRAINT TRIGGER deferred_serialization_seam_guard AFTER INSERT ON deferred_seam_seats
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION serialization_seam_guard()`
}).pipe(Effect.orDie)

export const serializationSeamLayer: Layer.Layer<never, never, SqlClient> = Layer.effectDiscard(installSeam)

const armedWith = (budget: number): Effect.Effect<void, never, SqlClient> =>
  Effect.gen(function*() {
    const sql = yield* SqlClient
    yield* sql`SELECT setval('serialization_seam_attempts', 1, false)`
    yield* sql`SELECT setval('unit_runs', 1, false)`
    yield* sql`UPDATE serialization_seam_control SET budget = ${budget} WHERE id = 1`
  }).pipe(Effect.orDie)

/** The seam raises `40001` on the first `attempts` inserts it sees, then lets the rest through. */
export const armSeam = (attempts: number): Effect.Effect<void, never, SqlClient> => armedWith(attempts)

export const armSeamOnce: Effect.Effect<void, never, SqlClient> = armSeam(1)

export const armSeamAlways: Effect.Effect<void, never, SqlClient> = armSeam(1000000)

export const disarmSeam: Effect.Effect<void, never, SqlClient> = armSeam(0)

export const countUnitRun: Effect.Effect<void, never, SqlClient> = Effect.gen(function*() {
  const sql = yield* SqlClient
  yield* sql`SELECT nextval('unit_runs')`
}).pipe(Effect.orDie)

export const unitRuns: Effect.Effect<number, never, SqlClient> = Effect.gen(function*() {
  const sql = yield* SqlClient
  const rows = yield* sql<{ readonly runs: number }>`
    SELECT (CASE WHEN is_called THEN last_value ELSE 0 END)::int AS runs FROM unit_runs`
  return rows[0]?.runs ?? 0
}).pipe(Effect.orDie)
