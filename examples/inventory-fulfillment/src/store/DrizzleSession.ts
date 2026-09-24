import type { PgClient } from '@effect/sql-pg/PgClient'
import * as Pglite from '@effect/sql-pglite/PgliteClient'
import { makeWithDefaults as makePglite } from 'drizzle-orm/effect-pglite'
import type { EffectPgDatabase } from 'drizzle-orm/effect-pglite'
import { migrate as migratePglite } from 'drizzle-orm/effect-pglite/migrator'
import { makeWithDefaults as makePostgres } from 'drizzle-orm/effect-postgres'
import { migrate as migratePostgres } from 'drizzle-orm/effect-postgres/migrator'
import { Context, Effect, Layer } from 'effect'

const migrationsFolder = new URL(
  'drizzle/',
  import.meta.resolve('@systemfsoftware/example-inventory-fulfillment/package.json'),
).pathname

export type DrizzleDatabase = EffectPgDatabase

export class DrizzleSession extends Context.Service<DrizzleSession, DrizzleDatabase>()(
  '@systemfsoftware/example-inventory-fulfillment/store/DrizzleSession',
) {}

export const layer: Layer.Layer<DrizzleSession, never, PgClient> = Layer.effect(
  DrizzleSession,
  Effect.gen(function*() {
    const db = yield* makePostgres()
    yield* migratePostgres(db, { migrationsFolder })
    return db
  }),
).pipe(Layer.orDie)

export const layerTest: Layer.Layer<DrizzleSession, never, Pglite.PgliteClient> = Layer.effect(
  DrizzleSession,
  Effect.gen(function*() {
    const db = yield* makePglite()
    yield* migratePglite(db, { migrationsFolder })
    return db
  }),
).pipe(Layer.orDie)
