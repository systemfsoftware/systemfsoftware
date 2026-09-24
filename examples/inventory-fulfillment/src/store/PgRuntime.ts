import { layer as pgClientLayer } from '@effect/sql-pg/PgClient'
import { Config, Context, Duration, Effect, Layer, Redacted } from 'effect'
import { Pool } from 'pg'
import { FulfillmentConfig } from '../fulfillment/FulfillmentConfig.service.js'
import { InventoryStore } from '../inventory/InventoryStore.service.js'
import { ReservationLog } from '../ports/ReservationLog.service.js'
import { SettlementStore } from '../ports/SettlementStore.service.js'
import { DrizzleSession, layer as drizzleSessionLayer } from './DrizzleSession.js'
import { layer as inventoryStoreLayer } from './InventoryStoreDrizzle.js'
import { layer as reservationLogLayer } from './ReservationLogDrizzle.js'
import { layer as settlementStoreLayer } from './SettlementStoreDrizzle.js'

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

const ports = Layer.mergeAll(
  inventoryStoreLayer,
  settlementStoreLayer,
  reservationLogLayer,
  Layer.succeed(FulfillmentConfig, { maxRetries: 8, retryInterval: Duration.millis(50) }),
)

export const PgRuntimeLive: Layer.Layer<
  DrizzleSession | InventoryStore | SettlementStore | ReservationLog | PgRuntime | FulfillmentConfig
> = ports.pipe(
  Layer.provideMerge(drizzleSessionLayer.pipe(Layer.provide(clientLayer))),
  Layer.provideMerge(rawClient),
  Layer.orDie,
)
