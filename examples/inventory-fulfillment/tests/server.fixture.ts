/**
 * U9 — sociable integration fixture: real wire, real DB, real auth.
 *
 * Boots the committed production composition root (`src/http/server.ts`) over the
 * real PGlite-backed drizzle stack (`src/store/PgTest.layer.ts`) and the real
 * better-auth routes, on an ephemeral port. Nothing here is mocked: the persistence
 * ports are the drizzle-backed layers, auth is the better-auth handler mounted at
 * `/api/auth/*`, and the RPC transport is `effect/unstable/rpc` over HTTP.
 *
 * Two seams exist for determinism, both mutating real state:
 *  - the seam-instrumented `InventoryStore` bumps the stock row version with real
 *    SQL between a sandwich's read and write, driving the CAS conflict path.
 *  - auth helpers sign users up and in through the real `/api/auth` endpoints with
 *    per-run generated credentials.
 */
import { NodeHttpClient } from '@effect/platform-node'
import * as Pglite from '@effect/sql-pglite/PgliteClient'
import type { PGlite } from '@electric-sql/pglite'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { eq } from 'drizzle-orm/sql/expressions/conditions'
import { Context, DateTime, Effect, Layer, Match, Option, Ref, Schema as S } from 'effect'
import type * as Scope from 'effect/Scope'
import { Cookies, HttpClient, HttpClientRequest, HttpServer } from 'effect/unstable/http'
import { httpServerLayer, layer as serverLayer } from '../src/http/server.js'
import { AuthService } from '../src/ports/AuthService.js'
import { InventoryStore } from '../src/ports/InventoryStore.js'
import { make as makeRpcClient } from '../src/rpc/client.js'
import type { Client as RpcClientHandle } from '../src/rpc/client.js'
import { SubmitOrderRequest } from '../src/rpc/inventory-fulfillment.schema.js'
import { makeAuth } from '../src/store/AuthServiceLive.js'
import { DrizzleSession } from '../src/store/DrizzleSession.js'
import type { DrizzleDatabase } from '../src/store/DrizzleSession.js'
import { layer as pgTestLayer } from '../src/store/PgTest.layer.js'
import { auditEvents, reservations, stockLots, user, warehouses } from '../src/store/schema.tables.js'

export {
  AllocatedSplit,
  AllocatedWithOverdraft,
  Backordered,
  ConflictRollback,
  CreditHold,
  CreditLimitExceeded,
  DuplicateOrder,
  Forbidden,
  InsufficientStock,
  Unauthorized,
} from '../src/domain/decision.schema.js'
export type { FulfillmentDecision, FulfillmentError } from '../src/domain/decision.schema.js'
export type { Client } from '../src/rpc/client.js'
export { ReservationView, StockView } from '../src/rpc/inventory-fulfillment.schema.js'

// ---------------------------------------------------------------------------
// Unique identifiers and credentials (no fixed strings anywhere)
// ---------------------------------------------------------------------------

let sequence = 0
const nextId = (prefix: string): string => {
  sequence += 1
  return `${prefix}-${process.pid.toString(36)}-${sequence}`
}

export const uniqueId = nextId
export const uniqueEmail = (): string => `${nextId('user')}@example.test`
export const uniquePassword = (): string => `pw-${nextId('secret')}`

// ---------------------------------------------------------------------------
// Conflict seam — real SQL bump between read and write
// ---------------------------------------------------------------------------

type SeamMode = 'off' | 'once' | 'always'

export interface ConflictSeamService {
  readonly armOnce: Effect.Effect<void>
  readonly armAlways: Effect.Effect<void>
  readonly disarm: Effect.Effect<void>
  readonly shouldBump: Effect.Effect<boolean>
}

export class ConflictSeam extends Context.Service<ConflictSeam, ConflictSeamService>()(
  '@systemfsoftware/example-inventory-fulfillment/tests/ConflictSeam',
) {}

const conflictSeamLayer: Layer.Layer<ConflictSeam> = Layer.effect(
  ConflictSeam,
  Effect.gen(function*() {
    const mode = yield* Ref.make<SeamMode>('off')
    return {
      armOnce: Ref.set(mode, 'once'),
      armAlways: Ref.set(mode, 'always'),
      disarm: Ref.set(mode, 'off'),
      shouldBump: Ref.modify(mode, (current): readonly [boolean, SeamMode] =>
        Match.value(current).pipe(
          Match.when('always', () => [true, 'always'] as const),
          Match.when('once', () => [true, 'off'] as const),
          Match.when('off', () => [false, 'off'] as const),
          Match.exhaustive,
        )),
    }
  }),
)

const bumpStockVersions = (db: DrizzleDatabase): Effect.Effect<void, never> =>
  db.execute(sql`UPDATE stock_lots SET version = version + 1`).pipe(Effect.orDie, Effect.asVoid)

