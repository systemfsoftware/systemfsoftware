import * as Pglite from '@effect/sql-pglite/PgliteClient'
import { makeWithDefaults } from 'drizzle-orm/effect-pglite'
import { migrate } from 'drizzle-orm/effect-pglite/migrator'
import { Effect, Layer } from 'effect'
import type { SqlClient } from 'effect/unstable/sql/SqlClient'
import { CreditLedger } from '../ports/CreditLedger.js'
import { CustomerGate } from '../ports/CustomerGate.js'
import { InventoryStore } from '../ports/InventoryStore.js'
import { NowClock } from '../ports/NowClock.js'
import { ReservationLog } from '../ports/ReservationLog.js'
import { layer as ClockLiveLayer } from './ClockLive.js'
import { layer as CreditLedgerDrizzleLayer } from './CreditLedgerDrizzle.js'
import { layer as CustomerGateLayer } from './CustomerGateInMemory.js'
import { DrizzleSession } from './DrizzleSession.js'
import { layer as InventoryStoreDrizzleLayer } from './InventoryStoreDrizzle.js'
import { layer as ReservationLogDrizzleLayer } from './ReservationLogDrizzle.js'

const migrationsFolder = new URL('../../drizzle/', import.meta.url).pathname

const sessionLayer: Layer.Layer<DrizzleSession, never, Pglite.PgliteClient> = Layer.effect(
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
  ClockLiveLayer,
  CustomerGateLayer,
)

export const rawClient: Layer.Layer<Pglite.PgliteClient | SqlClient> = Pglite.layer().pipe(Layer.orDie)

export const layer: Layer.Layer<
  | DrizzleSession
  | InventoryStore
  | CreditLedger
  | ReservationLog
  | NowClock
  | CustomerGate
  | Pglite.PgliteClient
  | SqlClient
> = ports.pipe(
  Layer.provideMerge(sessionLayer),
  Layer.provideMerge(rawClient),
)
