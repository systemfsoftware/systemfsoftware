import { layer as pgClientLayer, PgClient } from '@effect/sql-pg/PgClient'
import { makeWithDefaults } from 'drizzle-orm/effect-postgres'
import { migrate } from 'drizzle-orm/effect-postgres/migrator'
import { Config, Context, Effect, Layer, Redacted } from 'effect'
import { Pool } from 'pg'
import { CreditLedger } from '../ports/CreditLedger.js'
import { CustomerGate } from '../ports/CustomerGate.js'
import { InventoryStore } from '../ports/InventoryStore.js'
import { ReservationLog } from '../ports/ReservationLog.js'
import { layer as CreditLedgerDrizzleLayer } from './CreditLedgerDrizzle.js'
import { layer as CustomerGateLayer } from './CustomerGateInMemory.js'
import { DrizzleSession } from './DrizzleSession.js'
import { layer as InventoryStoreDrizzleLayer } from './InventoryStoreDrizzle.js'
import { layer as ReservationLogDrizzleLayer } from './ReservationLogDrizzle.js'

const migrationsFolder = new URL('../../drizzle/', import.meta.url).pathname

const requiredEnv = Effect.all({
  databaseUrl: Config.String('DATABASE_URL'),
  betterAuthSecret: Config.String('BETTER_AUTH_SECRET'),
}).pipe(Effect.orDie)

export interface PgRuntimeService {
  readonly pool: Pool
  readonly betterAuthSecret: string
}

export class PgRuntime extends Context.Service<PgRuntime, PgRuntimeService>()(
  '@systemfsoftware/example-inventory-fulfillment/store/PgRuntime',
) {}

export const rawClient: Layer.Layer<PgRuntime> = Layer.effect(
  PgRuntime,
  Effect.gen(function*() {
    const { databaseUrl, betterAuthSecret } = yield* requiredEnv
    const pool = yield* Effect.acquireRelease(
      Effect.sync(() => new Pool({ connectionString: databaseUrl })),
      (instance) => Effect.promise(() => instance.end()),
    )
    return { pool, betterAuthSecret }
  }),
)

const clientLayer = Layer.unwrap(
  Effect.gen(function*() {
    const { databaseUrl } = yield* requiredEnv
    return pgClientLayer({ url: Redacted.make(databaseUrl) })
  }),
)

const sessionLayer: Layer.Layer<DrizzleSession, never, PgClient> = Layer.effect(
  DrizzleSession,
  Effect.gen(function*() {
    const db = yield* makeWithDefaults()
    yield* migrate(db, { migrationsFolder })
    return db
  }).pipe(Effect.orDie),
)

const ports = Layer.mergeAll(
  InventoryStoreDrizzleLayer,
  CreditLedgerDrizzleLayer,
  ReservationLogDrizzleLayer,
  CustomerGateLayer,
)

export const layer: Layer.Layer<
  DrizzleSession | InventoryStore | CreditLedger | ReservationLog | CustomerGate | PgRuntime
> = ports.pipe(
  Layer.provideMerge(sessionLayer.pipe(Layer.provide(clientLayer))),
  Layer.provideMerge(rawClient),
  Layer.orDie,
)