const seamInstrumentedInventoryStore: Layer.Layer<InventoryStore, never, DrizzleSession | ConflictSeam> = pgTestLayer
  .pipe(
    Layer.flatMap((context) => {
      const inner = Context.get(context, InventoryStore)
      return Layer.effect(
        InventoryStore,
        Effect.gen(function*() {
          const db = yield* DrizzleSession
          const seam = yield* ConflictSeam
          return {
            readAllStock: Effect.gen(function*() {
              const partitions = yield* inner.readAllStock
              const bump = yield* seam.shouldBump
              yield* bump ? bumpStockVersions(db) : Effect.void
              return partitions
            }),
            readStock: (skus) => inner.readStock(skus),
            readStockPage: (query) => inner.readStockPage(query),
          }
        }),
      )
    }),
  )

// The wrapper's `InventoryStore` must win the `Context.merge` inside
// `provideMerge`: `provideMerge` keeps `self` (the wrapper). Both layers build the
// same memoized `pgTestLayer`, so the wrapper and the foundation share one database.
const wrappedFoundation = seamInstrumentedInventoryStore.pipe(Layer.provideMerge(pgTestLayer))

// ---------------------------------------------------------------------------
// Auth — better-auth over a promise-mode drizzle view of the same PGlite client
// ---------------------------------------------------------------------------

const authSecret = (): string => `${crypto.randomUUID()}${crypto.randomUUID()}`

const authLayer: Layer.Layer<AuthService, never, Pglite.PgliteClient> = Layer.effect(
  AuthService,
  Effect.gen(function*() {
    const raw = yield* Pglite.PgliteClient
    const promiseDb = drizzle({ client: raw.pglite as PGlite })
    return makeAuth(promiseDb, authSecret())
  }),
)

// ---------------------------------------------------------------------------
// Test server service
// ---------------------------------------------------------------------------

export interface Session {
  readonly userId: string
  readonly cookie: string
}

export interface StockLotInput {
  readonly id: string
  readonly sku: string
  readonly warehouseId: string
  readonly quantity: number
  readonly version?: number
  readonly expiresAt?: DateTime.Utc
}

export interface CreditInput {
  readonly userId: string
  readonly tier: 'VIP' | 'Standard'
  readonly creditLimit: number
  readonly outstandingBalance?: number
  readonly overdraftPrivilege?: number
}

export interface ReservationRow {
  readonly orderId: string
  readonly customerId: string
  readonly sku: string
  readonly warehouseId: string
  readonly lotId: string
  readonly quantity: number
}

export interface StockState {
  readonly quantityOnHand: number
  readonly version: number
}

export interface SeedService {
  readonly warehouse: (id: string, region: string) => Effect.Effect<void>
  readonly stockLot: (input: StockLotInput) => Effect.Effect<void>
  readonly credit: (input: CreditInput) => Effect.Effect<void>
}

export interface InspectService {
  readonly stock: (lotId: string) => Effect.Effect<StockState>
  readonly reservations: (orderId: string) => Effect.Effect<readonly ReservationRow[]>
  readonly auditTags: (orderId: string) => Effect.Effect<readonly string[]>
}

export interface TestServerService {
  readonly baseUrl: string
  readonly signUp: (email: string, password: string, name: string) => Effect.Effect<Session>
  readonly signIn: (email: string, password: string) => Effect.Effect<Session>
  readonly client: (cookie?: string) => Effect.Effect<RpcClientHandle, never, Scope.Scope>
  readonly seam: ConflictSeamService
  readonly seed: SeedService
  readonly inspect: InspectService
}

export class TestServer extends Context.Service<TestServer, TestServerService>()(
  '@systemfsoftware/example-inventory-fulfillment/tests/TestServer',
) {}

export interface SubmitOrderInput {
  readonly orderId: string
  readonly lines: readonly { readonly sku: string; readonly quantity: number }[]
  readonly kits?: readonly {
    readonly kitSku: string
    readonly components: readonly { readonly sku: string; readonly quantity: number }[]
  }[]
  readonly fraudRisk?: number
}

export const submitRequest = (input: SubmitOrderInput): Effect.Effect<SubmitOrderRequest> =>
  S.decodeEffect(SubmitOrderRequest)({
    orderId: input.orderId,
    lines: input.lines,
    kits: input.kits ?? [],
    fraudRisk: input.fraudRisk ?? 0,
  }).pipe(Effect.orDie)

const cookieHeaderOf = (cookies: Cookies.Cookies): string => {
  const header = Cookies.toCookieHeader(cookies)
  if (header.length === 0) {
    throw new Error('auth: response carried no session cookie')
  }
  return header
}

const userFromSession = (json: unknown): string => {
  const session = json as { readonly user?: { readonly id?: string } } | null
  const id = session?.user?.id
  if (typeof id !== 'string') {
    throw new Error('auth: get-session did not return a user')
  }
  return id
}

type BuildContext = HttpServer.HttpServer | HttpClient.HttpClient | DrizzleSession | ConflictSeam

