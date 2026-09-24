import * as Pglite from '@effect/sql-pglite/PgliteClient'
import { Persistence } from '@systemfsoftware/example-inventory-fulfillment'
import { sql } from 'drizzle-orm/sql'
import { Effect, Layer } from 'effect'

const installSerializationSeam: Effect.Effect<void, never, Persistence.DrizzleSession.DrizzleSession> = Effect
  .gen(function*() {
    const db = yield* Persistence.DrizzleSession.DrizzleSession
    yield* db.execute(sql`CREATE SEQUENCE IF NOT EXISTS serialization_seam_attempts`)
    yield* db.execute(
      sql`CREATE TABLE IF NOT EXISTS serialization_seam_control (id integer PRIMARY KEY, budget bigint NOT NULL)`,
    )
    yield* db.execute(
      sql`INSERT INTO serialization_seam_control (id, budget) VALUES (1, 0) ON CONFLICT (id) DO NOTHING`,
    )
    yield* db.execute(sql`
      CREATE OR REPLACE FUNCTION serialization_seam_guard() RETURNS trigger AS $$
      BEGIN
        IF nextval('serialization_seam_attempts') <= (SELECT budget FROM serialization_seam_control WHERE id = 1) THEN
          RAISE EXCEPTION 'serialization seam' USING ERRCODE = '40001';
        END IF;
        RETURN NEW;
      END; $$ LANGUAGE plpgsql`)
    yield* db.execute(sql`DROP TRIGGER IF EXISTS serialization_seam_guard ON audit_events`)
    yield* db.execute(sql`
      CREATE TRIGGER serialization_seam_guard BEFORE INSERT ON audit_events
      FOR EACH ROW EXECUTE FUNCTION serialization_seam_guard()`)
  })
  .pipe(Effect.orDie)

export const serializationSeamLayer: Layer.Layer<never, never, Persistence.DrizzleSession.DrizzleSession> = Layer
  .effectDiscard(installSerializationSeam)

const armSeam = (
  budget: number,
): Effect.Effect<void, never, Persistence.DrizzleSession.DrizzleSession> =>
  Effect.gen(function*() {
    const db = yield* Persistence.DrizzleSession.DrizzleSession
    yield* db.execute(sql`SELECT setval('serialization_seam_attempts', 1, false)`)
    yield* db.execute(sql`UPDATE serialization_seam_control SET budget = ${budget} WHERE id = 1`)
  }).pipe(Effect.orDie)

export const armSeamOnce: Effect.Effect<void, never, Persistence.DrizzleSession.DrizzleSession> = armSeam(1)

export const armSeamAlways: Effect.Effect<void, never, Persistence.DrizzleSession.DrizzleSession> = armSeam(1000000)

export const disarmSeam: Effect.Effect<void, never, Persistence.DrizzleSession.DrizzleSession> = armSeam(0)

export const seamTestWorld: Layer.Layer<Persistence.DrizzleSession.DrizzleSession> = Persistence
  .DrizzleSession.layerTest.pipe(Layer.provideMerge(Pglite.layer().pipe(Layer.orDie)))
