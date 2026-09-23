import { layer as pgClientLayer } from '@effect/sql-pg/PgClient'
import { Config, Context, Duration, Effect, Layer, Redacted } from 'effect'
import { Pool } from 'pg'
import { FulfillmentConfig } from '../fulfillment/FulfillmentConfig.js'
import { InventoryStore } from '../inventory/InventoryStore.js'
import { ReservationLog } from '../ports/ReservationLog.js'
import { SettlementStore } from '../ports/SettlementStore.js'
import { DrizzleSession } from './DrizzleSession.js'

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
) {
  static Live: Layer.Layer<
    DrizzleSession | InventoryStore | SettlementStore | ReservationLog | PgRuntime | FulfillmentConfig
  >
}

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
  InventoryStore.Live,
  SettlementStore.Live,
  ReservationLog.Live,
  Layer.succeed(FulfillmentConfig, { maxRetries: 8, retryInterval: Duration.millis(50) }),
)

PgRuntime.Live = ports.pipe(
  Layer.provideMerge(DrizzleSession.Live.pipe(Layer.provide(clientLayer))),
  Layer.provideMerge(rawClient),
  Layer.orDie,
)