const buildService = (context: Context.Context<BuildContext>): TestServerService => {
  const server = Context.get(context, HttpServer.HttpServer)
  const http = Context.get(context, HttpClient.HttpClient)
  const db = Context.get(context, DrizzleSession)
  const seam = Context.get(context, ConflictSeam)
  const baseUrl = HttpServer.formatAddress(server.address)

  const execute = (request: HttpClientRequest.HttpClientRequest) => http.execute(request).pipe(Effect.orDie)

  const post = (path: string, body: unknown) =>
    Effect.gen(function*() {
      const request = HttpClientRequest.post(`${baseUrl}${path}`).pipe(HttpClientRequest.bodyJsonUnsafe(body))
      const response = yield* execute(request)
      if (response.status < 200 || response.status >= 300) {
        return yield* Effect.die(new Error(`auth ${path} failed with status ${response.status}`))
      }
      return response
    })

  const resolveUserId = (cookie: string) =>
    Effect.gen(function*() {
      const request = HttpClientRequest.get(`${baseUrl}/api/auth/get-session`).pipe(
        HttpClientRequest.setHeader('cookie', cookie),
      )
      const response = yield* execute(request)
      const json = yield* response.json.pipe(Effect.orDie)
      return userFromSession(json)
    })

  const authenticate = (path: string, body: unknown): Effect.Effect<Session> =>
    Effect.gen(function*() {
      const response = yield* post(path, body)
      const cookie = cookieHeaderOf(response.cookies)
      const userId = yield* resolveUserId(cookie)
      return { userId, cookie }
    })

  const client = (cookie?: string): Effect.Effect<RpcClientHandle, never, Scope.Scope> =>
    makeRpcClient({ baseUrl, cookie }).pipe(Effect.provideService(HttpClient.HttpClient, http))

  const stockRow = (lotId: string) =>
    Effect.gen(function*() {
      const rows = yield* db.select().from(stockLots).where(eq(stockLots.id, lotId)).pipe(Effect.orDie)
      const found = Option.fromUndefinedOr(rows[0])
      return yield* Option.match(found, {
        onNone: () => Effect.die(new Error(`inspect: no stock lot ${lotId}`)),
        onSome: (row) => Effect.succeed(row),
      })
    })

  return {
    baseUrl,
    seam,
    signUp: (email, password, name) => authenticate('/api/auth/sign-up/email', { email, password, name }),
    signIn: (email, password) => authenticate('/api/auth/sign-in/email', { email, password }),
    client,
    seed: {
      warehouse: (id, region) => db.insert(warehouses).values({ id, region }).pipe(Effect.orDie, Effect.asVoid),
      stockLot: (input) =>
        db.insert(stockLots).values({
          id: input.id,
          sku: input.sku,
          warehouseId: input.warehouseId,
          quantityOnHand: input.quantity,
          version: input.version ?? 1,
          expiresAt: input.expiresAt === undefined ? null : DateTime.toDate(input.expiresAt),
        }).pipe(Effect.orDie, Effect.asVoid),
      credit: (input) =>
        db.update(user).set({
          tier: input.tier,
          creditLimit: input.creditLimit,
          outstandingBalance: input.outstandingBalance ?? 0,
          overdraftPrivilege: input.overdraftPrivilege ?? 0,
        }).where(eq(user.id, input.userId)).pipe(Effect.orDie, Effect.asVoid),
    },
    inspect: {
      stock: (lotId) =>
        Effect.map(stockRow(lotId), (row) => ({ quantityOnHand: row.quantityOnHand, version: row.version })),
      reservations: (orderId) =>
        Effect.map(
          db.select().from(reservations).where(eq(reservations.orderId, orderId)).pipe(Effect.orDie),
          (rows) =>
            rows.map((row) => ({
              orderId: row.orderId,
              customerId: row.customerId,
              sku: row.sku,
              warehouseId: row.warehouseId,
              lotId: row.lotId,
              quantity: row.quantity,
            })),
        ),
      auditTags: (orderId) =>
        Effect.map(
          db.select().from(auditEvents).where(eq(auditEvents.orderId, orderId)).pipe(Effect.orDie),
          (rows) => rows.map((row) => row.decisionTag),
        ),
    },
  }
}

// Force the HTTP server to bind an ephemeral port so suites never collide with a
// dev server; the bound port is read back from `HttpServer.address` above.
process.env['PORT'] = '0'

const appLayer = serverLayer.pipe(
  Layer.provide(authLayer),
  Layer.provideMerge(wrappedFoundation),
  Layer.provideMerge(conflictSeamLayer),
)

const fullLayer = Layer.mergeAll(appLayer, httpServerLayer, NodeHttpClient.layerUndici).pipe(Layer.orDie)

export const TestServerLayer: Layer.Layer<TestServer> = fullLayer.pipe(
  Layer.flatMap((context) => Layer.succeed(TestServer, buildService(context))),
)
